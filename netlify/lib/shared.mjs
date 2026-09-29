import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import seedProducts from './seed-products.mjs';

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Netlify functions accept ~6 MB per request

// "strong" consistency so an edit shows up immediately on the next read.
export const dataStore = () => getStore({ name: 'store-data', consistency: 'strong' });
export const imageStore = () => getStore({ name: 'product-images', consistency: 'strong' });

/* ---------- Responses ---------- */

export function json(status, body, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...headers,
        },
    });
}

/* ---------- Products ---------- */

export async function loadProducts() {
    const saved = await dataStore().get('products', { type: 'json' });
    return Array.isArray(saved) ? saved : structuredClone(seedProducts);
}

export async function saveProducts(products) {
    await dataStore().setJSON('products', products);
}

export function slugify(s) {
    return String(s).toLowerCase().replace(/["']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

export function uniqueId(products, base) {
    let id = base, n = 2;
    while (products.some(p => p.id === id)) id = `${base}-${n++}`;
    return id;
}

// Validate and clean a product coming from the admin page.
export function cleanProduct(input) {
    const errors = [];
    const str = (v, max) => String(v ?? '').trim().slice(0, max);

    const name = str(input.name, 120);
    if (!name) errors.push('Name is required.');

    const category = str(input.category, 40) || 'Other';

    const price = Math.round(Number(input.price) * 100) / 100;
    if (input.price === '' || !Number.isFinite(price) || price < 0 || price > 100000) {
        errors.push('Price must be a number (0 or more).');
    }

    const description = str(input.description, 1000);

    const image = str(input.image, 300);
    if (image && !/^(\/uploads\/[a-z0-9._-]+|images\/[a-zA-Z0-9._\/-]+|https:\/\/[^\s'"()<>]+)$/.test(image)) {
        errors.push('Image must be an uploaded file, a path in images/, or an https:// link.');
    }

    let sizes = Array.isArray(input.sizes) ? input.sizes : String(input.sizes || '').split(',');
    sizes = [...new Set(sizes.map(s => str(s, 12)).filter(Boolean))].slice(0, 20);

    const variants = {};
    const rawVariants = input.variants && typeof input.variants === 'object' ? input.variants : {};
    for (const key of (sizes.length ? sizes : ['default'])) {
        const v = str(rawVariants[key], 30);
        if (v && !/^\d+$/.test(v)) errors.push(`Shopify variant ID for "${key}" should be numbers only.`);
        if (v) variants[key] = v;
    }

    return {
        errors,
        product: {
            name, category, price, image, description, sizes, variants,
            soldOut: Boolean(input.soldOut),
            hidden: Boolean(input.hidden),
        },
    };
}

/* ---------- Login sessions (signed cookie, no server memory needed) ---------- */

function secret() {
    // Changing ADMIN_PASSWORD (or SESSION_SECRET) logs everyone out.
    return crypto.createHash('sha256')
        .update(`${process.env.SESSION_SECRET || ''}|${process.env.ADMIN_PASSWORD || ''}|cs-merch-admin`)
        .digest();
}

function sign(value) {
    return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

export function makeSessionToken() {
    const payload = `${Math.floor(Date.now() / 1000) + SESSION_TTL_SEC}.${crypto.randomBytes(8).toString('hex')}`;
    return `${payload}.${sign(payload)}`;
}

export function isAuthed(req) {
    if (!process.env.ADMIN_PASSWORD) return false;
    const token = parseCookies(req).admin_session;
    if (!token) return false;
    const i = token.lastIndexOf('.');
    if (i < 0) return false;
    const payload = token.slice(0, i);
    const given = Buffer.from(token.slice(i + 1));
    const expected = Buffer.from(sign(payload));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
    return Number(payload.split('.')[0]) > Date.now() / 1000;
}

export function passwordMatches(given) {
    const a = crypto.createHash('sha256').update(String(given)).digest();
    const b = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || crypto.randomBytes(16)).digest();
    return crypto.timingSafeEqual(a, b);
}

export function sessionCookie(token, maxAge) {
    return `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function parseCookies(req) {
    const out = {};
    (req.headers.get('cookie') || '').split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
    return out;
}

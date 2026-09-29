import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import seedProducts from './seed-products.mjs';
import seedSettings from './seed-settings.mjs';

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

/* ---------- Site content (settings) ---------- */

export const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD'];
const MENU_TYPES = ['buy', 'cart', 'info', 'welcome', 'link'];

export async function loadSettings() {
    const saved = await dataStore().get('settings', { type: 'json' });
    return saved && typeof saved === 'object' ? saved : structuredClone(seedSettings);
}

export async function saveSettings(settings) {
    await dataStore().setJSON('settings', settings);
}

// What the public store needs. Promo codes stay private (checked with /api/promo).
export function publicSettings(s) {
    const { promoCodes, ...commerce } = s.commerce;
    return { ...s, commerce };
}

export function promoLabel(p, currency = 'USD') {
    if (p.type === 'percent') return `${p.value}% off`;
    const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(p.value);
    return `${amount.replace(/\.00$/, '')} off`;
}

// Links may be https/http, mailto:, tel:, or a path on this site.
function safeLink(v) {
    const s = String(v ?? '').trim().slice(0, 500);
    if (!s) return '';
    return /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[+0-9() .-]+|\/[^\s<>"']*)$/i.test(s) ? s : null;
}

export function cleanSettings(input) {
    const errors = [];
    const str = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const arr = (v) => (Array.isArray(v) ? v : []);
    const num = (v, label, max) => {
        const n = Math.round(Number(v) * 100) / 100;
        if (v === '' || v === null || !Number.isFinite(n) || n < 0 || n > max) { errors.push(`${label} must be a number (0 or more).`); return 0; }
        return n;
    };

    const site = obj(input.site);
    const cleanSite = {
        name: str(site.name, 60),
        tagline: str(site.tagline, 120),
        pageTitle: str(site.pageTitle, 120),
        metaDescription: str(site.metaDescription, 300),
        footer: str(site.footer, 300),
    };
    if (!cleanSite.name) errors.push('Store name is required.');

    const menu = arr(input.menu).slice(0, 12).map((m, i) => {
        m = obj(m);
        const type = MENU_TYPES.includes(m.type) ? m.type : 'link';
        const item = { type, label: str(m.label, 40), visible: m.visible !== false };
        if (!item.label) errors.push(`Menu item ${i + 1} needs a label.`);
        if (type === 'link') {
            const url = safeLink(m.url);
            if (!url) errors.push(`Menu link "${item.label || i + 1}" needs a valid link (https://..., mailto:, tel:, or /page).`);
            item.url = url || '';
            item.newTab = Boolean(m.newTab);
        }
        return item;
    });
    // Built-in items can be hidden but not duplicated.
    const seen = new Set();
    const dedupedMenu = menu.filter(m => m.type === 'link' || (!seen.has(m.type) && seen.add(m.type)));

    const w = obj(input.welcome);
    const welcome = {
        showOnFirstVisit: w.showOnFirstVisit !== false,
        windowTitle: str(w.windowTitle, 40) || 'Welcome',
        mapName: str(w.mapName, 40),
        headline: str(w.headline, 120),
        body: str(w.body, 2000),
        perks: arr(w.perks).map(p => str(p, 160)).filter(Boolean).slice(0, 10),
        hint: str(w.hint, 200),
        startLabel: str(w.startLabel, 20) || 'Start',
    };

    const info = obj(input.info);
    const tabs = arr(info.tabs).slice(0, 8).map((t, i) => {
        t = obj(t);
        const tab = {
            title: str(t.title, 24),
            body: str(t.body, 3000),
            table: arr(t.table).slice(0, 30).map(row => arr(row).slice(0, 6).map(c => str(c, 40))).filter(r => r.some(Boolean)),
            note: str(t.note, 300),
        };
        if (!tab.title) errors.push(`Store info tab ${i + 1} needs a title.`);
        return tab;
    });
    if (!tabs.length) errors.push('Store info needs at least one tab.');

    const c = obj(input.commerce);
    const shopifyDomain = str(c.shopifyDomain, 120).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (shopifyDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(shopifyDomain)) errors.push('Shopify domain looks wrong (example: your-store.myshopify.com).');

    const codes = new Set();
    const promoCodes = arr(c.promoCodes).slice(0, 50).map(p => {
        p = obj(p);
        const code = str(p.code, 30).toUpperCase().replace(/\s+/g, '');
        const type = p.type === 'fixed' ? 'fixed' : 'percent';
        const value = num(p.value, `Promo ${code || ''} amount`, type === 'percent' ? 100 : 100000);
        if (!/^[A-Z0-9_-]+$/.test(code)) errors.push(`Promo code "${code}" can only use letters, numbers, - and _.`);
        if (codes.has(code)) errors.push(`Promo code ${code} is listed twice.`);
        codes.add(code);
        return { code, type, value };
    }).filter(p => p.code);

    const commerce = {
        currency: CURRENCIES.includes(c.currency) ? c.currency : 'USD',
        flatRate: num(c.flatRate, 'Flat shipping rate', 10000),
        freeOver: num(c.freeOver, 'Free shipping amount', 1000000),
        shopifyDomain,
        promoCodes,
    };

    return {
        errors,
        settings: {
            site: cleanSite,
            menu: dedupedMenu,
            welcome,
            info: { windowTitle: str(info.windowTitle, 40) || 'Store Info', tabs },
            commerce,
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

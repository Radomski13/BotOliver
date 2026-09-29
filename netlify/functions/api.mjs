import crypto from 'node:crypto';
import {
    json, loadProducts, saveProducts, cleanProduct, slugify, uniqueId,
    isAuthed, passwordMatches, makeSessionToken, sessionCookie, SESSION_TTL_SEC,
    dataStore, imageStore, MAX_IMAGE_BYTES,
    loadSettings, saveSettings, cleanSettings, publicSettings, promoLabel,
} from '../lib/shared.mjs';

export const config = { path: '/api/*' };

export default async (req, context) => {
    try {
        return await route(req, context);
    } catch (err) {
        console.error(err);
        return json(err.status || 500, { error: err.status ? err.message : 'Server error' });
    }
};

async function readJson(req) {
    try { return await req.json(); }
    catch { throw Object.assign(new Error('Invalid request'), { status: 400 }); }
}

async function route(req, context) {
    const method = req.method;
    const p = new URL(req.url).pathname.replace(/\/+$/, '');

    // Public: products for the store (hidden ones left out).
    if (method === 'GET' && p === '/api/products') {
        const products = await loadProducts();
        return json(200, products.filter(pr => !pr.hidden).map(({ hidden, ...rest }) => rest));
    }

    // Public: everything the store page needs in one request.
    if (method === 'GET' && p === '/api/store') {
        const [products, settings] = await Promise.all([loadProducts(), loadSettings()]);
        return json(200, {
            settings: publicSettings(settings),
            products: products.filter(pr => !pr.hidden).map(({ hidden, ...rest }) => rest),
        });
    }

    // Public: check a promo code without exposing the full list.
    if (method === 'POST' && p === '/api/promo') {
        const { code } = await readJson(req);
        const wanted = String(code || '').trim().toUpperCase();
        const settings = await loadSettings();
        const match = settings.commerce.promoCodes.find(pc => pc.code === wanted);
        if (!match) return json(200, { valid: false, error: 'Invalid code. Nice try.' });
        return json(200, { valid: true, ...match, label: promoLabel(match, settings.commerce.currency) });
    }

    if (method === 'GET' && p === '/api/session') {
        return json(200, { authed: isAuthed(req), configured: Boolean(process.env.ADMIN_PASSWORD) });
    }

    if (method === 'POST' && p === '/api/login') {
        if (!process.env.ADMIN_PASSWORD) {
            return json(503, { error: 'Admin password is not set. Add ADMIN_PASSWORD in Netlify: Site configuration > Environment variables, then redeploy.' });
        }

        // Lock out an IP for 15 minutes after 10 wrong passwords.
        const ip = context.ip || 'unknown';
        const key = 'login-attempts/' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
        const store = dataStore();
        let rec = (await store.get(key, { type: 'json' })) || { count: 0, resetAt: 0 };
        if (rec.resetAt < Date.now()) rec = { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
        if (rec.count >= 10) return json(429, { error: 'Too many attempts. Try again in 15 minutes.' });

        const body = await readJson(req);
        if (!passwordMatches(body.password || '')) {
            rec.count++;
            await store.setJSON(key, rec);
            return json(401, { error: 'Wrong password.' });
        }
        await store.delete(key);
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(makeSessionToken(), SESSION_TTL_SEC) });
    }

    if (method === 'POST' && p === '/api/logout') {
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }

    // Everything below needs a logged-in admin.
    if (!p.startsWith('/api/admin/')) return json(404, { error: 'Not found' });
    if (!isAuthed(req)) return json(401, { error: 'Not logged in.' });

    if (method === 'GET' && p === '/api/admin/settings') {
        return json(200, await loadSettings());
    }

    if (method === 'PUT' && p === '/api/admin/settings') {
        const { errors, settings } = cleanSettings(await readJson(req));
        if (errors.length) return json(400, { error: errors.join(' ') });
        await saveSettings(settings);
        return json(200, settings);
    }

    if (method === 'GET' && p === '/api/admin/products') {
        return json(200, await loadProducts());
    }

    if (method === 'POST' && p === '/api/admin/products') {
        const { errors, product } = cleanProduct(await readJson(req));
        if (errors.length) return json(400, { error: errors.join(' ') });
        const products = await loadProducts();
        const created = { id: uniqueId(products, slugify(product.name)), ...product };
        products.push(created);
        await saveProducts(products);
        return json(201, created);
    }

    if (method === 'POST' && p === '/api/admin/products/reorder') {
        const { ids } = await readJson(req);
        const products = await loadProducts();
        if (!Array.isArray(ids) || ids.length !== products.length || new Set(ids).size !== ids.length ||
            !ids.every(id => products.some(pr => pr.id === id))) {
            return json(400, { error: 'Product list changed. Refresh the page and try again.' });
        }
        const reordered = ids.map(id => products.find(pr => pr.id === id));
        await saveProducts(reordered);
        return json(200, reordered);
    }

    if (method === 'POST' && p === '/api/admin/upload') {
        const type = (req.headers.get('content-type') || '').split(';')[0].trim();
        const extByType = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
        const ext = extByType[type];
        if (!ext) return json(400, { error: 'Upload a PNG, JPG, WEBP or GIF image.' });

        const buf = Buffer.from(await req.arrayBuffer());
        if (!buf.length) return json(400, { error: 'Empty file.' });
        if (buf.length > MAX_IMAGE_BYTES) return json(413, { error: 'Image is over 4 MB.' });

        // Check the file really is the image type it claims to be.
        const ok = {
            png: buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
            jpg: buf[0] === 0xff && buf[1] === 0xd8,
            gif: buf.toString('ascii', 0, 3) === 'GIF',
            webp: buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
        }[ext];
        if (!ok) return json(400, { error: 'That file is not a valid image.' });

        const rawName = decodeURIComponent(req.headers.get('x-filename') || 'image');
        const base = slugify(rawName.replace(/\.[^.]+$/, '')).slice(0, 40);
        const name = `${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        await imageStore().set(name, buf, { metadata: { contentType: type } });
        return json(201, { url: `/uploads/${name}` });
    }

    const match = p.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);
    if (match) {
        const products = await loadProducts();
        const index = products.findIndex(pr => pr.id === match[1]);
        if (index === -1) return json(404, { error: 'Product not found. Refresh the page.' });

        if (method === 'PUT') {
            const { errors, product } = cleanProduct(await readJson(req));
            if (errors.length) return json(400, { error: errors.join(' ') });
            products[index] = { id: products[index].id, ...product };
            await saveProducts(products);
            return json(200, products[index]);
        }

        if (method === 'DELETE') {
            const [removed] = products.splice(index, 1);
            await saveProducts(products);
            return json(200, removed);
        }
    }

    return json(404, { error: 'Not found' });
}

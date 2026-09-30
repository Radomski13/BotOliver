// Pulls products from your Shopify store's public product list (/products.json).
// Needs only the store domain (Admin → Checkout & promos). No API key.

import { loadProducts, saveProducts, loadSettings, dataStore, slugify } from './shared.mjs';

const PAGE_SIZE = 250;
const MAX_PAGES = 20; // up to 5,000 products

// Fields that come from Shopify and are replaced on every sync.
export const SHOPIFY_MANAGED_FIELDS = [
    'name', 'category', 'price', 'shopifyDescription', 'image', 'images', 'sizes', 'variants', 'variantInfo', 'soldOut', 'brand',
];

function baseUrl(domain) {
    // Test-only override so the sync can be tried against a fake store.
    if (process.env.SHOPIFY_BASE_URL_OVERRIDE) return process.env.SHOPIFY_BASE_URL_OVERRIDE.replace(/\/+$/, '');
    return `https://${domain}`;
}

function htmlToText(html) {
    return String(html || '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, '\n\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 5000);
}

async function fetchAllShopifyProducts(domain) {
    const all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${baseUrl(domain)}/products.json?limit=${PAGE_SIZE}&page=${page}`;
        let res;
        try {
            res = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'manual' });
        } catch (e) {
            throw new Error(`Couldn't reach ${domain}. Check the Shopify domain in Checkout & promos.`);
        }
        if (res.status >= 300 && res.status < 400) {
            const to = res.headers.get('location') || '';
            if (/password/.test(to)) {
                throw new Error('Your Shopify store is password protected, so its products can\'t be read. Remove the store password in Shopify (Online Store → Preferences), then sync again.');
            }
            throw new Error(`Shopify redirected to ${to}. Use your store's .myshopify.com domain in Checkout & promos.`);
        }
        if (res.status === 404) throw new Error(`No Shopify store found at ${domain}. Use your store's .myshopify.com domain.`);
        if (!res.ok) throw new Error(`Shopify returned an error (${res.status}). Try again in a minute.`);

        let data;
        try { data = await res.json(); } catch { throw new Error('Shopify sent something unexpected (not a product list). Check the domain.'); }
        const batch = Array.isArray(data.products) ? data.products : [];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    return all;
}

// Turn one Shopify product into a store product.
function mapProduct(sp, existing) {
    const variants = Array.isArray(sp.variants) ? sp.variants : [];
    const options = Array.isArray(sp.options) ? sp.options : [];
    const single = variants.length <= 1 && (!variants[0] || /^default title$/i.test(variants[0].title || ''));

    // Choice labels: variant titles ("L", or "Black / L" when there are several options).
    const labels = single ? [] : variants.map(v => String(v.title || v.option1 || v.id).slice(0, 40));
    const keyFor = (v, i) => (single ? 'default' : labels[i]);

    // Which Shopify option (1, 2 or 3) holds size / color, if any.
    const optIndex = (re) => options.findIndex(o => re.test(o.name || ''));
    const sizeOpt = optIndex(/^size$/i);
    const colorOpt = optIndex(/^colou?r$/i);

    const variantIds = {};
    const variantInfo = {};
    variants.forEach((v, i) => {
        const key = keyFor(v, i);
        variantIds[key] = String(v.id);
        variantInfo[key] = {
            price: Math.round(Number(v.price) * 100) / 100,
            available: v.available !== false,
            ...(sizeOpt >= 0 && v[`option${sizeOpt + 1}`] ? { size: String(v[`option${sizeOpt + 1}`]).slice(0, 40) } : {}),
            ...(colorOpt >= 0 && v[`option${colorOpt + 1}`] ? { color: String(v[`option${colorOpt + 1}`]).slice(0, 40) } : {}),
        };
    });

    const prices = Object.values(variantInfo).map(v => v.price).filter(n => Number.isFinite(n));
    const images = (Array.isArray(sp.images) ? sp.images : []).map(img => img.src).filter(src => /^https:\/\//.test(src)).slice(0, 8);

    // Use the Shopify "Color" option as the product color when there's only one.
    const colors = colorOpt >= 0 ? [...new Set(variants.map(v => v[`option${colorOpt + 1}`]).filter(Boolean))] : [];

    return {
        // keep local-only fields (ad details, hidden) from the existing product
        ...(existing || {}),
        id: existing ? existing.id : slugify(sp.handle || sp.title),
        source: 'shopify',
        shopifyId: String(sp.id),
        name: String(sp.title || 'Untitled').slice(0, 120),
        category: String(sp.product_type || 'Other').slice(0, 40) || 'Other',
        price: prices.length ? Math.min(...prices) : 0,
        // Your own description (edited in the admin) wins; otherwise use Shopify's.
        shopifyDescription: htmlToText(sp.body_html),
        description: existing?.descriptionEdited ? existing.description : htmlToText(sp.body_html),
        descriptionEdited: Boolean(existing?.descriptionEdited),
        image: images[0] || '',
        images,
        sizes: labels,
        variants: variantIds,
        variantInfo,
        soldOut: variants.length ? variants.every(v => v.available === false) : true,
        brand: String(sp.vendor || '').slice(0, 70),
        color: colors.length === 1 ? String(colors[0]).slice(0, 40) : (existing?.color || ''),
        hidden: existing ? Boolean(existing.hidden) : false,
        gender: existing?.gender || '',
        ageGroup: existing?.ageGroup || '',
        googleCategory: existing?.googleCategory || '',
        gtin: existing?.gtin || '',
    };
}

export async function getSyncStatus() {
    return (await dataStore().get('shopify-sync-status', { type: 'json' })) || null;
}

async function setSyncStatus(status) {
    await dataStore().setJSON('shopify-sync-status', status);
}

// Main sync. Returns a summary.
export async function syncFromShopify({ trigger = 'manual' } = {}) {
    const settings = await loadSettings();
    const domain = settings.commerce.shopifyDomain;
    const keepManual = settings.shopifySync?.keepManual !== false;
    const started = new Date().toISOString();

    if (!domain) {
        const status = { at: started, ok: false, trigger, error: 'Add your Shopify domain in Checkout & promos first.' };
        await setSyncStatus(status);
        return status;
    }

    try {
        const shopifyProducts = (await fetchAllShopifyProducts(domain)).filter(sp => sp.published_at !== null);
        const current = await loadProducts();
        const byShopifyId = new Map(current.filter(p => p.shopifyId).map(p => [p.shopifyId, p]));
        const takenIds = new Set();

        let added = 0, updated = 0;
        const synced = new Map();
        for (const sp of shopifyProducts) {
            const existing = byShopifyId.get(String(sp.id));
            const mapped = mapProduct(sp, existing);
            // make sure ids stay unique
            let id = mapped.id, n = 2;
            while (takenIds.has(id) || (!existing && current.some(p => p.id === id && p.shopifyId !== mapped.shopifyId))) id = `${mapped.id}-${n++}`;
            mapped.id = id;
            takenIds.add(id);
            synced.set(mapped.shopifyId, mapped);
            existing ? updated++ : added++;
        }

        // Keep the admin's order: existing items stay where they were, new ones go at the end.
        const next = [];
        let removed = 0;
        for (const p of current) {
            if (p.shopifyId) {
                if (synced.has(p.shopifyId)) { next.push(synced.get(p.shopifyId)); synced.delete(p.shopifyId); }
                else removed++; // deleted or unpublished in Shopify
            } else if (p.placeholder || !keepManual) {
                removed++; // starter examples, or manual products when "keep" is off
            } else {
                next.push(p);
            }
        }
        next.push(...synced.values());

        await saveProducts(next);
        const status = {
            at: started, ok: true, trigger, domain,
            added, updated, removed, total: next.length, fromShopify: shopifyProducts.length,
        };
        await setSyncStatus(status);
        return status;
    } catch (err) {
        const status = { at: started, ok: false, trigger, domain, error: err.message };
        await setSyncStatus(status);
        return status;
    }
}

export async function removeNonShopifyProducts() {
    const current = await loadProducts();
    const next = current.filter(p => p.source === 'shopify');
    await saveProducts(next);
    return { removed: current.length - next.length, total: next.length };
}

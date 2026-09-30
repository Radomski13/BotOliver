import { loadProducts, loadSettings } from '../lib/shared.mjs';
import {
    esc, jsonForScript, siteOrigin, absUrl, productPath, variantId, money, plainText, adFriendlyImage, trackingHead,
} from '../lib/pages.mjs';

// One page per product: /product/<id>  (optional ?size=M preselects a size)
export const config = { path: '/product/:id' };

export default async (req, context) => {
    const id = String(context.params.id || '').toLowerCase();
    const [products, settings] = await Promise.all([loadProducts(), loadSettings()]);
    const product = products.find(p => p.id === id && !p.hidden);
    const origin = siteOrigin(req);

    if (!product) {
        return new Response(notFoundPage(settings), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
        });
    }

    const wantedSize = new URL(req.url).searchParams.get('size');
    const html = productPage({ product, products, settings, origin, wantedSize });
    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
};

function productPage({ product: p, products, settings, origin, wantedSize }) {
    const { site, commerce, marketing } = settings;
    const currency = commerce.currency || 'USD';
    const brand = p.brand || site.name;
    const url = absUrl(origin, productPath(p));
    const image = p.image ? absUrl(origin, p.image) : '';
    const shareImage = adFriendlyImage(p.image) ? image : '';
    const desc = plainText(p.description, 300) || `${p.name} from ${site.name}.`;
    const title = `${p.name} | ${site.name}`;
    const inStock = !p.soldOut;
    const sizes = p.sizes || [];
    const selectedSize = sizes.includes(wantedSize) ? wantedSize : (sizes.includes('L') ? 'L' : sizes[0]);

    // Google's product format (shows price and stock in search results).
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        description: plainText(p.description) || desc,
        sku: p.id,
        brand: { '@type': 'Brand', name: brand },
        ...(image ? { image: [image] } : {}),
        ...(p.gtin ? { gtin: p.gtin } : {}),
        ...(p.color ? { color: p.color } : {}),
        ...(sizes.length ? { size: sizes.join(', ') } : {}),
        offers: {
            '@type': 'Offer',
            url,
            price: p.price.toFixed(2),
            priceCurrency: currency,
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
        },
    };

    // Data the page script needs (cart + tracking).
    const pageData = {
        product: {
            id: p.id, name: p.name, price: p.price, sizes, soldOut: !!p.soldOut, category: p.category,
            variantIds: Object.fromEntries((sizes.length ? sizes : ['default']).map(s => [s, variantId(p, s)])),
        },
        currency,
        marketing: { metaPixelId: marketing?.metaPixelId || '', googleTagId: marketing?.googleTagId || '' },
    };

    const more = products.filter(x => !x.hidden && x.id !== p.id).slice(0, 4);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${esc(url)}">

    <meta property="og:type" content="product">
    <meta property="og:site_name" content="${esc(site.name)}">
    <meta property="og:title" content="${esc(p.name)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${esc(url)}">
    ${shareImage ? `<meta property="og:image" content="${esc(shareImage)}">` : ''}
    <meta property="product:brand" content="${esc(brand)}">
    <meta property="product:availability" content="${inStock ? 'in stock' : 'out of stock'}">
    <meta property="product:condition" content="new">
    <meta property="product:price:amount" content="${p.price.toFixed(2)}">
    <meta property="product:price:currency" content="${esc(currency)}">
    <meta property="product:retailer_item_id" content="${esc(p.id)}">
    <meta name="twitter:card" content="${shareImage ? 'summary_large_image' : 'summary'}">

    <script type="application/ld+json">${jsonForScript(jsonLd)}</script>

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/ekmas/cs16.css@main/css/cs16.min.css">
    <link rel="stylesheet" href="/product.css">
    ${trackingHead(marketing)}
</head>
<body class="product-body">
    <header class="pp-header">
        <a class="pp-logo" href="/">${esc(site.name)}</a>
        <nav class="pp-nav">
            <a class="cs-btn" href="/">Shop</a>
            <a class="cs-btn" href="/?cart=1" id="pp-cart-link">Cart <span class="pp-cart-count">(0)</span></a>
        </nav>
    </header>

    <main class="pp-main">
        <article class="pp-window">
            <div class="pp-heading">
                <span class="pp-icon"></span>
                <h1 class="pp-title">${esc(p.name)}</h1>
            </div>
            <div class="pp-content">
                <div class="pp-image">
                    ${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" width="600" height="600">` : '<div class="pp-noimg">No image</div>'}
                </div>
                <div class="pp-details">
                    <p class="pp-price">${esc(money(p.price, currency))}</p>
                    <p class="pp-stock ${inStock ? 'in' : 'out'}">${inStock ? 'In stock' : 'Sold out'}</p>
                    <div class="pp-desc">${esc(p.description || '').split(/\n{2,}/).map(par => `<p>${par.replace(/\n/g, '<br>')}</p>`).join('')}</div>

                    <form class="pp-buy" id="pp-buy">
                        ${sizes.length ? `
                        <div class="pp-row">
                            <label for="pp-size">Size</label>
                            <select id="pp-size" class="cs-select">
                                ${sizes.map(s => `<option${s === selectedSize ? ' selected' : ''}>${esc(s)}</option>`).join('')}
                            </select>
                        </div>` : ''}
                        <div class="pp-row">
                            <label for="pp-qty">Qty</label>
                            <input type="number" id="pp-qty" class="cs-input" min="1" max="20" value="1">
                        </div>
                        <div class="pp-actions">
                            <button type="submit" class="cs-btn pp-add" ${inStock ? '' : 'disabled'}>${inStock ? 'Add to cart' : 'Sold out'}</button>
                            <a class="cs-btn" href="/?cart=1">View cart</a>
                        </div>
                        <p class="pp-msg" id="pp-msg" role="status"></p>
                    </form>

                    ${commerce.freeOver ? `<p class="pp-note">Free shipping on orders over ${esc(money(commerce.freeOver, currency).replace(/\.00$/, ''))}</p>` : ''}
                </div>
            </div>
        </article>

        ${more.length ? `
        <section class="pp-more">
            <h2>More gear</h2>
            <div class="pp-grid">
                ${more.map(m => `
                <a class="pp-card" href="${esc(productPath(m))}">
                    <span class="pp-card-img">${m.image ? `<img src="${esc(absUrl(origin, m.image))}" alt="" loading="lazy" width="200" height="200">` : ''}</span>
                    <span class="pp-card-name">${esc(m.name)}</span>
                    <span class="pp-card-price">${esc(money(m.price, currency))}</span>
                </a>`).join('')}
            </div>
        </section>` : ''}
    </main>

    ${site.footer ? `<footer class="pp-footer">${esc(site.footer)}</footer>` : ''}

    <script>window.PRODUCT_PAGE = ${jsonForScript(pageData)};</script>
    <script src="/product.js"></script>
</body>
</html>`;
}

function notFoundPage(settings) {
    const name = settings?.site?.name || 'Store';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Item not found | ${esc(name)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/ekmas/cs16.css@main/css/cs16.min.css">
    <link rel="stylesheet" href="/product.css">
</head>
<body class="product-body">
    <main class="pp-main">
        <article class="pp-window pp-404">
            <div class="pp-heading"><span class="pp-icon"></span><h1 class="pp-title">Item not found</h1></div>
            <div class="pp-content single">
                <p>This item isn't available anymore.</p>
                <a class="cs-btn" href="/">Back to the shop</a>
            </div>
        </article>
    </main>
</body>
</html>`;
}

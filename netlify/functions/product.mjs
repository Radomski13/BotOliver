import { loadProducts, loadSettings } from '../lib/shared.mjs';
import {
    esc, jsonForScript, siteOrigin, absUrl, productPath, variantId, money, plainText, adFriendlyImage, trackingHead,
    priceFor, sizeAvailable, priceRange,
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
    const sizes = p.sizes || [];
    const inStockSizes = sizes.filter(sz => sizeAvailable(p, sz));
    const selectedSize = [wantedSize, 'L', inStockSizes[0], sizes[0]].find(sz => sz && sizes.includes(sz) && (sizeAvailable(p, sz) || !inStockSizes.length || sz === wantedSize));
    const inStock = sizes.length ? inStockSizes.length > 0 : !p.soldOut;
    const range = priceRange(p);
    const shownPrice = selectedSize ? priceFor(p, selectedSize) : p.price;
    const selectedAvailable = selectedSize ? sizeAvailable(p, selectedSize) : inStock;

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
        offers: range.min === range.max ? {
            '@type': 'Offer',
            url,
            price: range.min.toFixed(2),
            priceCurrency: currency,
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
        } : {
            '@type': 'AggregateOffer',
            url,
            lowPrice: range.min.toFixed(2),
            highPrice: range.max.toFixed(2),
            offerCount: sizes.length,
            priceCurrency: currency,
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
        },
    };

    // Data the page script needs (cart + tracking).
    const pageData = {
        product: {
            id: p.id, name: p.name, price: p.price, sizes, soldOut: !inStock, category: p.category,
            variantInfo: p.variantInfo || null,
            images: ((p.images && p.images.length) ? p.images : (p.image ? [p.image] : [])).map(src => absUrl(origin, src)),
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
    <meta property="product:price:amount" content="${shownPrice.toFixed(2)}">
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
                <div class="pp-media">
                <div class="pp-image">
                    ${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" width="600" height="600" id="pp-main-img" class="zoomable" tabindex="0" role="button" title="Click to enlarge">` : '<div class="pp-noimg">No image</div>'}
                </div>
                ${(p.images || []).length > 1 ? `
                <div class="pp-thumbs">
                    ${p.images.map((src, i) => `<button type="button" class="pp-thumb${i === 0 ? ' active' : ''}" data-src="${esc(src)}"><img src="${esc(src)}" alt="" loading="lazy" width="64" height="64"></button>`).join('')}
                </div>` : ''}
                </div>
                <div class="pp-details">
                    <p class="pp-price" id="pp-price">${esc(money(shownPrice, currency))}</p>
                    <p class="pp-stock ${selectedAvailable ? 'in' : 'out'}" id="pp-stock">${selectedAvailable ? 'In stock' : (inStock ? 'Sold out in this size' : 'Sold out')}</p>
                    <div class="pp-desc">${esc(p.description || '').split(/\n{2,}/).map(par => `<p>${par.replace(/\n/g, '<br>')}</p>`).join('')}</div>

                    <form class="pp-buy" id="pp-buy">
                        ${sizes.length ? `
                        <div class="pp-row">
                            <label for="pp-size">Size</label>
                            <select id="pp-size" class="cs-select">
                                ${sizes.map(sz => `<option value="${esc(sz)}"${sz === selectedSize ? ' selected' : ''}${sizeAvailable(p, sz) ? '' : ' disabled'}>${esc(sz)}${sizeAvailable(p, sz) ? '' : ' (sold out)'}</option>`).join('')}
                            </select>
                        </div>` : ''}
                        <div class="pp-row">
                            <label for="pp-qty">Qty</label>
                            <input type="number" id="pp-qty" class="cs-input" min="1" max="20" value="1">
                        </div>
                        <div class="pp-actions">
                            <button type="submit" class="cs-btn pp-add" id="pp-add" ${selectedAvailable ? '' : 'disabled'}>${selectedAvailable ? 'Add to cart' : 'Sold out'}</button>
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
                    <span class="pp-card-price">${priceRange(m).min !== priceRange(m).max ? 'From ' : ''}${esc(money(m.price, currency))}</span>
                </a>`).join('')}
            </div>
        </section>` : ''}
    </main>

    ${site.footer ? `<footer class="pp-footer">${esc(site.footer)}</footer>` : ''}

    <script>window.PRODUCT_PAGE = ${jsonForScript(pageData)};</script>
    <script src="/lightbox.js"></script>
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

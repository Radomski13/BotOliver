import { loadProducts, loadSettings } from '../lib/shared.mjs';
import { esc, siteOrigin, absUrl, productPath, variantId, plainText, adFriendlyImage, priceFor, sizeAvailable } from '../lib/pages.mjs';

// Product feed for Google Merchant Center and Meta (Facebook/Instagram) catalogs.
// Both accept this Google-format RSS feed. One item per size, grouped with item_group_id.
export const config = { path: '/feed.xml' };

export default async (req) => {
    const [products, settings] = await Promise.all([loadProducts(), loadSettings()]);
    const origin = siteOrigin(req);
    const currency = settings.commerce.currency || 'USD';
    const storeName = settings.site.name;

    const items = [];
    for (const p of products) {
        if (p.hidden) continue;
        const sizes = p.sizes && p.sizes.length ? p.sizes : [null];
        const hasGroup = sizes.length > 1 || sizes[0] !== null;

        for (const size of sizes) {
            const link = absUrl(origin, productPath(p)) + (size ? `?size=${encodeURIComponent(size)}` : '');
            const tags = [
                ['g:id', variantId(p, size)],
                ['g:title', size ? `${p.name} - ${size}` : p.name],
                ['g:description', plainText(p.description) || p.name],
                ['g:link', link],
                ['g:image_link', adFriendlyImage(p.image) ? absUrl(origin, p.image) : ''],
                ['g:availability', sizeAvailable(p, size || 'default') ? 'in_stock' : 'out_of_stock'],
                ['g:price', `${priceFor(p, size || 'default').toFixed(2)} ${currency}`],
                ['g:condition', 'new'],
                ['g:brand', p.brand || storeName],
                ['g:product_type', p.category],
                ['g:google_product_category', p.googleCategory],
                ['g:item_group_id', hasGroup ? p.id : ''],
                ['g:size', (size && p.variantInfo?.[size]?.size) || size || ''],
                ...(p.images || []).slice(1, 11).filter(adFriendlyImage).map(src => ['g:additional_image_link', src]),
                ['g:color', (size && p.variantInfo?.[size]?.color) || p.color],
                ['g:gender', p.gender],
                ['g:age_group', p.ageGroup],
            ];
            if (p.gtin) tags.push(['g:gtin', p.gtin]);
            else tags.push(['g:identifier_exists', 'no']); // custom merch has no barcode

            items.push(`    <item>\n${tags.filter(([, v]) => v).map(([k, v]) => `      <${k}>${esc(v)}</${k}>`).join('\n')}\n    </item>`);
        }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(storeName)}</title>
    <link>${esc(origin)}/</link>
    <description>${esc(settings.site.metaDescription || storeName)}</description>
${items.join('\n')}
  </channel>
</rss>
`;
    return new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
};

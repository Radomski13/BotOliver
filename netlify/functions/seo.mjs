import { loadProducts } from '../lib/shared.mjs';
import { esc, siteOrigin, absUrl, productPath } from '../lib/pages.mjs';

// sitemap.xml (helps Google find every product page) and robots.txt
export const config = { path: ['/sitemap.xml', '/robots.txt'] };

export default async (req) => {
    const origin = siteOrigin(req);
    const path = new URL(req.url).pathname;

    if (path === '/robots.txt') {
        const body = `User-agent: *\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
        return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    const products = (await loadProducts()).filter(p => !p.hidden);
    const urls = [`${origin}/`, ...products.map(p => absUrl(origin, productPath(p)))];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' } });
};

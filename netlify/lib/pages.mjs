// Helpers for server-built pages (product pages, feed, sitemap).

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Safe way to put JSON inside a <script> tag.
export function jsonForScript(data) {
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
        .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

// The site's public address, e.g. https://yourstore.com
export function siteOrigin(req) {
    const envUrl = process.env.URL;
    if (envUrl && !/localhost|127\.0\.0\.1/.test(envUrl)) return envUrl.replace(/\/+$/, '');
    return new URL(req.url).origin;
}

export function absUrl(origin, path) {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    return origin + '/' + String(path).replace(/^\/+/, '');
}

export function productPath(p) {
    return `/product/${encodeURIComponent(p.id)}`;
}

// ID used in the feed and in Meta/Google events. One per size, so ads can show exact sizes.
export function variantId(p, size) {
    return size && size !== 'default' ? `${p.id}-${String(size).toLowerCase().replace(/[^a-z0-9]+/g, '')}` : p.id;
}

export function money(n, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

export function plainText(s, max = 5000) {
    return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Meta and Google can't use SVG images.
export function adFriendlyImage(path) {
    return Boolean(path) && !/\.svg(\?|$)/i.test(path);
}

// Tracking snippets (Meta Pixel, Google tag) — only added when IDs are set in the admin.
export function trackingHead(marketing = {}) {
    let html = '';
    const pixel = /^\d{8,20}$/.test(marketing.metaPixelId || '') ? marketing.metaPixelId : '';
    const gtag = /^(G|AW|GT)-[A-Z0-9-]+$/.test(marketing.googleTagId || '') ? marketing.googleTagId : '';
    if (pixel) {
        html += `
    <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixel}');
    fbq('track', 'PageView');
    </script>`;
    }
    if (gtag) {
        html += `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${gtag}"></script>
    <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gtag}');
    </script>`;
    }
    return html;
}

/* Meta Pixel + Google tag helpers.
   Product/event IDs match the product feed (/feed.xml), so ads can link views and sales to catalog items. */
(function () {
    function loadMeta(id) {
        if (window.fbq) return;
        /* Meta Pixel base code */
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', id);
        window.fbq('track', 'PageView');
    }

    function loadGoogle(id) {
        if (window.gtag) return;
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', id);
    }

    // items: [{ id, name, price, quantity, size }]
    function send(metaEvent, googleEvent, items, currency) {
        const value = Math.round(items.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100;
        try {
            if (window.fbq) {
                window.fbq('track', metaEvent, {
                    content_ids: items.map(i => i.id),
                    content_type: 'product',
                    contents: items.map(i => ({ id: i.id, quantity: i.quantity })),
                    value, currency,
                });
            }
            if (window.gtag) {
                window.gtag('event', googleEvent, {
                    currency, value,
                    items: items.map(i => ({
                        item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity,
                        ...(i.size ? { item_variant: i.size } : {}),
                    })),
                });
            }
        } catch (e) { /* tracking must never break the store */ }
    }

    // Same rule as the server: product id + size, e.g. "headshot-tee-xl"
    function variantId(productId, size) {
        return size && size !== 'default' ? `${productId}-${String(size).toLowerCase().replace(/[^a-z0-9]+/g, '')}` : productId;
    }

    window.StoreTracking = {
        init(marketing) {
            marketing = marketing || {};
            if (/^\d{8,20}$/.test(marketing.metaPixelId || '')) loadMeta(marketing.metaPixelId);
            if (/^(G|AW|GT)-[A-Z0-9-]+$/.test(marketing.googleTagId || '')) loadGoogle(marketing.googleTagId);
        },
        variantId,
        viewItem: (items, currency) => send('ViewContent', 'view_item', items, currency),
        addToCart: (items, currency) => send('AddToCart', 'add_to_cart', items, currency),
        beginCheckout: (items, currency) => send('InitiateCheckout', 'begin_checkout', items, currency),
    };
})();

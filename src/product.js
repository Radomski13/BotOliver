/* Product page: add to cart (same cart as the main store) + ad tracking. */
(function () {
    const data = window.PRODUCT_PAGE;
    if (!data) return;
    const p = data.product;
    const CART_KEY = 'frag-cart-v1';

    function loadTrackingThen(fn) {
        if (window.StoreTracking) return fn();
        const s = document.createElement('script');
        s.src = '/tracking.js';
        s.onload = fn;
        document.head.appendChild(s);
    }

    function readCart() {
        try {
            const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(items) ? items : [];
        } catch (e) { return []; }
    }

    function writeCart(items) {
        try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    }

    function updateCount() {
        const n = readCart().reduce((sum, i) => sum + (i.qty || 0), 0);
        document.querySelectorAll('.pp-cart-count').forEach(el => { el.textContent = `(${n})`; });
    }

    const sizeSelect = document.getElementById('pp-size');
    const qtyInput = document.getElementById('pp-qty');
    const msg = document.getElementById('pp-msg');
    const currentSize = () => (sizeSelect ? sizeSelect.value : 'default');

    function trackItem(qty) {
        const size = currentSize();
        return [{ id: p.variantIds[size] || p.id, name: p.name, price: p.price, quantity: qty, size: size === 'default' ? '' : size }];
    }

    // Keep the address bar in sync with the chosen size (matches feed links).
    if (sizeSelect) {
        sizeSelect.addEventListener('change', () => {
            const url = new URL(location.href);
            url.searchParams.set('size', sizeSelect.value);
            history.replaceState(null, '', url);
        });
    }

    document.getElementById('pp-buy').addEventListener('submit', (e) => {
        e.preventDefault();
        if (p.soldOut) return;
        const qty = Math.max(1, Math.min(20, parseInt(qtyInput.value, 10) || 1));
        const size = currentSize();
        const items = readCart();
        const existing = items.find(i => i.id === p.id && i.size === size);
        if (existing) existing.qty = Math.min(existing.qty + qty, 20);
        else items.push({ id: p.id, size, qty });
        writeCart(items);
        updateCount();

        msg.innerHTML = '';
        msg.append(`Added ${qty} x ${p.name}${size !== 'default' ? ` (${size})` : ''}. `);
        const link = document.createElement('a');
        link.href = '/?cart=1';
        link.textContent = 'Go to cart';
        msg.append(link);

        if (window.StoreTracking) window.StoreTracking.addToCart(trackItem(qty), data.currency);
    });

    updateCount();
    loadTrackingThen(() => {
        // Pixel/gtag base code is already in the page head; this just sends the product view.
        window.StoreTracking.viewItem(trackItem(1), data.currency);
    });
})();

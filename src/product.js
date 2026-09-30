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

    const info = (size) => (p.variantInfo && p.variantInfo[size]) || null;
    const priceFor = (size) => (info(size) && Number.isFinite(info(size).price) ? info(size).price : p.price);
    const available = (size) => !p.soldOut && (info(size) ? info(size).available !== false : true);
    const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency }).format(n);

    function trackItem(qty) {
        const size = currentSize();
        return [{ id: p.variantIds[size] || p.id, name: p.name, price: priceFor(size), quantity: qty, size: size === 'default' ? '' : size }];
    }

    // Price, stock and button follow the chosen size; address bar matches feed links.
    const addBtn = document.getElementById('pp-add');
    function updateSize() {
        const size = currentSize();
        const ok = available(size);
        document.getElementById('pp-price').textContent = fmt(priceFor(size));
        const stock = document.getElementById('pp-stock');
        stock.textContent = ok ? 'In stock' : (p.soldOut ? 'Sold out' : 'Sold out in this size');
        stock.className = 'pp-stock ' + (ok ? 'in' : 'out');
        addBtn.disabled = !ok;
        addBtn.textContent = ok ? 'Add to cart' : 'Sold out';
    }
    if (sizeSelect) {
        sizeSelect.addEventListener('change', () => {
            const url = new URL(location.href);
            url.searchParams.set('size', sizeSelect.value);
            history.replaceState(null, '', url);
            updateSize();
        });
    }

    // Photo thumbnails + click to enlarge
    let photoIndex = 0;
    document.querySelectorAll('.pp-thumb').forEach((btn, i) => {
        btn.addEventListener('click', () => {
            const main = document.getElementById('pp-main-img');
            if (main) main.src = btn.dataset.src;
            photoIndex = i;
            document.querySelectorAll('.pp-thumb').forEach(b => b.classList.toggle('active', b === btn));
        });
    });
    const mainImg = document.getElementById('pp-main-img');
    if (mainImg) {
        const enlarge = () => window.Lightbox && Lightbox.open(p.images, photoIndex, p.name);
        mainImg.addEventListener('click', enlarge);
        mainImg.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enlarge(); }
        });
    }

    document.getElementById('pp-buy').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!available(currentSize())) return;
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

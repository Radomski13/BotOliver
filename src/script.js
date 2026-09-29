/* =====================================================================
   Store page. All content (text, menu, products, shipping, promo codes)
   is edited in the admin page at /admin — nothing to change here.
   ===================================================================== */

// Filled from the server on page load.
let SETTINGS = null;
let PRODUCTS = [];

async function loadStore() {
    const res = await fetch('/api/store', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load store');
    const data = await res.json();
    SETTINGS = data.settings;
    PRODUCTS = data.products;
}

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SETTINGS.commerce.currency || 'USD' }).format(n);
const moneyShort = (n) => money(n).replace(/\.00$/, '');

const sounds = {
    click: new Audio('sounds/menu_click.wav'),
    close: new Audio('sounds/window_close.wav'),
    go: new Audio('sounds/go.wav'),
    buy: new Audio('sounds/chicken.wav'),
};

function play(name) {
    const s = sounds[name];
    if (!s) return;
    s.currentTime = 0;
    s.play().catch(() => {});
}

/* ---------- Cart state (saved in the browser) ---------- */

const CART_KEY = 'frag-cart-v1';
const PROMO_KEY = 'frag-promo-v2';

const cart = {
    items: [],
    promo: null,

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            this.items = Array.isArray(saved)
                ? saved.filter(i => PRODUCTS.some(p => p.id === i.id) && i.qty > 0)
                : [];
            const promo = JSON.parse(localStorage.getItem(PROMO_KEY) || 'null');
            this.promo = promo && promo.code && promo.type ? promo : null;
        } catch (e) {
            this.items = [];
            this.promo = null;
        }
    },

    save() {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(this.items));
            if (this.promo) localStorage.setItem(PROMO_KEY, JSON.stringify(this.promo));
            else localStorage.removeItem(PROMO_KEY);
        } catch (e) { /* storage blocked — cart still works for this visit */ }
        updateCartCounts();
    },

    add(id, size, qty) {
        const existing = this.items.find(i => i.id === id && i.size === size);
        if (existing) existing.qty = Math.min(existing.qty + qty, 20);
        else this.items.push({ id, size, qty });
        this.save();
    },

    setQty(index, qty) {
        if (qty <= 0) this.items.splice(index, 1);
        else this.items[index].qty = Math.min(qty, 20);
        this.save();
    },

    clear() {
        this.items = [];
        this.promo = null;
        this.save();
    },

    count() {
        return this.items.reduce((n, i) => n + i.qty, 0);
    },

    totals() {
        const subtotal = this.items.reduce((sum, i) => {
            const p = PRODUCTS.find(p => p.id === i.id);
            return sum + (p ? p.price * i.qty : 0);
        }, 0);

        let discount = 0;
        const code = this.promo;
        if (code && subtotal > 0) {
            discount = code.type === 'percent' ? subtotal * code.value / 100 : Math.min(code.value, subtotal);
        }

        const afterDiscount = subtotal - discount;
        const shipping = subtotal === 0 || afterDiscount >= SETTINGS.commerce.freeOver ? 0 : SETTINGS.commerce.flatRate;
        return { subtotal, discount, afterDiscount, shipping, total: afterDiscount + shipping };
    },
};

function updateCartCounts() {
    const n = cart.count();
    document.querySelectorAll('.cart-count').forEach(el => el.textContent = `(${n})`);
    const viewCartBtn = document.getElementById('view-cart-btn');
    if (viewCartBtn) viewCartBtn.textContent = `Cart (${n})`;
}

/* ---------- Shared helpers ---------- */

// Replace {free_shipping_min} and {flat_rate} with the current shipping numbers.
function fillTokens(text) {
    return String(text || '')
        .replace(/\{free_shipping_min\}/g, moneyShort(SETTINGS.commerce.freeOver))
        .replace(/\{flat_rate\}/g, money(SETTINGS.commerce.flatRate));
}

// Plain text -> safe HTML with clickable links/emails and paragraph breaks.
function richText(text) {
    const linked = escapeHtml(fillTokens(text))
        .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, url => `<a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, '')}</a>`)
        .replace(/(^|[\s(])([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi, (m, pre, email) => `${pre}<a href="mailto:${email}">${email}</a>`);
    return linked.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function renderSite() {
    const { site, menu } = SETTINGS;
    document.title = site.pageTitle || site.name;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', site.metaDescription || '');
    document.querySelectorAll('[data-store-name]').forEach(el => el.textContent = site.name);
    document.querySelectorAll('[data-store-tagline]').forEach(el => {
        el.textContent = site.tagline;
        el.hidden = !site.tagline;
    });
    const footer = document.getElementById('site-footer');
    footer.textContent = site.footer;
    footer.hidden = !site.footer;

    const nav = document.getElementById('menu-items');
    nav.innerHTML = '';
    menu.filter(m => m.visible).forEach(m => {
        const a = document.createElement('a');
        a.className = 'menu-item';
        a.textContent = m.label;
        if (m.type === 'link') {
            a.href = m.url;
            if (m.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
            a.addEventListener('click', () => play('click'));
        } else {
            a.href = '#';
            a.dataset.section = m.type;
            if (m.type === 'cart') {
                const count = document.createElement('span');
                count.className = 'cart-count';
                a.append(' ', count);
            }
        }
        nav.appendChild(a);
    });
}

function renderWelcome() {
    const w = SETTINGS.welcome;
    document.getElementById('welcome-title').textContent = w.windowTitle;
    document.getElementById('welcome-map').textContent = w.mapName;
    document.getElementById('welcome-map-row').hidden = !w.mapName;
    document.getElementById('welcome-start').textContent = w.startLabel;

    let html = '';
    if (w.headline) html += `<p class="welcome-headline">${escapeHtml(fillTokens(w.headline))}</p>`;
    if (w.body) html += richText(w.body);
    if (w.perks.length) html += `<ul class="perks">${w.perks.map(p => `<li>${escapeHtml(fillTokens(p))}</li>`).join('')}</ul>`;
    if (w.hint) html += `<p class="hint">${escapeHtml(fillTokens(w.hint))}</p>`;
    document.getElementById('welcome-body').innerHTML = html;
}

function renderInfo() {
    const info = SETTINGS.info;
    document.getElementById('info-title').textContent = info.windowTitle;
    document.getElementById('info-tabs').innerHTML = info.tabs.map((t, i) => {
        let table = '';
        if (t.table.length) {
            const [head, ...rows] = t.table;
            const row = (cells, cls) => `<div class="size-row${cls}">${cells.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>`;
            table = `<div class="size-table">${row(head, ' head')}${rows.map(r => row(r, '')).join('')}</div>`;
        }
        return `
            <input class="radiotab" name="info-tabs" type="radio" id="info-tab-${i}" ${i === 0 ? 'checked' : ''} />
            <label class="label" for="info-tab-${i}">${escapeHtml(t.title)}</label>
            <div class="panel">
                <div class="info-text">${t.body ? richText(t.body) : ''}${table}</div>
                ${t.note ? `<p class="info-small">${escapeHtml(fillTokens(t.note))}</p>` : ''}
            </div>`;
    }).join('');
}

function showAlert(title, html) {
    const dialog = document.getElementById('alert-dialog');
    dialog.querySelector('#alert-title').textContent = title;
    dialog.querySelector('#alert-body').innerHTML = html;
    dialog.showModal();
}

function openOnly(dialog) {
    document.querySelectorAll('dialog[open]').forEach(d => { if (d !== dialog) d.close(); });
    if (!dialog.open) dialog.showModal();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Welcome ---------- */

function initWelcomeDialog() {
    const dialog = document.getElementById('welcome-dialog');

    dialog.querySelector('#welcome-start').addEventListener('click', () => {
        play('go');
        openOnly(document.getElementById('buy-dialog'));
    });
    dialog.querySelector('#welcome-cancel').addEventListener('click', () => dialog.close());
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());

    return dialog;
}

/* ---------- Buy menu ---------- */

function initBuyDialog() {
    const dialog = document.getElementById('buy-dialog');
    const list = dialog.querySelector('#product-list');
    const categoryFilter = dialog.querySelector('#category-filter');
    const previewImage = dialog.querySelector('#preview-image');
    const previewName = dialog.querySelector('#preview-name');
    const previewPrice = dialog.querySelector('#preview-price');
    const previewDesc = dialog.querySelector('#preview-desc');
    const sizeRow = dialog.querySelector('#size-row');
    const sizeSelect = dialog.querySelector('#size-select');
    const qtyInput = dialog.querySelector('#qty-input');
    const addBtn = dialog.querySelector('#add-to-cart-btn');
    const msg = dialog.querySelector('#buy-msg');

    let selected = null;
    let msgTimer = null;

    const categories = ['All', ...new Set(PRODUCTS.map(p => p.category))];
    categoryFilter.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    function renderList() {
        const cat = categoryFilter.value;
        const items = PRODUCTS.filter(p => cat === 'All' || p.category === cat);
        if (!items.length) {
            list.innerHTML = '<div class="cart-empty">No items right now. Check back soon.</div>';
            return;
        }
        list.innerHTML = items.map(p => `
            <div class="product-item${p.soldOut ? ' sold-out' : ''}${selected && selected.id === p.id ? ' selected' : ''}" data-id="${p.id}">
                <div class="col-name item-col">${escapeHtml(p.name)}</div>
                <div class="col-cat item-col">${escapeHtml(p.category)}</div>
                <div class="col-price item-col">${p.soldOut ? 'Sold out' : money(p.price)}</div>
            </div>
        `).join('');

        list.querySelectorAll('.product-item').forEach(row => {
            row.addEventListener('click', () => select(row.dataset.id));
            row.addEventListener('dblclick', () => { select(row.dataset.id); addToCart(); });
        });
    }

    function select(id) {
        selected = PRODUCTS.find(p => p.id === id) || null;
        list.querySelectorAll('.product-item').forEach(r => r.classList.toggle('selected', r.dataset.id === id));
        if (!selected) return;

        previewImage.style.backgroundImage = selected.image ? `url("${encodeURI(selected.image)}")` : 'none';
        previewName.textContent = selected.name;
        previewPrice.textContent = selected.soldOut ? 'Sold out' : money(selected.price);
        previewDesc.textContent = selected.description;

        if (selected.sizes.length) {
            sizeRow.hidden = false;
            const prev = sizeSelect.value;
            sizeSelect.innerHTML = selected.sizes.map(s => `<option>${escapeHtml(s)}</option>`).join('');
            sizeSelect.value = selected.sizes.includes(prev) ? prev : (selected.sizes.includes('L') ? 'L' : selected.sizes[0]);
        } else {
            sizeRow.hidden = true;
        }

        qtyInput.value = 1;
        addBtn.disabled = selected.soldOut;
    }

    function addToCart() {
        if (!selected || selected.soldOut) return;
        const qty = Math.max(1, Math.min(20, parseInt(qtyInput.value, 10) || 1));
        const size = selected.sizes.length ? sizeSelect.value : 'default';
        cart.add(selected.id, size, qty);
        play('buy');

        msg.textContent = `Added ${qty} x ${selected.name}${size !== 'default' ? ` (${size})` : ''}`;
        clearTimeout(msgTimer);
        msgTimer = setTimeout(() => { msg.textContent = ''; }, 2500);
    }

    categoryFilter.addEventListener('change', renderList);
    addBtn.addEventListener('click', addToCart);
    dialog.querySelector('#view-cart-btn').addEventListener('click', () => {
        play('click');
        openOnly(document.getElementById('cart-dialog'));
    });
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());

    renderList();
    const first = PRODUCTS.find(p => !p.soldOut);
    if (first) select(first.id);

    return dialog;
}

/* ---------- Cart ---------- */

function initCartDialog() {
    const dialog = document.getElementById('cart-dialog');
    const list = dialog.querySelector('#cart-list');
    const promoInput = dialog.querySelector('#promo-input');
    const promoMsg = dialog.querySelector('#promo-msg');
    const checkoutBtn = dialog.querySelector('#checkout-btn');

    function render() {
        if (!cart.items.length) {
            list.innerHTML = `<div class="cart-empty">Your loadout is empty. Open the buy menu to gear up.</div>`;
        } else {
            list.innerHTML = cart.items.map((item, index) => {
                const p = PRODUCTS.find(p => p.id === item.id);
                if (!p) return '';
                return `
                    <div class="cart-item" data-index="${index}">
                        <div class="col-name item-col">${escapeHtml(p.name)}</div>
                        <div class="col-size item-col">${item.size === 'default' ? '—' : escapeHtml(item.size)}</div>
                        <div class="col-qty item-col">
                            <div class="qty-controls">
                                <button type="button" class="cs-btn qty-minus" aria-label="Decrease">-</button>
                                <span>${item.qty}</span>
                                <button type="button" class="cs-btn qty-plus" aria-label="Increase">+</button>
                            </div>
                        </div>
                        <div class="col-price item-col">${money(p.price * item.qty)}</div>
                        <div class="col-remove item-col">
                            <button type="button" class="cs-btn remove-btn" aria-label="Remove">x</button>
                        </div>
                    </div>
                `;
            }).join('');

            list.querySelectorAll('.cart-item').forEach(row => {
                const i = Number(row.dataset.index);
                row.querySelector('.qty-minus').addEventListener('click', () => { cart.setQty(i, cart.items[i].qty - 1); render(); });
                row.querySelector('.qty-plus').addEventListener('click', () => { cart.setQty(i, cart.items[i].qty + 1); render(); });
                row.querySelector('.remove-btn').addEventListener('click', () => { play('close'); cart.setQty(i, 0); render(); });
            });
        }

        const t = cart.totals();
        dialog.querySelector('#subtotal').textContent = money(t.subtotal);

        const discountRow = dialog.querySelector('#discount-row');
        discountRow.hidden = !(cart.promo && t.discount > 0);
        if (cart.promo) {
            dialog.querySelector('#discount-label').textContent = `Discount (${cart.promo.code})`;
            dialog.querySelector('#discount-amount').textContent = `-${money(t.discount)}`;
        }

        dialog.querySelector('#shipping').textContent = t.subtotal === 0 ? money(0) : (t.shipping === 0 ? 'FREE' : money(t.shipping));
        dialog.querySelector('#grand-total').textContent = money(t.total);

        const pct = Math.min(100, (t.afterDiscount / SETTINGS.commerce.freeOver) * 100);
        dialog.querySelector('#ship-bar').style.width = `${pct}%`;
        const shipNote = dialog.querySelector('#ship-note');
        if (t.subtotal === 0) shipNote.textContent = `Free shipping over ${money(SETTINGS.commerce.freeOver)}`;
        else if (t.shipping === 0) shipNote.textContent = 'Free shipping unlocked.';
        else shipNote.textContent = `${money(SETTINGS.commerce.freeOver - t.afterDiscount)} away from free shipping`;

        checkoutBtn.disabled = cart.items.length === 0;
        if (cart.promo && !promoInput.value) promoInput.value = cart.promo.code;
    }

    async function applyPromo() {
        const code = promoInput.value.trim().toUpperCase();
        promoMsg.classList.remove('error');

        if (!code) {
            cart.promo = null;
            cart.save();
            promoMsg.textContent = '';
            render();
            return;
        }

        promoMsg.textContent = 'Checking...';
        try {
            const res = await fetch('/api/promo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.valid) throw new Error(data.error || 'Invalid code. Nice try.');
            cart.promo = { code: data.code, type: data.type, value: data.value, label: data.label };
            cart.save();
            promoInput.value = data.code;
            promoMsg.textContent = `${data.code} applied: ${data.label}`;
            play('go');
        } catch (err) {
            promoMsg.textContent = err.message;
            promoMsg.classList.add('error');
        }
        render();
    }

    function checkout() {
        if (!cart.items.length) return;

        const missing = cart.items.filter(i => {
            const p = PRODUCTS.find(p => p.id === i.id);
            return !p.variants || !p.variants[i.size];
        });

        if (!SETTINGS.commerce.shopifyDomain || missing.length) {
            showAlert('Checkout',
                'Checkout isn\'t connected yet.<br><br>' +
                'Add your Shopify domain and product variant IDs in the admin page to turn it on.');
            return;
        }

        const lines = cart.items.map(i => {
            const p = PRODUCTS.find(p => p.id === i.id);
            return `${p.variants[i.size]}:${i.qty}`;
        }).join(',');

        let url = `https://${SETTINGS.commerce.shopifyDomain}/cart/${lines}`;
        if (cart.promo) url += `?discount=${encodeURIComponent(cart.promo.code)}`;
        play('go');
        window.location.href = url;
    }

    dialog.querySelector('#promo-apply').addEventListener('click', applyPromo);
    promoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });
    checkoutBtn.addEventListener('click', checkout);
    dialog.querySelector('#cart-keep-shopping').addEventListener('click', () => {
        play('click');
        openOnly(document.getElementById('buy-dialog'));
    });
    dialog.querySelector('#cart-clear').addEventListener('click', () => {
        play('close');
        cart.clear();
        promoInput.value = '';
        promoMsg.textContent = '';
        render();
    });
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());

    dialog.render = render;
    return dialog;
}

/* ---------- Store info ---------- */

function initInfoDialog() {
    const dialog = document.getElementById('info-dialog');
    dialog.querySelector('#info-ok').addEventListener('click', () => dialog.close());
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());
    return dialog;
}

/* ---------- Start up ---------- */

// Used only if the server can't be reached, so the page still draws.
const FALLBACK_SETTINGS = {
    site: { name: 'Store', tagline: '', pageTitle: 'Store', metaDescription: '', footer: '' },
    menu: [{ type: 'buy', label: 'Buy menu', visible: true }, { type: 'cart', label: 'Cart', visible: true }],
    welcome: { showOnFirstVisit: false, windowTitle: 'Welcome', mapName: '', headline: '', body: '', perks: [], hint: '', startLabel: 'Start' },
    info: { windowTitle: 'Store Info', tabs: [{ title: 'Info', body: 'Store info is unavailable right now.', table: [], note: '' }] },
    commerce: { currency: 'USD', flatRate: 0, freeOver: 0, shopifyDomain: '' },
};

document.addEventListener('DOMContentLoaded', async () => {
    let loadFailed = false;
    try {
        await loadStore();
    } catch (e) {
        console.error(e);
        SETTINGS = FALLBACK_SETTINGS;
        PRODUCTS = [];
        loadFailed = true;
    }

    renderSite();
    renderWelcome();
    renderInfo();
    cart.load();

    const welcome = initWelcomeDialog();
    const buy = initBuyDialog();
    const cartDialog = initCartDialog();
    const info = initInfoDialog();

    updateCartCounts();

    document.querySelectorAll('.cs-dialog .close').forEach(btn => {
        btn.addEventListener('click', () => play('close'));
    });

    document.querySelectorAll('.menu-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            play('click');

            switch (item.dataset.section) {
                case 'buy':     openOnly(buy); break;
                case 'cart':    openOnly(cartDialog); break;
                case 'info':    openOnly(info); break;
                case 'welcome': openOnly(welcome); break;
            }
        });
    });

    // Re-render cart whenever it's opened from anywhere.
    const origShow = cartDialog.showModal.bind(cartDialog);
    cartDialog.showModal = () => { cartDialog.render(); origShow(); };

    if (loadFailed) {
        showAlert('Connection problem', 'The store couldn\'t load right now. Please refresh the page in a moment.');
        return;
    }

    // Show the welcome screen on first visit; returning shoppers go straight to the menu.
    if (!SETTINGS.welcome.showOnFirstVisit) return;
    let seen = false;
    try { seen = sessionStorage.getItem('frag-welcomed') === '1'; } catch (e) {}
    if (!seen) {
        welcome.showModal();
        try { sessionStorage.setItem('frag-welcomed', '1'); } catch (e) {}
    }
});

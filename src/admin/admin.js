const $ = (sel) => document.querySelector(sel);

const state = {
    products: [],
    editingId: null,   // null = new product
    dirty: false,
};

const form = {
    name: $('#f-name'),
    category: $('#f-category'),
    price: $('#f-price'),
    description: $('#f-description'),
    image: $('#f-image'),
    sizes: $('#f-sizes'),
    soldOut: $('#f-soldout'),
    hidden: $('#f-hidden'),
    brand: $('#f-brand'),
    color: $('#f-color'),
    gender: $('#f-gender'),
    ageGroup: $('#f-age'),
    googleCategory: $('#f-gcat'),
    gtin: $('#f-gtin'),
};

/* ---------- API ---------- */

async function api(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && url.startsWith('/api/admin/')) {
        showLogin();
        throw new Error('Session expired. Log in again.');
    }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
}

/* ---------- Helpers ---------- */

function money(n) {
    return '$' + Number(n || 0).toFixed(2);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function imageUrl(path) {
    if (!path) return '';
    if (/^(https:\/\/|\/)/.test(path)) return path;
    return '/' + path; // store images like images/products/x.svg
}

function setStatus(msg, type = '') {
    const el = $('#status-msg');
    el.textContent = msg;
    el.className = 'status-msg ' + type;
}

function setDirty(on) {
    state.dirty = on;
    $('#dirty-flag').hidden = !on;
}

function parseSizes(text) {
    return [...new Set(text.split(',').map(s => s.trim()).filter(Boolean))];
}

function confirmBox(text) {
    const dialog = $('#confirm-dialog');
    $('#confirm-text').textContent = text;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    });
}

async function okToLeave() {
    return !state.dirty || confirmBox('You have unsaved product changes. Discard them?');
}

/* ---------- Views ---------- */

function showLogin() {
    $('#admin-view').hidden = true;
    $('#login-view').hidden = false;
    $('#password').value = '';
    $('#password').focus();
}

async function showAdmin() {
    $('#login-view').hidden = true;
    $('#admin-view').hidden = false;
    state.products = await api('GET', '/api/admin/products');
    renderList();
    if (state.products.length) loadIntoForm(state.products[0]);
    else loadIntoForm(null);
}

/* ---------- Product list ---------- */

function renderList() {
    const rows = $('#product-rows');
    $('#product-count').textContent = state.products.length;

    if (!state.products.length) {
        rows.innerHTML = '<div class="empty">No products yet. Click "+ New" to add one.</div>';
    } else {
        rows.innerHTML = state.products.map((p, i) => {
            const status = p.hidden ? '<span class="tag hidden">Hidden</span>'
                : p.soldOut ? '<span class="tag sold">Sold out</span>'
                : '<span class="tag live">Live</span>';
            return `
                <div class="row${p.id === state.editingId ? ' selected' : ''}" data-id="${escapeHtml(p.id)}">
                    <div class="c-name">${escapeHtml(p.name)}</div>
                    <div class="c-price">${money(p.price)}</div>
                    <div class="c-status">${status}</div>
                    <div class="c-move">
                        <button type="button" class="cs-btn move" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#9650;</button>
                        <button type="button" class="cs-btn move" data-dir="1" ${i === state.products.length - 1 ? 'disabled' : ''} aria-label="Move down">&#9660;</button>
                    </div>
                </div>`;
        }).join('');
    }

    rows.querySelectorAll('.row').forEach(row => {
        row.addEventListener('click', async (e) => {
            if (e.target.closest('.move')) return;
            if (row.dataset.id === state.editingId) return;
            if (!(await okToLeave())) return;
            loadIntoForm(state.products.find(p => p.id === row.dataset.id));
        });
    });

    rows.querySelectorAll('.move').forEach(btn => {
        btn.addEventListener('click', () => move(btn.closest('.row').dataset.id, Number(btn.dataset.dir)));
    });

    const cats = [...new Set(state.products.map(p => p.category).filter(Boolean))];
    $('#category-list').innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
}

async function move(id, dir) {
    const i = state.products.findIndex(p => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= state.products.length) return;
    const ids = state.products.map(p => p.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
        state.products = await api('POST', '/api/admin/products/reorder', { ids });
        renderList();
        setStatus('Order saved.', 'ok');
    } catch (e) {
        setStatus(e.message, 'error');
    }
}

/* ---------- Editor ---------- */

function loadIntoForm(p) {
    state.editingId = p ? p.id : null;
    $('#edit-title').textContent = p ? `Edit: ${p.name}` : 'New product';

    form.name.value = p ? p.name : '';
    form.category.value = p ? p.category : '';
    form.price.value = p ? p.price : '';
    form.description.value = p ? p.description : '';
    form.image.value = p ? p.image : '';
    form.sizes.value = p ? (p.sizes || []).join(', ') : 'S, M, L, XL, 2XL';
    form.soldOut.checked = p ? !!p.soldOut : false;
    form.hidden.checked = p ? !!p.hidden : false;
    form.brand.value = p ? p.brand || '' : '';
    form.color.value = p ? p.color || '' : '';
    form.gender.value = p ? p.gender || '' : 'unisex';
    form.ageGroup.value = p ? p.ageGroup || '' : 'adult';
    form.googleCategory.value = p ? p.googleCategory || '' : '';
    form.gtin.value = p ? p.gtin || '' : '';
    const pageLink = $('#product-page-link');
    pageLink.hidden = !p;
    $('#product-page-none').hidden = !!p;
    if (p) pageLink.href = `/product/${encodeURIComponent(p.id)}`;

    renderVariantInputs(p ? p.variants || {} : {});
    updatePreview();

    $('#delete-btn').hidden = !p;
    $('#duplicate-btn').hidden = !p;
    setStatus('');
    setDirty(false);
    renderList();
    if (!p) form.name.focus();
}

function currentVariantValues() {
    const out = {};
    document.querySelectorAll('#variant-grid input').forEach(inp => {
        if (inp.value.trim()) out[inp.dataset.size] = inp.value.trim();
    });
    return out;
}

function renderVariantInputs(values) {
    const sizes = parseSizes(form.sizes.value);
    const keys = sizes.length ? sizes : ['default'];
    $('#variant-grid').innerHTML = keys.map(k => `
        <label class="variant-item">
            <span>${k === 'default' ? 'ID' : escapeHtml(k)}</span>
            <input type="text" class="cs-input" inputmode="numeric" data-size="${escapeHtml(k)}"
                   value="${escapeHtml(values[k] || '')}" placeholder="e.g. 44123456789">
        </label>`).join('');
}

function updatePreview() {
    const box = $('#image-preview');
    const url = imageUrl(form.image.value.trim());
    box.style.backgroundImage = url ? `url("${encodeURI(url)}")` : 'none';
    box.classList.toggle('has-image', !!url);
    $('#svg-warning').hidden = !/\.svg(\?|$)/i.test(form.image.value.trim());
}

function readForm() {
    return {
        name: form.name.value,
        category: form.category.value,
        price: form.price.value,
        description: form.description.value,
        image: form.image.value.trim(),
        sizes: parseSizes(form.sizes.value),
        variants: currentVariantValues(),
        soldOut: form.soldOut.checked,
        hidden: form.hidden.checked,
        brand: form.brand.value,
        color: form.color.value,
        gender: form.gender.value,
        ageGroup: form.ageGroup.value,
        googleCategory: form.googleCategory.value,
        gtin: form.gtin.value.trim(),
    };
}

async function save(e) {
    e.preventDefault();
    const data = readForm();
    if (!data.name.trim()) return setStatus('Name is required.', 'error');
    if (data.price === '' || Number(data.price) < 0) return setStatus('Enter a price.', 'error');

    const btn = $('#save-btn');
    btn.disabled = true;
    try {
        let saved;
        if (state.editingId) {
            saved = await api('PUT', `/api/admin/products/${state.editingId}`, data);
            state.products = state.products.map(p => p.id === saved.id ? saved : p);
        } else {
            saved = await api('POST', '/api/admin/products', data);
            state.products.push(saved);
        }
        loadIntoForm(saved);
        setStatus('Saved. Live on the store now.', 'ok');
    } catch (err) {
        setStatus(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function remove() {
    const p = state.products.find(p => p.id === state.editingId);
    if (!p) return;
    if (!(await confirmBox(`Delete "${p.name}"? This can't be undone.`))) return;
    try {
        await api('DELETE', `/api/admin/products/${p.id}`);
        state.products = state.products.filter(x => x.id !== p.id);
        loadIntoForm(state.products[0] || null);
        setStatus('Deleted.', 'ok');
    } catch (err) {
        setStatus(err.message, 'error');
    }
}

async function duplicate() {
    if (!(await okToLeave())) return;
    const p = state.products.find(p => p.id === state.editingId);
    if (!p) return;
    loadIntoForm(null);
    form.name.value = `${p.name} (copy)`;
    form.category.value = p.category;
    form.price.value = p.price;
    form.description.value = p.description;
    form.image.value = p.image;
    form.sizes.value = (p.sizes || []).join(', ');
    form.hidden.checked = true;
    ['brand', 'color', 'gender', 'ageGroup', 'googleCategory'].forEach(k => { form[k].value = p[k] || ''; });
    renderVariantInputs({});
    updatePreview();
    setDirty(true);
    setStatus('Copy starts hidden. Edit it, then Save.', 'ok');
}

// Shrink big photos in the browser so uploads stay under Netlify's size limit.
async function prepareImage(file) {
    const MAX_DIM = 1600;
    const LIMIT = 3.5 * 1024 * 1024;
    if (file.type === 'image/gif') return file; // keep animations as-is

    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= LIMIT) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let blob = await new Promise(r => canvas.toBlob(r, type, 0.88));
    if (blob && blob.size > LIMIT) blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
    return blob || file;
}

async function upload(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setStatus('Upload a PNG, JPG, WEBP or GIF image.', 'error');

    const btn = $('#upload-btn');
    btn.disabled = true;
    $('#save-btn').disabled = true;
    setStatus('Uploading...');
    try {
        const body = await prepareImage(file);
        if (body.size > 4 * 1024 * 1024) throw new Error('Image is over 4 MB. Try a smaller file.');

        const res = await fetch('/api/admin/upload', {
            method: 'POST',
            headers: { 'Content-Type': body.type || file.type, 'X-Filename': encodeURIComponent(file.name) },
            body,
            credentials: 'same-origin',
        });
        let data = null;
        try { data = await res.json(); } catch (e) {}
        if (res.status === 401) { showLogin(); throw new Error('Session expired. Log in again.'); }
        if (!res.ok) throw new Error((data && data.error) || `Upload failed (${res.status})`);

        form.image.value = data.url;
        updatePreview();
        setDirty(true);
        setStatus('Image uploaded. Click Save to keep it.', 'ok');
    } catch (err) {
        setStatus(err.message, 'error');
    } finally {
        btn.disabled = false;
        $('#save-btn').disabled = false;
        $('#f-file').value = '';
    }
}

/* ---------- Wire up ---------- */

$('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
        await api('POST', '/api/login', { password: $('#password').value });
        await showAdmin();
    } catch (err) {
        $('#login-error').textContent = err.message;
    }
});

$('#logout-btn').addEventListener('click', async () => {
    if (!(await okToLeave())) return;
    if (typeof siteEditor !== 'undefined' && siteEditor.dirty &&
        !(await confirmBox('You have unsaved site content changes. Discard them?'))) return;
    if (typeof siteEditor !== 'undefined') { siteEditor.data = null; setSettingsDirty(false); showView('products'); }
    await api('POST', '/api/logout').catch(() => {});
    setDirty(false);
    showLogin();
});

$('#new-btn').addEventListener('click', async () => {
    if (!(await okToLeave())) return;
    loadIntoForm(null);
});

$('#edit-form').addEventListener('submit', save);
$('#edit-form').addEventListener('input', () => setDirty(true));
$('#edit-form').addEventListener('change', () => setDirty(true));
$('#delete-btn').addEventListener('click', remove);
$('#duplicate-btn').addEventListener('click', duplicate);
$('#upload-btn').addEventListener('click', () => $('#f-file').click());
$('#f-file').addEventListener('change', (e) => upload(e.target.files[0]));
form.image.addEventListener('input', updatePreview);
form.sizes.addEventListener('input', () => renderVariantInputs(currentVariantValues()));

document.querySelectorAll('.quick-sizes .cs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        form.sizes.value = btn.dataset.sizes;
        renderVariantInputs(currentVariantValues());
        setDirty(true);
    });
});

window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

(async () => {
    try {
        const { authed, configured } = await api('GET', '/api/session');
        if (authed) await showAdmin();
        else showLogin();
        if (configured === false) {
            $('#login-error').textContent = 'Admin password not set yet. Add ADMIN_PASSWORD in Netlify (Site configuration > Environment variables), then redeploy.';
        }
    } catch (e) {
        showLogin();
    }
})();

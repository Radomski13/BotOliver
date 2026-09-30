/* Site content editor: Home page, Welcome, Store info, Checkout & promos.
   Uses helpers from admin.js (api, escapeHtml, confirmBox). */

const siteEditor = {
    data: null,      // working copy being edited
    saved: null,     // last saved copy (for "Undo changes")
    dirty: false,
    loading: null,
};

const MENU_TYPE_NAMES = {
    buy: 'Opens the buy menu',
    cart: 'Opens the cart (item count added automatically)',
    info: 'Opens the store info window',
    welcome: 'Opens the welcome window',
    link: 'Link',
};

/* ---------- Helpers ---------- */

function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}

function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
    target[last] = value;
}

function setSettingsDirty(on) {
    siteEditor.dirty = on;
    $('#settings-dirty').hidden = !on;
}

function settingsStatus(msg, type = '') {
    const el = $('#settings-status');
    el.textContent = msg;
    el.className = 'status-msg ' + type;
}

function moveItem(list, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    return true;
}

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

/* ---------- Load ---------- */

async function loadSiteSettings(force = false) {
    if (siteEditor.data && !force) return;
    if (!siteEditor.loading || force) {
        siteEditor.loading = api('GET', '/api/admin/settings').then(data => {
            siteEditor.saved = data;
            siteEditor.data = structuredClone(data);
            fillSettingsForm();
            setSettingsDirty(false);
        }).finally(() => { siteEditor.loading = null; });
    }
    return siteEditor.loading;
}

function fillSettingsForm() {
    const d = siteEditor.data;
    document.querySelectorAll('#settings-form [data-path]').forEach(el => {
        const v = getPath(d, el.dataset.path);
        if (el.type === 'checkbox') el.checked = Boolean(v);
        else if (el.dataset.kind === 'lines') el.value = (v || []).join('\n');
        else el.value = v ?? '';
    });
    renderMenuEditor();
    renderInfoEditor();
    renderPromoEditor();
    updateMobileBgPreview();
}

/* ---------- Mobile background preview ---------- */

const MBG_DEFAULTS = { zoom: 100, posX: 50, posY: 50, darken: 0, color: '#0d1420' };
const PREVIEW_BG = new Image();
PREVIEW_BG.src = '/images/background.png';
PREVIEW_BG.addEventListener('load', () => updateMobileBgPreview());

function updateMobileBgPreview() {
    if (!siteEditor.data) return;
    const m = { ...MBG_DEFAULTS, ...((siteEditor.data.appearance || {}).mobileBg || {}) };

    document.querySelectorAll('.range-val').forEach(el => {
        const input = document.getElementById(el.dataset.for);
        if (input) el.textContent = `${input.value}%`;
    });

    const screen = $('#mbg-preview');
    const iw = PREVIEW_BG.naturalWidth, ih = PREVIEW_BG.naturalHeight;
    const vw = 390, vh = 844; // preview is drawn at phone size, then scaled down
    if (iw && ih) {
        const scale = Math.max(vw / iw, vh / ih) * (Number(m.zoom) / 100);
        const dim = Number(m.darken) / 100;
        screen.style.backgroundColor = m.color;
        screen.style.backgroundImage = `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("/images/background.png")`;
        screen.style.backgroundSize = `auto, ${Math.round(iw * scale)}px ${Math.round(ih * scale)}px`;
        screen.style.backgroundPosition = `0 0, ${m.posX}% ${m.posY}%`;
        screen.style.backgroundRepeat = 'no-repeat, no-repeat';
    }

    const d = siteEditor.data;
    const items = (d.menu || []).filter(x => x.visible).map(x => `<div class="pv-item">${escapeHtml(x.label)}${x.type === 'cart' ? ' <span class="pv-accent">(0)</span>' : ''}</div>`).join('');
    $('#mbg-preview-menu').innerHTML = `
        <div class="pv-name">${escapeHtml((d.site && d.site.name) || '')}</div>
        ${d.site && d.site.tagline ? `<div class="pv-tagline">${escapeHtml(d.site.tagline)}</div>` : ''}
        ${items}`;
}

/* ---------- Simple fields ---------- */

function onSimpleFieldChange(e) {
    const el = e.target.closest('[data-path]');
    if (!el || !siteEditor.data) return;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.dataset.kind === 'lines') value = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (el.dataset.kind === 'number') value = el.value === '' ? '' : Number(el.value);
    else value = el.value;
    setPath(siteEditor.data, el.dataset.path, value);
    setSettingsDirty(true);
}

/* ---------- Menu editor ---------- */

function renderMenuEditor() {
    const menu = siteEditor.data.menu;
    const box = $('#menu-editor');
    box.innerHTML = menu.map((m, i) => {
        const showId = nextId('menu-show');
        const tabId = nextId('menu-tab');
        return `
        <div class="list-row" data-i="${i}">
            <div class="row-main">
                <div class="row-fields">
                    <label class="mini">Label
                        <input type="text" class="cs-input" data-field="label" maxlength="40" value="${escapeHtml(m.label)}">
                    </label>
                    ${m.type === 'link' ? `
                    <label class="mini grow">Link <span class="hint">(https://..., /page, mailto:, tel:)</span>
                        <input type="text" class="cs-input" data-field="url" maxlength="500" placeholder="https://" value="${escapeHtml(m.url || '')}">
                    </label>` : `<p class="row-type">${MENU_TYPE_NAMES[m.type]}</p>`}
                </div>
                <div class="row-checks">
                    <div class="cs-checkbox">
                        <input id="${showId}" type="checkbox" data-field="visible" ${m.visible ? 'checked' : ''}>
                        <label class="cs-checkbox__label" for="${showId}">Show</label>
                    </div>
                    ${m.type === 'link' ? `
                    <div class="cs-checkbox">
                        <input id="${tabId}" type="checkbox" data-field="newTab" ${m.newTab ? 'checked' : ''}>
                        <label class="cs-checkbox__label" for="${tabId}">Open in new tab</label>
                    </div>` : ''}
                </div>
            </div>
            <div class="row-actions">
                <button type="button" class="cs-btn" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#9650;</button>
                <button type="button" class="cs-btn" data-act="down" ${i === menu.length - 1 ? 'disabled' : ''} aria-label="Move down">&#9660;</button>
                ${m.type === 'link' ? '<button type="button" class="cs-btn danger" data-act="remove">Remove</button>' : ''}
            </div>
        </div>`;
    }).join('');
}

/* ---------- Store info editor ---------- */

function tableToText(table) {
    return (table || []).map(row => row.join(' | ')).join('\n');
}

function textToTable(text) {
    return text.split('\n').map(line => line.split('|').map(c => c.trim())).filter(r => r.some(Boolean));
}

function renderInfoEditor() {
    const tabs = siteEditor.data.info.tabs;
    $('#info-editor').innerHTML = tabs.map((t, i) => `
        <div class="list-row card" data-i="${i}">
            <div class="row-main">
                <label class="mini">Tab name
                    <input type="text" class="cs-input" data-field="title" maxlength="24" value="${escapeHtml(t.title)}">
                </label>
                <label class="mini">Text <span class="hint">(blank line = new paragraph; links and emails become clickable)</span>
                    <textarea class="cs-input" rows="4" data-field="body" maxlength="3000">${escapeHtml(t.body)}</textarea>
                </label>
                <label class="mini">Table <span class="hint">(optional — one row per line, split columns with | , first row is the header)</span>
                    <textarea class="cs-input mono" rows="3" data-field="table" placeholder="Size | Chest | Length">${escapeHtml(tableToText(t.table))}</textarea>
                </label>
                <label class="mini">Small note at the bottom <span class="hint">(optional)</span>
                    <input type="text" class="cs-input" data-field="note" maxlength="300" value="${escapeHtml(t.note)}">
                </label>
            </div>
            <div class="row-actions">
                <button type="button" class="cs-btn" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move left">&#9650;</button>
                <button type="button" class="cs-btn" data-act="down" ${i === tabs.length - 1 ? 'disabled' : ''} aria-label="Move right">&#9660;</button>
                <button type="button" class="cs-btn danger" data-act="remove" ${tabs.length === 1 ? 'disabled' : ''}>Remove</button>
            </div>
        </div>`).join('');
}

/* ---------- Promo editor ---------- */

function renderPromoEditor() {
    const codes = siteEditor.data.commerce.promoCodes;
    const box = $('#promo-editor');
    if (!codes.length) {
        box.innerHTML = '<p class="empty">No promo codes. Click "+ Add code".</p>';
        return;
    }
    box.innerHTML = codes.map((p, i) => `
        <div class="list-row promo-row" data-i="${i}">
            <div class="row-fields">
                <label class="mini">Code
                    <input type="text" class="cs-input upper" data-field="code" maxlength="30" value="${escapeHtml(p.code)}" placeholder="HEADSHOT10">
                </label>
                <label class="mini">Type
                    <select class="cs-select" data-field="type">
                        <option value="percent" ${p.type === 'percent' ? 'selected' : ''}>% off</option>
                        <option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>$ off</option>
                    </select>
                </label>
                <label class="mini">Amount
                    <input type="number" class="cs-input" data-field="value" min="0" step="0.01" value="${escapeHtml(p.value)}">
                </label>
            </div>
            <div class="row-actions">
                <button type="button" class="cs-btn danger" data-act="remove">Remove</button>
            </div>
        </div>`).join('');
}

/* ---------- List editing (shared) ---------- */

function listFor(editorId) {
    const d = siteEditor.data;
    return {
        'menu-editor': [d.menu, renderMenuEditor],
        'info-editor': [d.info.tabs, renderInfoEditor],
        'promo-editor': [d.commerce.promoCodes, renderPromoEditor],
    }[editorId];
}

function onListInput(e) {
    const field = e.target.dataset.field;
    const row = e.target.closest('.list-row');
    const editor = e.target.closest('.list-editor');
    if (!field || !row || !editor) return;
    const [list] = listFor(editor.id);
    const item = list[Number(row.dataset.i)];

    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (field === 'table') value = textToTable(value);
    if (field === 'value') value = value === '' ? '' : Number(value);
    if (field === 'code') value = value.toUpperCase();
    item[field] = value;
    setSettingsDirty(true);
}

async function onListClick(e) {
    const btn = e.target.closest('[data-act]');
    const editor = e.target.closest('.list-editor');
    if (!btn || !editor) return;
    const [list, render] = listFor(editor.id);
    const i = Number(btn.closest('.list-row').dataset.i);

    if (btn.dataset.act === 'up') moveItem(list, i, -1);
    if (btn.dataset.act === 'down') moveItem(list, i, 1);
    if (btn.dataset.act === 'remove') {
        const name = list[i].label || list[i].title || list[i].code || 'this item';
        if (!(await confirmBox(`Remove "${name}"? (Nothing is deleted until you click Save.)`))) return;
        list.splice(i, 1);
    }
    render();
    setSettingsDirty(true);
}

/* ---------- Save / undo ---------- */

async function saveSiteSettings(e) {
    e.preventDefault();
    const btn = $('#settings-save');
    btn.disabled = true;
    settingsStatus('Saving...');
    try {
        const saved = await api('PUT', '/api/admin/settings', siteEditor.data);
        siteEditor.saved = saved;
        siteEditor.data = structuredClone(saved);
        fillSettingsForm();
        setSettingsDirty(false);
        settingsStatus('Saved. Live on the store now.', 'ok');
    } catch (err) {
        settingsStatus(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function revertSiteSettings() {
    if (!siteEditor.dirty) return;
    if (!(await confirmBox('Undo all changes since your last save?'))) return;
    siteEditor.data = structuredClone(siteEditor.saved);
    fillSettingsForm();
    setSettingsDirty(false);
    settingsStatus('Changes undone.', 'ok');
}

/* ---------- Section tabs ---------- */

async function showView(view) {
    document.querySelectorAll('#section-nav .cs-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#view-products').hidden = view !== 'products';
    $('#settings-form').hidden = view === 'products';
    document.querySelectorAll('.settings-view').forEach(v => { v.hidden = v.dataset.view !== view; });

    if (view !== 'products') {
        try {
            settingsStatus(siteEditor.data ? $('#settings-status').textContent : 'Loading...');
            await loadSiteSettings();
            if ($('#settings-status').textContent === 'Loading...') settingsStatus('');
        } catch (err) {
            settingsStatus(err.message, 'error');
        }
    }
    try { sessionStorage.setItem('admin-view', view); } catch (e) {}
}

/* ---------- Wire up ---------- */

document.querySelectorAll('#section-nav .cs-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
});

const settingsForm = $('#settings-form');
settingsForm.addEventListener('input', (e) => { onSimpleFieldChange(e); onListInput(e); updateMobileBgPreview(); });
settingsForm.addEventListener('change', (e) => { onSimpleFieldChange(e); onListInput(e); updateMobileBgPreview(); });
settingsForm.addEventListener('click', onListClick);
settingsForm.addEventListener('submit', saveSiteSettings);
$('#settings-revert').addEventListener('click', revertSiteSettings);

document.querySelectorAll('[data-url]').forEach(inp => { inp.value = location.origin + inp.dataset.url; });
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const inp = btn.parentElement.querySelector('input');
        try { await navigator.clipboard.writeText(inp.value); } catch (e) { inp.select(); document.execCommand('copy'); }
        const old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = old; }, 1500);
    });
});

$('#mbg-reset').addEventListener('click', () => {
    siteEditor.data.appearance = { ...(siteEditor.data.appearance || {}), mobileBg: { ...MBG_DEFAULTS } };
    fillSettingsForm();
    setSettingsDirty(true);
    settingsStatus('Reset to the original look. Click Save to keep it.', 'ok');
});

$('#add-menu-link').addEventListener('click', () => {
    siteEditor.data.menu.push({ type: 'link', label: 'New link', url: 'https://', newTab: true, visible: true });
    renderMenuEditor();
    setSettingsDirty(true);
    $('#menu-editor .list-row:last-child input[data-field="label"]').select();
});

$('#add-info-tab').addEventListener('click', () => {
    siteEditor.data.info.tabs.push({ title: 'New tab', body: '', table: [], note: '' });
    renderInfoEditor();
    setSettingsDirty(true);
    $('#info-editor .list-row:last-child input[data-field="title"]').select();
});

$('#add-promo').addEventListener('click', () => {
    siteEditor.data.commerce.promoCodes.push({ code: '', type: 'percent', value: 10 });
    renderPromoEditor();
    setSettingsDirty(true);
    $('#promo-editor .list-row:last-child input[data-field="code"]').focus();
});

window.addEventListener('beforeunload', (e) => {
    if (siteEditor.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// Re-open the section you were last on (after a page refresh).
(function restoreView() {
    let view = 'products';
    try { view = sessionStorage.getItem('admin-view') || 'products'; } catch (e) {}
    const start = () => showView(view);
    // Wait until admin.js has shown the admin (after login).
    const obs = new MutationObserver(() => {
        if (!$('#admin-view').hidden) { obs.disconnect(); start(); }
    });
    if (!$('#admin-view').hidden) start();
    else obs.observe($('#admin-view'), { attributes: true, attributeFilter: ['hidden'] });
})();

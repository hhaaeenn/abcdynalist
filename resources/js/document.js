import { api, registerPendingItem, unregisterPendingItem, awaitTempId } from './api';
import { toast } from './ui';
import { store } from './store';
import { showSuccess, showFailedAlert, esc, showPopupWithAction } from './alerts';
import Swal from 'sweetalert2';
import { loadTree, highlightDocument, findNode, findInbox, undoLastDocCreation } from './sidebar';
import { loadBookmarks } from './bookmarks';
import { markItemOp, docUndoIsNewest } from './ops';
import { applyTo as applyTagColors, getColor as getTagColor } from './tag-colors';
import katex from 'katex';
import 'katex/dist/katex.min.css';

let docId = null;
let tree = [];

// Pemetaan tempId -> realId saat item yang baru dibuat / dipaste berhasil
// tersimpan ke server, agar urutan operasi berikutnya (delete, dsb.) memakai
// ID asli dan tidak mengirim tempId basi yang berujung 404.
const idAliases = new Map();
function rememberId(tempId, realId) {
    if (realId && realId !== tempId) idAliases.set(tempId, realId);
}
function resolveItemId(id) {
    return id ? (idAliases.get(id) || id) : id;
}
async function resolveParentAsync(id) {
    if (!id) return null;
    const settled = resolveItemId(id);
    if (settled !== id) return settled;
    const pending = await awaitTempId(id);
    return pending || id;
}
let flat = [];
let selectedId = null;
let editing = false;
let zoomId = null;
let tagFilter = null;
let dragId = null;
let dropAction = null;
let dragCopy = false;
let dragIds = null;
let backlinkCounts = {};
let lastDragPoint = null;
let dragScrollTimer = null;
let touchDrag = null;
let touchDragTimer = null;
let showCompleted = true;
let notesMode = 'show';
let theme = 'light';
let defaultBullet = 'bullet';
let spacing = 'normal';
let fontSize = 'medium';
let highlightCurrent = true;
let narrow = false;
let showWordCount = true;
let bulletZoom = false;
let reminderNotify = false;
let globalCompleted = 'show';
let globalNotes = 'show';
let completedOverride = null;
let notesOverride = null;

let isSelecting = false;

// ── block/drag select antar item (mirip Dynalist) ──────────────────────
let blockSelectStartId = null;
let blockSelectActive = false;
let suppressNextRowClick = false;

let lastVisibleIds = new Set();
let flatSearch = false;
let trashItems = [];
const multi = new Set();
let selAnchor = null;
let selEdge = null;
let linkPickerTarget = null;
let linkPickerRange = null;
let itemClipboard = null;
const undoStack = [];
const redoStack = [];

const els = {};
const rows = new Map();
const collapsed = new Set();
let menuEl;

const SVG = {
    check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M20 6 9 17l-5-5"/></svg>',
    trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    starFilled: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    dots: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>',
    zoom: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
    zoomOut: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M5 12h14"/></svg>',
    chevron: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="m6 9 6 6 6-6"/></svg>',
    note: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M4 4h16v12H8l-4 4z"/></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[15px] h-[15px]"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
};

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseReminders(text) {
    const dates = [];
    if (!text) return dates;
    const re = /(!)(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?/g;
    let m;
    while ((m = re.exec(text))) {
        let d = new Date(`${m[2]}T${m[3] || '09'}:${m[4] || '00'}:00`);
        if (Number.isNaN(d.getTime())) continue;
        dates.push(d);
    }
    return dates;
}

function hasReminder(content, note) {
    return /!\d{4}-\d{2}-\d{2}/.test(`${content || ''}\n${note || ''}`);
}

function dueReminders(now = new Date()) {
    const due = [];
    for (const f of flat) {
        const node = f.node;
        if (!node || node.checked === true) continue;
        if (!hasReminder(node.content, node.note)) continue;
        for (const d of parseReminders(`${node.content}\n${node.note}`)) {
            if (d <= now && !notifiedSet.has(`${node.id}:${d.getTime()}`)) {
                due.push({ id: node.id, node, at: d });
                notifiedSet.add(`${node.id}:${d.getTime()}`);
            }
        }
    }
    return due;
}

const notifiedSet = new Set();

function notifyDueReminders() {
    if (!reminderNotify) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
        Notification.requestPermission();
        return;
    }
    const due = dueReminders();
    for (const r of due) {
        const rel = r.node.document_id === docId ? '' : ' (dokumen lain)';
        try {
            new Notification('ABCLIST — Pengingat', {
                body: `"${(r.node.content || '(tanpa judul)').slice(0, 120)}"${rel}\nJatuh tempo ${r.at.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
            });
        } catch {
            // ignore
        }
        toast(`Pengingat: ${r.node.content || '(tanpa judul)'}`);
    }
    if (due.length) updateReminderBadge();
}

function cacheEls() {
    els.toolbar = document.getElementById('doc-toolbar');
    els.view = document.getElementById('doc-view');
    els.empty = document.getElementById('main-empty');
    els.container = document.getElementById('doc-container');
    els.breadcrumb = document.getElementById('doc-breadcrumb');
    els.title = document.getElementById('doc-title');
    els.docMenuBtn = document.getElementById('doc-menu-btn');
    els.meta = document.getElementById('doc-meta');
    els.tags = document.getElementById('doc-tags');
    els.outline = document.getElementById('outline');
    els.bookmarkBtn = document.getElementById('bookmark-doc-btn');
    els.trashView = document.getElementById('trash-view');
    els.trashList = document.getElementById('trash-list');
    els.trashEmptyMsg = document.getElementById('trash-empty-msg');
    els.trashEmpty = document.getElementById('trash-empty');
    els.trashClose = document.getElementById('trash-close');
    els.trashBtn = document.getElementById('trash-btn');
    els.srModal = document.getElementById('sr-modal');
    els.srFind = document.getElementById('sr-find');
    els.srMatch = document.getElementById('sr-match');
    els.srReplace = document.getElementById('sr-replace');
    els.srResult = document.getElementById('sr-result');
    els.srCountBtn = document.getElementById('sr-count');
    els.srReplaceBtn = document.getElementById('sr-replace-all');
    els.srCancel = document.getElementById('sr-cancel');
    els.docSearchbar = document.getElementById('doc-searchbar');
    els.docSearchInput = document.getElementById('doc-search-input');
    els.docSearchCount = document.getElementById('doc-search-count');
    els.docSearchPrev = document.getElementById('doc-search-prev');
    els.docSearchNext = document.getElementById('doc-search-next');
    els.docSearchClose = document.getElementById('doc-search-close');
    els.statusBar = document.getElementById('status-bar');
    els.statusSave = document.getElementById('status-save-text');
    els.statusWords = document.getElementById('status-words');
    els.statusCount = document.getElementById('status-count');
    els.settingsModal = document.getElementById('settings-modal');
    els.reminderBtn = document.getElementById('reminder-btn');
    els.reminderBadge = document.getElementById('reminder-badge');
    els.reminderPop = document.getElementById('reminder-pop');
    els.reminderList = document.getElementById('reminder-list');
    els.reminderNotifyToggle = document.getElementById('reminder-notify-toggle');
    els.reminderNotifyLabel = document.getElementById('reminder-notify-label');
}

function showToolbar(show) {
    els.toolbar.classList.toggle('hidden', !show);
}

function showDocContainer(show) {
    els.container.classList.toggle('hidden', !show);
    els.empty.classList.toggle('hidden', show);
}

function renderBreadcrumb(node) {
    if (!els.breadcrumb) return;
    const crumbs = [];
    let cur = node;
    const seen = new Set();
    while (cur) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        crumbs.unshift(cur);
        if (!cur.parent_id) break;
        const parent = findNode(cur.parent_id);
        if (!parent) break;
        cur = parent;
    }
    if (crumbs.length < 1) {
        els.breadcrumb.classList.add('hidden');
        return;
    }
    els.breadcrumb.innerHTML = crumbs
        .map((c, i) => {
            const isLast = i === crumbs.length - 1;
            const sep = i > 0 ? '<span class="shrink-0 text-[#b5b0a9]">/</span>' : '';
            return (
                sep +
                `<button type="button" data-id="${esc(c.id)}" class="crumb ${
                    isLast ? 'text-[#5a5650] font-medium pointer-events-none' : 'text-[#c07a12] hover:underline'
                }">${esc(c.name || '(tanpa nama)')}</button>`
            );
        })
        .join('');
    els.breadcrumb.classList.remove('hidden');
    els.breadcrumb.querySelectorAll('.crumb:not(.pointer-events-none)').forEach((btn) => {
        btn.addEventListener('click', () => {
            const n = findNode(btn.dataset.id);
            if (n) store.select(n.id, n);
        });
    });
}

function buildFlat() {
    flat = [];
    const walk = (nodes, depth, parents) => {
        for (const n of nodes) {
            flat.push({ node: n, depth, parents });
            if (Array.isArray(n.children) && n.children.length) walk(n.children, depth + 1, parents.concat(n.id));
        }
    };
    walk(tree, 0, []);
}

export async function openDocument(id) {
    docId = id;
    selectedId = null;
    editing = false;
    tagFilter = null;
    undoStack.length = 0;
    redoStack.length = 0;
    updateUndoButtons();
    loadUiState();
    closeTrash();

    showToolbar(true);
    showDocContainer(true);

    const node = store.selectedNode;
    els.title.value = node?.name || 'Tanpa judul';
    els.meta.textContent = node?.is_inbox ? 'Dokumen Inbox' : 'Dokumen';
    renderBreadcrumb(node);
    els.statusBar.classList.remove('hidden');
    updateWordCount();

    await Promise.all([loadBookmarkState(), loadItems()]);
    updateReminderBadge();
    notifyDueReminders();
}

export async function zoomToItem(itemId) {
    if (!docId || !itemId) return;
    zoomId = itemId;
    selectedId = itemId;
    await loadItems();
    selectItem(itemId);
    updateZoomBar();
    saveUiState();
}

function showFolder(node) {
    docId = null;
    selectedId = null;
    editing = false;
    undoStack.length = 0;
    redoStack.length = 0;
    updateUndoButtons();

    showToolbar(false);
    showDocContainer(true);
    els.title.value = node.name || 'Folder';
    els.meta.textContent = 'Folder';
    renderBreadcrumb(node);
    els.statusBar.classList.add('hidden');
    if (els.tags) {
        els.tags.innerHTML = '';
        els.tags.classList.add('hidden');
    }
    els.outline.classList.remove('hidden');
    els.outline.innerHTML =
        '<p class="py-6 text-center text-sm text-[#b5b0a9]">Folder. Pilih dokumen di dalamnya dari panel kiri.</p>';
}

async function loadItems() {
    if (!docId) return;
    const id = docId;
    els.outline.innerHTML = '';
    try {
        const data = await api.get(`/documents/${id}/items`);
        if (id !== docId) return;
        tree = data.data || [];
        buildFlat();
        if (zoomId) {
            const root = flat.find((f) => f.node.id === zoomId);
            if (root) {
                const sub = [];
                const collect = (n, d, parents) => {
                    sub.push({ node: n, depth: d, parents });
                    if (Array.isArray(n.children)) n.children.forEach((c) => collect(c, d + 1, parents.concat(n.id)));
                };
                collect(root.node, 0, []);
                flat = sub;
            }
        }
        render();
        renderTags();
        updateZoomBar();
        loadBacklinkCounts();
    } catch (e) {
        if (id === docId) showFailedAlert(e.message);
    }
}

async function loadBacklinkCounts() {
    if (!docId) return;
    const id = docId;
    try {
        const res = await api.get(`/documents/${id}/backlink-counts`);
        if (id !== docId) return;
        backlinkCounts = res.data || {};
        if (!editing && Object.keys(backlinkCounts).length) render();
    } catch {
        backlinkCounts = {};
    }
}

function uiKey() {
    return `abclist_ui_${docId}`;
}

function loadUiState() {
    zoomId = null;
    collapsed.clear();
    completedOverride = null;
    notesOverride = null;
    try {
        const raw = localStorage.getItem(uiKey());
        if (raw) {
            const s = JSON.parse(raw);
            if (s.zoom) zoomId = s.zoom;
            if (Array.isArray(s.collapsed)) s.collapsed.forEach((c) => collapsed.add(c));
            if (s.completed === 'show' || s.completed === 'hide') completedOverride = s.completed;
            if (s.notes === 'show' || s.notes === 'first' || s.notes === 'hide') notesOverride = s.notes;
        }
    } catch {
        // ignore
    }
    applyEffectiveView();
}

function saveUiState() {
    try {
        localStorage.setItem(uiKey(), JSON.stringify({
            zoom: zoomId,
            collapsed: [...collapsed],
            completed: completedOverride,
            notes: notesOverride,
        }));
    } catch {
        // ignore
    }
}

function parseClipboardItems(clipboardData) {
    const html = clipboardData.getData('text/html');
    const text = clipboardData.getData('text/plain');
    if (html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const items = [];
            const walk = (el, depth) => {
                const children = [...el.children];
                if (!children.length) return;
                let hasNestedList = false;
                for (const child of children) {
                    const tag = child.tagName.toLowerCase();
                    if (tag === 'ul' || tag === 'ol') { hasNestedList = true; break; }
                }
                for (const child of children) {
                    const tag = child.tagName.toLowerCase();
                    if (tag === 'ul' || tag === 'ol') {
                        walk(child, depth);
                    } else if (tag === 'li') {
                        const textNodes = [];
                        for (const node of child.childNodes) {
                            if (node.nodeType === 3) textNodes.push(node.textContent);
                        }
                        const liText = textNodes.join('').trim();
                        if (liText) items.push({ content: liText.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''), indent: depth });
                        const subList = child.querySelector('ul, ol');
                        if (subList) walk(subList, depth + 1);
                    } else {
                        const text = child.textContent.trim();
                        if (text && !child.querySelector('ul, ol, li')) {
                            items.push({ content: text.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''), indent: depth });
                        } else {
                            walk(child, depth);
                        }
                    }
                }
            };
            const body = doc.body;
            for (const child of body.children) {
                const tag = child.tagName.toLowerCase();
                if (tag === 'ul' || tag === 'ol' || tag === 'div') {
                    walk(child, 0);
                }
            }
            // HTML membawa struktur bertingkat (indent > 0) = sumber hierarki terpercaya.
            if (items.length && items.some((i) => i.indent > 0)) return items;
            // HTML datar (semua indent 0): biasanya teks polos berindentasi disalin sebagai
            // deretan <div>/<p> tanpa nesting <ul>/<li>. Dalam kasus itu, interpretasikan
            // indentasi spasi/tab dari text/plain agar hierarki tetap terbentuk (persis Dynalist).
            const plainResult = parsePlainTextItems(text);
            if (plainResult.length && plainResult.some((i) => i.indent > 0)) return plainResult;
            if (items.length) return items;
            if (plainResult.length) return plainResult;
        } catch (e) { /* fall through to plain text */ }
    }
    if (!text) return [];
    return parsePlainTextItems(text);
}

function parsePlainTextItems(text) {
    const rawLines = text.split(/\r?\n/);
    const items = [];
    for (const raw of rawLines) {
        if (raw.trim() === '') continue;
        const leadMatch = raw.match(/^(\t*)([ ]*)/);
        let indent = 0;
        if (leadMatch) {
            indent = (leadMatch[1] || '').length;
            const spaces = (leadMatch[2] || '').length;
            if (spaces > 0) indent += Math.floor(spaces / 2) || (spaces > 0 ? 1 : 0);
        }
        const content = raw.replace(/^[\t ]+/, '').replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
        items.push({ content, indent });
    }
    return items;
}

function render() {
    els.outline.innerHTML = '';
    rows.clear();
    updateReminderBadge();
    let visible = flat.filter((f) => !f.parents.some((p) => collapsed.has(p)));
    if (!showCompleted) {
        const hidden = new Set();
        const markHidden = (nodes) => {
            for (const n of nodes) {
                if (n.checked) {
                    hidden.add(n.id);
                    if (Array.isArray(n.children)) markHidden(n.children);
                } else if (Array.isArray(n.children)) {
                    markHidden(n.children);
                }
            }
        };
        markHidden(tree);
        visible = visible.filter((f) => !hidden.has(f.node.id));
    }
    if (tagFilter) {
        const matched = new Set(
            flat.filter((f) => String(f.node.content || '').toLowerCase().includes(tagFilter)).map((f) => f.node.id)
        );
        visible = visible.filter((f) => matched.has(f.node.id) || f.parents.some((p) => matched.has(p)));
    }
    lastVisibleIds = new Set(visible.map((f) => f.node.id));
    if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'doc-empty py-6 text-center text-sm text-[#b5b0a9] select-none cursor-text';
        empty.textContent = 'Dokumen kosong. Klik untuk menambahkan item pertama.';
        empty.tabIndex = 0;
        empty.addEventListener('click', () => addItem());
        empty.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addItem();
            }
        });
        els.outline.append(empty);
        return;
    }
    for (const { node, depth } of visible) {
        els.outline.append(buildRow(node, depth));
    }
    updateWordCount();
}

function contentHtml(content) {
    const src = String(content || '');
    const latex = [];
    const pre = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner) => {
        latex.push(inner);
        return `\u0000L${latex.length - 1}\u0000`;
    });
    const escaped = pre.replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    let html = escaped
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
            '<img src="$2" alt="$1" class="item-inline-img my-1 max-w-full h-auto rounded-md block">')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,
            '<span class="internal-link" data-id="$2">$1</span>')
        .replace(/```([\s\S]*?)```/g, '<pre class="md-codeblock">$1</pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+)__/g, '<em>$1</em>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/(^|[^#!])([!@]\d{4}-\d{2}-\d{2})/g, '$1<span class="item-date">$2</span>')
        .replace(/(^|[^#])(#[A-Za-z0-9_-]+)/g, '$1<span class="item-tag">$2</span>')
        .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>')
        .replace(/\n/g, '<br>');
    // URL storage absolut (mis. http://localhost:8000/storage/...) diubah jadi path relatif
    // agar gambar tetap termuat saat aplikasi dibuka dari host lain (deploy/LAN).
    html = html.replace(/(src|href)="https?:\/\/[^"]*?\/storage\//g, '$1="/storage/');
    html = html.replace(/\u0000L(\d+)\u0000/g, (_m, i) => {
        try {
            return katex.renderToString(latex[i], { throwOnError: false, displayMode: true });
        } catch {
            return esc(latex[i]);
        }
    });
    return html;
}

function buildRow(node, depth) {
    const row = document.createElement('div');
    row.className = 'item-row group relative flex items-start gap-1.5 rounded-md px-2 py-[3px]';
    row.tabIndex = -1;
    if (node.id === selectedId) row.classList.add('selected');
    if (multi.has(node.id)) row.classList.add('multi-selected');
    row.style.marginLeft = `${depth * 24}px`;

    const hasChildren = Array.isArray(node.children) && node.children.length;

    // Garis panduan indent vertikal (khas ABCLIST):
    // Untuk setiap level kedalaman, tambahkan garis vertikal tipis.
    // Offset 22px = posisi tengah bullet relatif terhadap row (8px padding + ~14px ke center bullet).
    // Setiap level ancestor = -24px lebih ke kiri.
    for (let i = 0; i < depth; i++) {
        const guide = document.createElement('div');
        guide.className = 'item-guide';
        guide.style.left = `${(i - depth) * 24 + 22}px`;
        row.append(guide);
    }
    // Garis anak: dari tengah baris ke bawah, di posisi bullet anak
    if (hasChildren && !collapsed.has(node.id)) {
        const childGuide = document.createElement('div');
        childGuide.className = 'item-guide item-guide-child';
        childGuide.style.left = '22px';
        row.append(childGuide);
    }

    const bulletType = node.bullet === 'checklist' ? 'checklist' : node.bullet === 'numbered' ? 'numbered' : 'bullet';

    // ── chevron (collapse/expand) ─────────────────────────────────────────
    const chevronWrap = document.createElement('div');
    chevronWrap.className = 'shrink-0 mt-[4px] w-3 h-4 flex items-center justify-center';

    if (Array.isArray(node.children) && node.children.length) {
        const chevron = document.createElement('button');
        chevron.type = 'button';
        chevron.className = 'item-chevron w-3 h-3 flex items-center justify-center rounded transition-transform opacity-0';
        chevron.innerHTML = SVG.chevron;
        chevron.title = 'Ciutkan / bentangkan';
        if (collapsed.has(node.id)) {
            chevron.classList.add('-rotate-90');
            chevron.classList.remove('opacity-0');
        }
        chevron.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollapse(node.id);
            chevron.classList.toggle('-rotate-90', collapsed.has(node.id));
            chevron.classList.toggle('opacity-0', !collapsed.has(node.id));
        });
        chevronWrap.append(chevron);
    }

    // ── bullet ────────────────────────────────────────────────────────────
    let bullet;
    if (bulletType === 'checklist') {
        bullet = document.createElement('button');
        bullet.type = 'button';
        bullet.draggable = true;
        bullet.className = 'bullet item-checkbox shrink-0 w-[15px] h-[15px] flex items-center justify-center rounded-[3px] border transition-all cursor-pointer';
        if (node.checked) bullet.classList.add('checked');
        else bullet.classList.add('unchecked');
        bullet.title = node.checked ? 'Klik untuk batal tandai · seret untuk memindahkan' : 'Klik untuk tandai selesai · seret untuk memindahkan';
        bullet.innerHTML = node.checked ? SVG.check : '';
        bullet.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) { toggleMulti(node.id); return; }
            if (multi.size) clearMulti();
            selectItem(node.id);
            toggleCheck(node.id);
        });
    } else {
        bullet = document.createElement('button');
        bullet.type = 'button';
        bullet.draggable = true;
        bullet.className = 'bullet shrink-0 w-4 h-4 flex items-center justify-center rounded cursor-grab';
        if (hasChildren && collapsed.has(node.id)) {
            bullet.classList.add('has-collapsed-children');
        }
        if (bulletType === 'numbered') {
            bullet.classList.add('numbered-bullet');
            bullet.title = 'Item bernomor · seret untuk memindahkan';
            bullet.innerHTML = `<span class="numbered-num">${numberedLabel(node)}</span>`;
        } else {
            bullet.title = Array.isArray(node.children) && node.children.length
                ? 'Klik untuk ciutkan/bentangkan · seret untuk memindahkan'
                : 'Seret untuk memindahkan';
            bullet.innerHTML = '<span class="bullet-disc"></span>';
        }
        bullet.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) { toggleMulti(node.id); return; }
            if (multi.size) clearMulti();
            selectItem(node.id);
            if (Array.isArray(node.children) && node.children.length) {
                if (bulletZoom) zoomInto(node.id);
                else toggleCollapse(node.id);
            }
        });
    }

    if (bulletType !== 'checklist') {
        bullet.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            zoomInto(node.id);
        });
    }

    bullet.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragCopy = e.ctrlKey || e.metaKey;
        dragIds = multi.size > 1 && multi.has(node.id) ? [...multi] : [node.id];
        dragId = node.id;
        row.classList.add('opacity-40');
        window.__abclistItemDrag = { ids: dragIds || [node.id], docId };
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = dragCopy ? 'copyMove' : 'move';
        lastDragPoint = null;
        startDragScroll();
    });
    bullet.addEventListener('dragend', () => {
        dragId = null;
        dragIds = null;
        dragCopy = false;
        dropAction = null;
        window.__abclistItemDrag = null;
        clearDropIndicators();
        row.classList.remove('opacity-40');
        stopDragScroll();
    });

    initTouchDrag(bullet, node);

    // ── zoom & menu icons (absolutely positioned overlay, khas ABCLIST) ─────
    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'item-zoom absolute right-full mr-px opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto w-[18px] h-[18px] flex items-center justify-center rounded text-[#8a857e] hover:text-[#c07a12] hover:bg-black/[0.06] transition-all z-10';
    zoomBtn.innerHTML = SVG.zoom;
    zoomBtn.title = 'Zoom in (Ctrl+])';
    zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomInto(node.id);
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'item-menu-btn absolute right-full mr-[19px] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto w-[18px] h-[18px] flex items-center justify-center rounded text-[#8a857e] hover:text-[#24221f] hover:bg-black/[0.06] transition-all z-10';
    menuBtn.innerHTML = SVG.dots;
    menuBtn.title = 'Menu item';
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleContextMenu(menuBtn, menuItemsFor(node));
    });

    const bulletZone = document.createElement('div');
    bulletZone.className = 'bullet-zone relative shrink-0 flex items-center gap-0.5 mt-[3px]';
    bulletZone.append(chevronWrap, bullet, zoomBtn, menuBtn);

    // ── konten teks ───────────────────────────────────────────────────────
    const cell = document.createElement('div');
    cell.className = 'flex-1 min-w-0';

    const text = document.createElement('div');
    text.className = 'item-text text-[14px] leading-relaxed break-words py-0.5 cursor-text';
    if (node.checked) text.classList.add('is-checked-text');
    const headingClass = { 1: 'text-[19px] font-bold heading-1', 2: 'text-[16px] font-bold heading-2', 3: 'text-[14px] font-semibold heading-3' }[node.heading] || '';
    if (headingClass) text.classList.add(...headingClass.split(' '));
    if (node.color && !node.checked) {
        text.style.display = 'inline-block';
        text.style.background = node.color;
        text.style.color = '#fff';
        text.style.borderRadius = '4px';
        text.style.padding = '0 7px';
        text.style.maxWidth = '100%';
    }
    if (isOverdue(node)) text.classList.add('overdue');
    text.innerHTML = contentHtml(node.content);
    applyTagColors(text);
    wireInlineImages(text, node.id);
    text.contentEditable = 'true';

    let noteEl = null;
    if (node.note && notesMode !== 'hide') {
        noteEl = document.createElement('div');
        noteEl.className = 'item-note mt-0.5 text-[12.5px] text-[#8a857e]';
        if (notesMode === 'first') {
            noteEl.innerHTML = contentHtml(node.note.split('\n')[0] + (node.note.includes('\n') ? ' …' : ''));
        } else {
            noteEl.innerHTML = contentHtml(node.note);
        }
        applyTagColors(noteEl);
        wireNoteContent(noteEl);
    }

    cell.append(text);
    if (noteEl) cell.append(noteEl);

    // ── tombol hapus (kanan) ──────────────────────────────────────────────
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-del opacity-0 group-hover:opacity-100 shrink-0 mt-[3px] w-5 h-5 flex items-center justify-center rounded text-[#8a857e] hover:text-red-600 transition-opacity';
    del.innerHTML = SVG.trash;
    del.title = 'Hapus item (Ctrl+Shift+Backspace)';
    del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(node.id);
    });

    // ── badge children collapsed ──────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-0.5';
    const backlinkCount = backlinkCounts[node.id] || 0;
    if (backlinkCount > 0) {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'backlink-badge shrink-0 mt-[3px] h-5 px-1.5 flex items-center gap-1 rounded-full text-[10px] font-semibold text-[#8a857e] transition';
        badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-2.5 h-2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>${backlinkCount}</span>`;
        badge.title = 'Show all references';
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            openBacklinks(node.id);
        });
        actions.append(badge);
    }
    if (!node.checked && hasReminder(node.content, node.note)) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'item-reminder shrink-0 mt-[3px] w-5 h-5 flex items-center justify-center rounded text-[#c07a12] transition';
        rm.innerHTML = SVG.clock;
        rm.title = 'Item memiliki pengingat. Lihat daftar melalui tombol lonceng di toolbar.';
        rm.addEventListener('click', (e) => {
            e.stopPropagation();
            renderReminderPop();
            els.reminderPop.classList.remove('hidden');
            const r = els.reminderBtn.getBoundingClientRect();
            const m = els.reminderPop.getBoundingClientRect();
            let left = Math.min(r.right, window.innerWidth - m.width - 8);
            let top = r.bottom + 4;
            if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 4;
            els.reminderPop.style.left = `${Math.max(8, left)}px`;
            els.reminderPop.style.top = `${Math.max(8, top)}px`;
        });
        actions.append(rm);
    }
    actions.append(del);

    // ── susun baris ───────────────────────────────────────────────────────
    // urutan: [bulletZone] [cell] [actions]
    row.append(bulletZone);
    row.append(cell, actions);

    row.dataset.id = node.id;
    rows.set(node.id, { row, text, bullet, cell, node });

    // ── event baris ───────────────────────────────────────────────────────
    row.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.bullet') ||
            e.target.closest('.item-del') ||
            e.target.closest('.item-menu-btn') ||
            e.target.closest('.item-zoom') ||
            e.target.closest('.backlink-badge') ||
            e.target.closest('.item-reminder') ||
            e.target.closest('.item-chevron') ||
            e.target.closest('.internal-link') ||
            e.target.closest('.item-tag')) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return; // biarkan ctrl/shift-click jalan seperti biasa
        blockSelectStartId = node.id;
        blockSelectActive = false;
    });

    row.addEventListener('click', (e) => {
        if (suppressNextRowClick) {
            suppressNextRowClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (e.target.closest('.bullet') ||
            e.target.closest('.item-del') ||
            e.target.closest('.backlink-badge') ||
            e.target.closest('.item-chevron') ||
            e.target.closest('.item-checkbox') ||
            e.target.closest('.internal-link') ||
            e.target.closest('.item-tag')) return;
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleMulti(node.id);
            return;
        }
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            if (hasCrossItemSelection()) return;
            if (text.contains(sel.anchorNode)) return;
        }
        if (multi.size) clearMulti();
        selectItem(node.id);
        startEdit(node.id, e);
    });

    row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!multi.has(node.id) && multi.size) { clearMulti(); }
        selectItem(node.id);
        openContextAt(e.clientX, e.clientY, menuItemsFor(node));
        if (editing) { commitEdit(node.id); }
    });

    row.addEventListener('dragover', (e) => {
        if (!dragId || (dragIds && dragIds.includes(node.id))) return;
        e.preventDefault();
        lastDragPoint = { x: e.clientX, y: e.clientY };
        e.dataTransfer.dropEffect = dragCopy ? 'copy' : 'move';
        const rect = row.getBoundingClientRect();
        const y = e.clientY - rect.top;
        clearDropIndicators();
        if (y < rect.height * 0.3) {
            row.classList.add('drop-before');
            dropAction = { type: 'before', target: node };
        } else if (y > rect.height * 0.7) {
            row.classList.add('drop-after');
            dropAction = { type: 'after', target: node };
        } else {
            row.classList.add('drop-child');
            dropAction = { type: 'child', target: node };
        }
    });
    row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = dropAction;
        clearDropIndicators();
        if (dragIds && dragIds.includes(node.id)) return;
        if (action && dragId) {
            if (dragCopy) doCopyDrop(dragId, action);
            else if (dragIds && dragIds.length > 1) doMoveMany(dragIds, action);
            else doMove(dragId, action);
        }
    });

    text.addEventListener('keydown', (e) => handleEditKey(e, node.id));
    text.addEventListener('selectstart', () => { isSelecting = true; });
    text.addEventListener('mouseup', () => {
        setTimeout(() => { isSelecting = false; }, 0);
    });
    text.addEventListener('input', () => { if (!editing) editing = true; });
    text.addEventListener('blur', () => {
        setTimeout(() => {
            if (!isSelecting) commitEdit(node.id);
        }, 100);
    });
    text.addEventListener('paste', async (e) => {
        const imgItem = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
        if (imgItem) {
            e.preventDefault();
            const file = imgItem.getAsFile();
            if (!file) return;
            const blobUrl = URL.createObjectURL(file);
            insertImageAtCaret(text, blobUrl);
            const permanentUrl = await uploadImage(file);
            if (permanentUrl && permanentUrl !== blobUrl) {
                URL.revokeObjectURL(blobUrl);
                const imgs = text.querySelectorAll(`img[src="${blobUrl}"]`);
                imgs.forEach((img) => { img.src = permanentUrl; });
                const fresh = contentFromElement(text);
                if (fresh !== (node.content || '')) {
                    node.content = fresh;
                    api.patch(`/documents/${docId}/items/${node.id}`, { content: fresh }).catch(() => {});
                }
            }
            return;
        }
        e.preventDefault();
        const parsed = parseClipboardItems(e.clipboardData);
        if (!parsed.length) return;
        // Single line: just insert into current item at caret
        if (parsed.length === 1) {
            document.execCommand('insertText', false, parsed[0].content);
            return;
        }
        // Multi-line paste: first line goes into current item at caret,
        // remaining lines become siblings after current item (like Dynalist.io)
        document.execCommand('insertText', false, parsed[0].content);
        const rest = parsed.slice(1);
        // Normalize indentation relative to first extra line
        const baseIndent = rest.reduce((min, p) => Math.min(min, p.indent), Infinity);
        rest.forEach(p => { p.indent -= baseIndent; });
        const curNode = node;
        let curParentId = curNode.parent_id || null;
        const curPos = siblingPosition(curNode);

        // Susun snapshot bercabang dari daftar {content, indent} yang flat,
        // lalu insert LOKAL & render dulu (instan) — baru simpan ke server
        // di background, tiap cabang top-level diparalelkan.
        const buildSnapshotTree = (lines) => {
            const root = { children: [] };
            const stack = [{ indent: -1, node: root }];
            for (const { content, indent } of lines) {
                while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
                const snap = { content, children: [] };
                stack[stack.length - 1].node.children.push(snap);
                stack.push({ indent, node: snap });
            }
            return root.children;
        };
        const snapshots = buildSnapshotTree(rest);

        recordUndo();
        const tempNodes = snapshots.map((snap) => buildTempNodeFromSnapshot(snap, curParentId));
        tempNodes.forEach((n, i) => insertNodeLocally(curParentId, curPos + 1 + i, n));
        buildFlat();
        applyZoomFilter();
        render();
        const lastTop = tempNodes[tempNodes.length - 1];
        if (lastTop) selectItem(lastTop.id);

        (async () => {
            try {
                await commitEdit(node.id);
            } catch {
                // commitEdit sudah menangani error & alert-nya sendiri
            }
            try {
                await Promise.all(
                    tempNodes.map((n, i) => persistPastedNode(n, curParentId, curPos + 1 + i))
                );
            } catch (e) {
                showFailedAlert('Sebagian item gagal disimpan: ' + e.message);
                loadItems();
            }
        })();
    });

    text.addEventListener('input', () => {
        if (!editing) return;
        const t = text.innerText || text.textContent || '';
        if (t.endsWith('[[')) { openLinkPicker(node.id); return; }
        updateAutocomplete(text, node.id);
    });

    text.addEventListener('click', (e) => {
        const link = e.target.closest('.internal-link');
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            navigateLink(link.dataset.id);
            return;
        }
        if (!editing) {
            const tag = e.target.closest('.item-tag');
            if (tag) {
                e.preventDefault();
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('dyn:tag-click', { detail: { tag: tag.textContent.replace(/^#/, '') } }));
            }
        }
    });

    return row;
}

function insertImageAtCaret(container, src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'image';
    img.className = 'item-inline-img my-1 max-w-full h-auto rounded-md block';
    const sel = window.getSelection();
    if (sel && sel.rangeCount && container.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        container.append(img);
    }
}

function placeCaretAfterImage(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const img = rec.text.querySelector('img.item-inline-img');
    if (!img) return;
    const range = document.createRange();
    range.setStartAfter(img);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

async function uploadImage(file) {
    if (!docId) return null;
    const fd = new FormData();
    fd.append('image', file);
    try {
        const data = await api.post(`/documents/${docId}/images`, fd);
        return data?.data?.url || null;
    } catch (e) {
        showFailedAlert(e.message);
        return null;
    }
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function imageAtCaret(textEl, dir) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !textEl.contains(range.commonAncestorContainer)) return null;
    const node = range.commonAncestorContainer;
    let candidate = null;
    if (node.nodeType === Node.TEXT_NODE) {
        const offset = range.startOffset;
        if (dir === 'backspace' && offset === 0) candidate = node.previousSibling;
        else if (dir === 'delete' && offset === node.textContent.length) candidate = node.nextSibling;
    } else {
        const idx = dir === 'backspace' ? range.startOffset - 1 : range.startOffset;
        candidate = node.childNodes[idx] || null;
    }
    if (!candidate) return null;
    if (candidate.nodeType === Node.TEXT_NODE && candidate.textContent === '') {
        candidate = dir === 'backspace' ? candidate.previousSibling : candidate.nextSibling;
    }
    if (candidate?.nodeType === Node.ELEMENT_NODE) {
        if (candidate.classList?.contains('item-inline-img')) return candidate;
        const wrap = candidate.closest ? candidate.closest('.item-img-wrap') : null;
        return wrap ? wrap.querySelector('img.item-inline-img') : null;
    }
    return null;
}

function nodeHasContent(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim() !== '';
    if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList?.contains('item-inline-img')) return true;
        for (const c of node.childNodes) if (nodeHasContent(c)) return true;
    }
    return false;
}

function isCaretAtEnd(textEl) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return true;
    const range = sel.getRangeAt(0);
    if (!textEl.contains(range.commonAncestorContainer)) return true;
    let node = range.endContainer;
    let offset = range.endOffset;
    if (node.nodeType === Node.TEXT_NODE) {
        if (offset < node.textContent.length) return false;
    } else {
        for (const c of Array.from(node.childNodes).slice(offset)) {
            if (nodeHasContent(c)) return false;
        }
    }
    while (node && node !== textEl) {
        let sib = node.nextSibling;
        while (sib) {
            if (nodeHasContent(sib)) return false;
            sib = sib.nextSibling;
        }
        node = node.parentNode;
    }
    return true;
}

function isCaretAtStart(textEl) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!textEl.contains(range.commonAncestorContainer)) return false;
    const r = document.createRange();
    r.selectNodeContents(textEl);
    r.setEnd(range.startContainer, range.startOffset);
    return r.toString() === '';
}

function isTailOnlyMarkers(text) {
    return !text.replace(/[*_~`=]/g, '').trim();
}

function splitTailAtCaret(textEl) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    if (!textEl.contains(range.commonAncestorContainer)) return '';
    if (!textEl.hasChildNodes()) return '';
    const tailRange = document.createRange();
    tailRange.setStart(range.startContainer, range.startOffset);
    tailRange.setEnd(textEl, textEl.childNodes.length);
    if (tailRange.collapsed) return '';
    const holder = document.createElement('div');
    holder.appendChild(tailRange.extractContents());
    const tail = contentFromElement(holder);
    const restore = () => {
        const nodes = Array.from(holder.childNodes).filter((n) => {
            if (n.nodeType === Node.ELEMENT_NODE && /^(STRONG|B|EM|I|CODE|DEL|S|STRIKE|MARK|A)$/.test(n.tagName) && !n.textContent.trim()) return false;
            return true;
        });
        textEl.append(...nodes);
    };
    if (!tail.trim() || isTailOnlyMarkers(tail)) {
        restore();
        return '';
    }
    if (!contentFromElement(textEl).trim()) {
        restore();
        return '';
    }
    return tail;
}

function wireInlineImages(textEl, id) {
    textEl.querySelectorAll('img.item-inline-img').forEach((img) => {
        if (img.parentElement?.classList?.contains('item-img-wrap')) return;
        const wrap = document.createElement('span');
        wrap.className = 'item-img-wrap relative inline-block align-top';
        const del = document.createElement('button');
        del.type = 'button';
        del.contentEditable = 'false';
        del.className = 'img-del absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded bg-black/60 text-white opacity-0 hover:opacity-100 transition z-10';
        del.title = 'Hapus gambar';
        del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        del.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteImage(id, img.getAttribute('src'));
        });
        img.parentElement.insertBefore(wrap, img);
        wrap.append(img, del);
    });
}

function wireNoteContent(noteEl) {
    noteEl.addEventListener('click', (e) => {
        const link = e.target.closest('.internal-link');
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            navigateLink(link.dataset.id);
            return;
        }
        const tag = e.target.closest('.item-tag');
        if (tag) {
            e.preventDefault();
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('dyn:tag-click', { detail: { tag: tag.textContent.replace(/^#/, '') } }));
        }
    });
}

async function deleteImage(id, url) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    const path = String(url || '').split('/storage/')[1] || '';
    const content = rec.node.content || '';
    const next = content.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(url)}\\)`), ' ').replace(/\s{2,}/g, ' ').trim();
    if (next !== content) {
        rec.node.content = next;
    }
    render();
    if (path.startsWith('images/')) {
        api.delete(`/documents/${docId}/images`, { path }).catch(() => {});
    }
    if (next !== content) {
        api.patch(`/documents/${docId}/items/${id}`, { content: next }).catch((e) => {
            rec.node.content = content;
            render();
            showFailedAlert(e.message);
        });
    }
}

function contentFromElement(el) {
    let out = '';
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'IMG') {
                out += `![](${node.getAttribute('src') || ''})`;
            } else if (node.tagName === 'BR') {
                out += '\n';
            } else if (node.classList && node.classList.contains('internal-link')) {
                out += `[[${node.textContent}|${node.dataset.id}]]`;
            } else if (node.tagName === 'STRONG' || node.tagName === 'B') {
                if (node.textContent) out += `**${node.textContent}**`;
            } else if (node.tagName === 'EM' || node.tagName === 'I') {
                if (node.textContent) out += `__${node.textContent}__`;
            } else if (node.tagName === 'CODE') {
                if (node.textContent) out += `\`${node.textContent}\``;
            } else if (node.classList && node.classList.contains('md-codeblock')) {
                let code = '';
                for (const c of node.childNodes) {
                    if (c.nodeType === Node.ELEMENT_NODE && c.tagName === 'BR') code += '\n';
                    else code += c.textContent || '';
                }
                out += `\`\`\`${code}\`\`\``;
            } else if (node.tagName === 'DEL' || node.tagName === 'S' || node.tagName === 'STRIKE') {
                out += `~~${node.textContent}~~`;
            } else if (node.tagName === 'MARK') {
                out += `==${node.textContent}==`;
            } else if (node.classList && (node.classList.contains('katex-display') || node.classList.contains('katex'))) {
                const ann = node.querySelector('annotation[encoding="application/x-tex"]');
                if (ann) out += `$$${ann.textContent}$$`;
                else node.childNodes.forEach(walk);
            } else if (node.tagName === 'A') {
                out += `[${node.textContent}](${node.getAttribute('href') || ''})`;
            } else {
                node.childNodes.forEach(walk);
            }
        }
    };
    walk(el);
    return out;
}

function isOverdue(node) {
    if (node.checked) return false;
    const matches = String(node.content || '').match(/[!@](\d{4}-\d{2}-\d{2})/g);
    if (!matches) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return matches.some((d) => {
        const m = d.match(/[!@](\d{4}-\d{2}-\d{2})/);
        return m && new Date(m[1]) < today;
    });
}

function toggleMulti(id) {
    if (multi.has(id)) multi.delete(id);
    else multi.add(id);
    selectedId = id;
    refreshHighlights();
}

function clearMulti() {
    if (!multi.size) return;
    multi.clear();
    selAnchor = null;
    selEdge = null;
    refreshHighlights();
}

function refreshHighlights() {
    els.outline.querySelectorAll('.item-row').forEach((r) => {
        r.classList.remove('selected', 'multi-selected');
        if (multi.has(r.dataset.id)) r.classList.add('multi-selected');
        else if (r.dataset.id === selectedId) r.classList.add('selected');
    });
}

async function bulkComplete(checked) {
    const targets = flat.filter((f) => multi.has(f.node.id) && (f.node.bullet || 'bullet') === 'checklist');
    if (!targets.length) return;
    recordUndo();
    targets.forEach((f) => { f.node.checked = checked; });
    clearMulti();
    render();
    Promise.all(targets.map((f) => api.patch(`/documents/${docId}/items/${f.node.id}`, { checked }).catch(() => {}))).catch(() => loadItems());
}

async function bulkDelete() {
    const ids = [...multi].map(resolveItemId);
    if (!ids.length) return;
    recordUndo();
    const allIds = new Set(ids);
    for (const id of ids) {
        const node = findNodeInTree(id);
        if (node && node.children) {
            const collectChildren = (children) => {
                for (const child of children) {
                    if (!allIds.has(child.id)) {
                        allIds.add(child.id);
                        if (child.children) collectChildren(child.children);
                    }
                }
            };
            collectChildren(node.children);
        }
    }
    const idx = flat.findIndex(f => ids.includes(f.node.id));
    ids.forEach((id) => {
        removeNodeLocally(id);
        collapsed.delete(id);
        multi.delete(id);
    });
    selAnchor = null;
    selEdge = null;
    if (selectedId && allIds.has(selectedId)) selectedId = null;
    buildFlat();
    applyZoomFilter();
    render();
    const target = flat[Math.max(0, Math.min(idx, flat.length - 1))];
    if (target) selectItem(target.node.id);
    try {
        await api.post(`/documents/${docId}/items-delete-batch`, { ids: [...allIds] });
        toast(`${allIds.size} item dihapus. Pulihkan dari Trash.`);
    } catch (e) {
        showFailedAlert('Gagal menghapus: ' + e.message);
        loadItems();
    }
}

async function openLinkPicker(id) {
    if (linkPickerTarget !== null || editing === false) return;
    linkPickerTarget = id;
    linkPickerRange = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
        const rec = rows.get(id);
        if (rec && rec.text.contains(sel.anchorNode)) linkPickerRange = sel.getRangeAt(0).cloneRange();
    }
    const { open } = await import('./quick-finder');
    window.addEventListener('dyn:link-picked', onLinkPicked, { once: true });
    open('link');
}

async function onLinkPicked(e) {
    const item = e.detail;
    const id = linkPickerTarget;
    linkPickerTarget = null;
    const rec = rows.get(id);
    if (!rec) return;
    const label = (item.content || '').trim() || 'Item';
    const linkText = `[[${label}|${item.id}]]`;
    if (linkPickerRange) {
        const range = linkPickerRange;
        linkPickerRange = null;
        let container = range.startContainer;
        let offset = range.startOffset;
        if (container.nodeType === Node.TEXT_NODE && offset >= 2 && container.textContent.slice(offset - 2, offset) === '[[') {
            container.replaceData(offset - 2, 2, '');
            offset -= 2;
        }
        range.deleteContents();
        range.insertNode(document.createTextNode(linkText));
        const caret = document.createRange();
        caret.setStart(range.endContainer, range.endOffset);
        caret.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(caret);
        return;
    }
    const html = contentFromElement(rec.text).replace(/\[\[\s*$/, linkText);
    rec.text.innerHTML = contentHtml(html);
    wireInlineImages(rec.text, id);
    const range = document.createRange();
    range.selectNodeContents(rec.text);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

async function navigateLink(itemId) {
    try {
        const data = await api.get(`/finder/items/${itemId}`);
        const { document_id: targetDoc, id } = data.data;
        if (!targetDoc) return showFailedAlert('Item tidak ditemukan.');
        if (String(targetDoc) === String(docId)) {
            await zoomToItem(id);
        } else {
            await openDocument(targetDoc);
            await zoomToItem(id);
        }
    } catch (err) {
        showFailedAlert(err.message);
    }
}

function loadPrefs() {
    try {
        const s = JSON.parse(localStorage.getItem('abclist_prefs') || '{}');
        theme = s.theme || 'light';
        spacing = ['dense', 'normal', 'wide'].includes(s.spacing) ? s.spacing : 'normal';
        defaultBullet = ['bullet', 'checklist', 'numbered'].includes(s.defaultBullet) ? s.defaultBullet : 'bullet';
        fontSize = ['small', 'medium', 'large'].includes(s.fontSize) ? s.fontSize : 'medium';
        highlightCurrent = s.highlightCurrent !== false;
        narrow = s.narrow === true;
        showWordCount = s.showWordCount !== false;
        bulletZoom = s.bulletZoom === true;
        reminderNotify = s.reminderNotify === true;
        globalCompleted = ['show', 'hide'].includes(s.globalCompleted)
            ? s.globalCompleted
            : (s.showCompleted !== false ? 'show' : 'hide');
        globalNotes = ['show', 'first', 'hide'].includes(s.globalNotes)
            ? s.globalNotes
            : (s.showNotes !== false ? 'show' : 'hide');
    } catch {
        // ignore
    }
}

function savePrefs() {
    try {
        localStorage.setItem('abclist_prefs', JSON.stringify({
            theme, spacing, defaultBullet, fontSize, highlightCurrent, narrow, showWordCount, bulletZoom,
            globalCompleted, globalNotes, reminderNotify,
        }));
    } catch {
        // ignore
    }
}

function applyEffectiveView() {
    showCompleted = completedOverride !== null ? completedOverride === 'show' : globalCompleted === 'show';
    notesMode = notesOverride !== null ? notesOverride : globalNotes;
}

function applyTheme() {
    document.body.dataset.theme = theme;
}

function clearDropIndicators() {
    els.outline.querySelectorAll('.item-row.drop-before, .item-row.drop-after, .item-row.drop-child')
        .forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-child'));
}

function startDragScroll() {
    if (dragScrollTimer) return;
    dragScrollTimer = setInterval(() => {
        if (!dragId && !dragIds) return;
        const view = els.view;
        if (!view || !lastDragPoint) return;
        const r = view.getBoundingClientRect();
        const edge = 70;
        if (lastDragPoint.y < r.top + edge) {
            view.scrollTop = Math.max(0, view.scrollTop - 16);
        } else if (lastDragPoint.y > r.bottom - edge) {
            view.scrollTop += 16;
        }
    }, 40);
}

function stopDragScroll() {
    if (dragScrollTimer) {
        clearInterval(dragScrollTimer);
        dragScrollTimer = null;
    }
    lastDragPoint = null;
}

document.addEventListener('dragend', stopDragScroll);

// ── drag item lewat sentuhan (long-press pada bullet) ────────────────────
function initTouchDrag(bullet, node) {
    bullet.addEventListener('touchstart', (e) => {
        if (editing || e.touches.length !== 1) return;
        touchDragTimer = setTimeout(() => {
            touchDragTimer = null;
            const ids = multi.size > 1 && multi.has(node.id) ? [...multi] : [node.id];
            touchDrag = { id: node.id, ids };
            dragCopy = false;
            const rec = rows.get(node.id);
            if (rec) rec.row.classList.add('opacity-40');
            if (navigator.vibrate) navigator.vibrate(10);
        }, 450);
    }, { passive: true });
    bullet.addEventListener('touchmove', (e) => {
        if (!touchDrag || e.touches.length !== 1) return;
        e.preventDefault();
        const t = e.touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const row = el && el.closest ? el.closest('.item-row') : null;
        clearDropIndicators();
        if (row && !touchDrag.ids.includes(row.dataset.id)) {
            const rec = rows.get(row.dataset.id);
            if (!rec) return;
            const r = row.getBoundingClientRect();
            const y = t.clientY - r.top;
            if (y < r.height * 0.3) {
                dropAction = { type: 'before', target: rec.node };
                row.classList.add('drop-before');
            } else if (y > r.height * 0.7) {
                dropAction = { type: 'after', target: rec.node };
                row.classList.add('drop-after');
            } else {
                dropAction = { type: 'child', target: rec.node };
                row.classList.add('drop-child');
            }
        } else {
            dropAction = null;
        }
    }, { passive: false });
    bullet.addEventListener('touchend', (e) => {
        if (touchDragTimer) {
            clearTimeout(touchDragTimer);
            touchDragTimer = null;
            return;
        }
        if (!touchDrag) return;
        e.preventDefault();
        const action = dropAction;
        const drag = touchDrag;
        touchDrag = null;
        dropAction = null;
        clearDropIndicators();
        const rec = rows.get(drag.id);
        if (rec) rec.row.classList.remove('opacity-40');
        if (action && !drag.ids.includes(action.target.id)) {
            if (dragCopy) doCopyDrop(drag.id, action);
            else if (drag.ids.length > 1) doMoveMany(drag.ids, action);
            else doMove(drag.id, action);
        }
    });
    bullet.addEventListener('touchcancel', () => {
        if (touchDragTimer) {
            clearTimeout(touchDragTimer);
            touchDragTimer = null;
        }
        if (touchDrag) {
            touchDrag = null;
            dropAction = null;
            clearDropIndicators();
            const rec = rows.get(node.id);
            if (rec) rec.row.classList.remove('opacity-40');
        }
    });
}

function indexAmongSiblings(node) {
    const group = flat.filter((f) => (f.node.parent_id || null) === (node.parent_id || null));
    return group.findIndex((f) => f.node.id === node.id);
}

function numberedLabel(node) {
    // Penomoran hierarkis persis view publik (share/publish): 1, 1.1, 1.2.3, dst.
    const parts = [];
    let cur = node;
    while (cur) {
        parts.unshift(indexAmongSiblings(cur) + 1);
        const parent = flat.find((f) => f.node.id === cur.parent_id);
        cur = parent ? parent.node : null;
    }
    return parts.join('.');
}

function childCount(id) {
    return flat.filter((f) => (f.node.parent_id || null) === id).length;
}

function isDescendant(ancestorId, id) {
    const f = flat.find((x) => x.node.id === id);
    return f ? f.parents.includes(ancestorId) : false;
}

async function insertDroppedFiles(dt, parentId) {
    const files = [...(dt?.files || [])];
    const text = dt ? dt.getData('text/plain') : '';
    if (!files.length && !text) return;
    recordUndo();
    let position = parentId ? childCount(parentId) : flat.filter((f) => !f.node.parent_id).length;
    const promises = [];
    const tempIds = [];
    if (!files.length) {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        lines.forEach((line) => {
            const tmpId = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${position}`;
            const tmpNode = { id: tmpId, parent_id: parentId, content: line, note: '', checked: false, heading: 0, color: null, bullet: defaultBullet, tags: [], sort_order: position, children: [] };
            insertNodeLocally(parentId, position, tmpNode);
            tempIds.push(tmpId);
            promises.push(api.post(`/documents/${docId}/items`, { parent_id: parentId, position, content: line }).then((d) => ({ tmpId, realId: d.data.id })).catch(() => ({ tmpId, realId: null })));
            position++;
        });
    } else {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                promises.push(uploadImage(file).then((url) => {
                    if (url) return api.post(`/documents/${docId}/items`, { parent_id: parentId, position, content: `![](${url})` }).then((d) => ({ tmpId: null, realId: d.data.id }));
                    return null;
                }).catch(() => null));
                position++;
                continue;
            }
            try {
                const body = await file.text();
                const lines = body.split(/\r?\n/).filter((l) => l.trim());
                lines.forEach((line) => {
                    promises.push(api.post(`/documents/${docId}/items`, { parent_id: parentId, position, content: line.slice(0, 5000) }).then((d) => ({ tmpId: null, realId: d.data.id })).catch(() => null));
                    position++;
                });
            } catch {
                promises.push(api.post(`/documents/${docId}/items`, { parent_id: parentId, position, content: `[${file.name}](${file.name})` }).then((d) => ({ tmpId: null, realId: d.data.id })).catch(() => null));
                position++;
            }
        }
    }
    buildFlat(); applyZoomFilter(); render();
    const results = await Promise.all(promises);
    const firstReal = results.find((r) => r?.realId);
    if (firstReal) selectItem(firstReal.realId);
    loadItems();
}

async function doMove(id, action) {
    const rec = rows.get(id);
    const node = rec?.node;
    if (!node) return;
    recordUndo();
    const target = action.target;
    let parentId = null;
    let position = 0;

    if (action.type === 'child') {
        if (isDescendant(id, target.id)) {
            showFailedAlert('Tidak bisa memindahkan item ke dalam anaknya sendiri.');
            return;
        }
        parentId = target.id;
        position = childCount(target.id);
    } else {
        parentId = target.parent_id || null;
        position = indexAmongSiblings(target) + (action.type === 'after' ? 1 : 0);
    }

    if (parentId === (node.parent_id || null) && action.type !== 'child') {
        const cur = indexAmongSiblings(node);
        let newPos = position;
        if (cur < position) newPos -= 1;
        position = newPos;
    }

    removeNodeLocally(id);
    node.parent_id = parentId;
    insertNodeLocally(parentId, position, node);
    buildFlat(); applyZoomFilter(); render(); selectItem(id);
    api.post(`/documents/${docId}/items/${id}/move`, { parent_id: parentId, position }).catch((e) => {
        showFailedAlert(e.message);
        loadItems();
    });
}

async function doCopyDrop(id, action) {
    const rec = rows.get(id);
    const node = rec?.node;
    if (!node) return;
    recordUndo();
    const target = action.target;
    let parentId = null;
    let position = 0;

    if (action.type === 'child') {
        if (isDescendant(id, target.id)) {
            showFailedAlert('Tidak bisa menyalin item ke dalam dirinya sendiri.');
            return;
        }
        parentId = target.id;
        position = childCount(target.id);
    } else {
        parentId = target.parent_id || null;
        position = indexAmongSiblings(target) + (action.type === 'after' ? 1 : 0);
    }

    const tempNode = buildTempNodeFromSnapshot(snapshotNode(node), parentId);
    insertNodeLocally(parentId, position, tempNode);
    buildFlat();
    applyZoomFilter();
    render();
    selectItem(tempNode.id);

    try {
        await persistPastedNode(tempNode, parentId, position);
    } catch (e) {
        showFailedAlert(e.message);
        loadItems();
    }
}

async function doMoveMany(ids, action) {
    const target = action.target;
    const ordered = ids
        .map((id) => rows.get(id)?.node)
        .filter(Boolean)
        .sort((a, b) => {
            const ai = flat.findIndex((f) => f.node.id === a.id);
            const bi = flat.findIndex((f) => f.node.id === b.id);
            return ai - bi;
        });
    if (!ordered.length) return;
    recordUndo();
    const promises = [];
    if (action.type === 'child') {
        const base = childCount(target.id);
        ordered.forEach((n, i) => {
            removeNodeLocally(n.id);
            n.parent_id = target.id;
            insertNodeLocally(target.id, base + i, n);
            promises.push(api.post(`/documents/${docId}/items/${n.id}/move`, { parent_id: target.id, position: base + i }).catch(() => {}));
        });
    } else {
        const parentId = target.parent_id || null;
        const base = indexAmongSiblings(target) + (action.type === 'after' ? 1 : 0);
        ordered.forEach((n, i) => {
            removeNodeLocally(n.id);
            n.parent_id = parentId;
            insertNodeLocally(parentId, base + i, n);
            promises.push(api.post(`/documents/${docId}/items/${n.id}/move`, { parent_id: parentId, position: base + i }).catch(() => {}));
        });
    }
    buildFlat(); applyZoomFilter(); render(); selectItem(ordered[ordered.length - 1].id);
    Promise.all(promises).then(() => loadItems()).catch(() => loadItems());
}

function openNoteEditor(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const existing = rec.row.querySelector('.item-note-editor');
    if (existing) existing.remove();
    const ta = document.createElement('textarea');
    ta.className = 'item-note-editor mt-1 w-full text-[13px] rounded border border-[#d9a441] px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#d9a441]/30';
    ta.rows = 2;
    ta.value = rec.node.note || '';
    rec.cell.insertBefore(ta, rec.text.nextSibling);
    ta.focus();

    let done = false;
    const finish = (save) => {
        if (done) return;
        done = true;
        const value = ta.value.trim();
        ta.remove();
        if (save && value !== (rec.node.note || '')) {
            recordUndo();
            const prev = rec.node.note;
            rec.node.note = value;
            render();
            api.patch(`/documents/${docId}/items/${id}`, { note: value }).catch((e) => {
                rec.node.note = prev;
                render();
                showFailedAlert(e.message);
            });
        } else if (!save) {
            render();
        }
    };
    ta.addEventListener('blur', () => finish(true));
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false);
        }
    });
}

function collectHiddenIds() {
    const hidden = [];
    const depthFirst = (id) => {
        for (const f of flat) {
            if (f.node.parent_id === id) {
                hidden.push(f.node.id);
                depthFirst(f.node.id);
            }
        }
    };
    for (const f of flat) {
        if (collapsed.has(f.node.id) && Array.isArray(f.node.children) && f.node.children.length) {
            depthFirst(f.node.id);
        }
    }
    return hidden;
}

export function getHiddenIds() {
    return collectHiddenIds();
}

function openListExportDialog(itemId) {
    const rec = rows.get(itemId);
    const label = rec
        ? (rec.node.content || '(tanpa nama)').replace(/[#*_`=]+/g, '').trim()
        : 'list';
    Swal.fire({
        title: 'Export list',
        html: `<div class="text-left">
            <p class="mb-2 text-[13px]">Export <b>${esc(label || '(tanpa nama)')}</b> beserta sub-itemnya — salin konten di bawah atau unduh sebagai file.</p>
            <div class="flex items-center gap-2">
                <select id="list-export-format" class="flex-1 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[13px] bg-white">
                    <option value="markdown">Markdown (.md)</option>
                    <option value="opml">OPML (.opml)</option>
                    <option value="json">JSON (.json)</option>
                </select>
                <select id="list-export-indent" class="flex-1 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[13px] bg-white">
                    <option value="spaces">Indent: 2 spasi</option>
                    <option value="asterisks">Bullet: tanda bintang</option>
                    <option value="dashes">Bullet: tanda strip</option>
                    <option value="none">Tanpa indent</option>
                </select>
            </div>
            <label class="flex items-center gap-2 mt-2 text-[13px] text-[#3b3936]">
                <input id="list-export-visible" type="checkbox" class="rounded accent-[#d9a441]">
                Export hanya item yang terlihat (abaikan yang terlipat)
            </label>
            <textarea id="list-export-body" readonly class="mt-2 w-full h-52 resize-y rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[12px] font-mono bg-[#faf9f8] text-[#3b3936]"></textarea>
            <div class="flex items-center gap-2 mt-2">
                <button id="list-export-copy" type="button" class="rounded-lg bg-[#7b61ff] px-3 py-1.5 text-[13px] text-white hover:bg-[#6a4fef]">Salin ke clipboard</button>
                <button id="list-export-download" type="button" class="rounded-lg border border-[#e0dcd5] px-3 py-1.5 text-[13px] text-[#3b3936] hover:bg-[#f4f2ee]">Unduh file</button>
            </div>
        </div>`,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: async () => {
            const fmt = document.getElementById('list-export-format');
            const indent = document.getElementById('list-export-indent');
            const visible = document.getElementById('list-export-visible');
            const body = document.getElementById('list-export-body');
            const load = async () => {
                try {
                    const params = new URLSearchParams({ format: fmt.value, item_id: itemId, indent: indent.value });
                    if (visible.checked) params.set('hidden', JSON.stringify(collectHiddenIds()));
                    const res = await api.get(`/documents/${docId}/export?${params}`);
                    body.value = res.data.content;
                    body.dataset.filename = res.data.filename;
                } catch (e) {
                    body.value = e.message;
                }
            };
            const download = () => {
                const name = body.dataset.filename || `list.${fmt.value}`;
                const blob = new Blob([body.value], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast(`List diexport sebagai ${name}.`);
            };
            fmt.addEventListener('change', load);
            indent.addEventListener('change', load);
            visible.addEventListener('change', load);
            document.getElementById('list-export-copy').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(body.value);
                    toast('Konten export disalin ke clipboard.');
                } catch {
                    toast('Gagal menyalin ke clipboard.', 'error');
                }
            });
            document.getElementById('list-export-download').addEventListener('click', download);
            await load();
        },
    });
}

function collectTags() {
    const map = new Map();
    const walk = (nodes) => {
        for (const n of nodes) {
            const m = String(n.content || '').match(/#[A-Za-z0-9_-]+/g);
            if (m) m.forEach((t) => map.set(t.toLowerCase(), (map.get(t.toLowerCase()) || 0) + 1));
            if (Array.isArray(n.children)) walk(n.children);
        }
    };
    walk(tree);
    return map;
}

function renderTags() {
    if (!els.tags) return;
    els.tags.innerHTML = '';
    const map = collectTags();
    if (!map.size) {
        els.tags.classList.add('hidden');
        return;
    }
    els.tags.classList.remove('hidden');
    [...map.entries()].sort().forEach(([tag, count]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `chip-tag px-2.5 py-1 rounded-full text-[12px] border transition ${
            tagFilter === tag ? 'active' : ''
        }`;
        chip.innerHTML = `<span style="color:${getTagColor(tag) || '#c07a12'}">${tag}</span> ${count}`;
        chip.addEventListener('click', () => {
            tagFilter = tagFilter === tag ? null : tag;
            renderTags();
            render();
        });
        els.tags.append(chip);
    });
}

function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    saveUiState();
    render();
}

async function zoomInto(id) {
    const node = rows.get(id)?.node;
    if (!node) return;
    zoomId = id;
    selectedId = id;
    await loadItems();
    selectItem(id);
    scrollFocusCenter(id);
    updateZoomBar();
    saveUiState();
}

async function exitZoom() {
    zoomId = null;
    selectedId = null;
    await loadItems();
    updateZoomBar();
    saveUiState();
}

async function zoomOutLevel() {
    if (!zoomId) {
        await exitZoom();
        return;
    }
    const path = findAncestorPath(tree, zoomId);
    if (!path || path.length <= 1) {
        await exitZoom();
        return;
    }
    const parent = path[path.length - 2];
    zoomId = parent.id;
    selectedId = parent.id;
    await loadItems();
    selectItem(parent.id);
    scrollFocusCenter(parent.id);
    updateZoomBar();
    saveUiState();
}

// Auto-scroll item yang di-zoom ke tengah viewport (mirip Dynalist) agar fokus
// langsung terlihat jelas saat berpindah level zoom.
function scrollFocusCenter(id) {
    const rec = rows.get(id);
    if (rec && rec.row) rec.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function containsNode(node, targetId) {
    if (!node) return false;
    if (node.id === targetId) return true;
    if (Array.isArray(node.children)) {
        for (const c of node.children) if (containsNode(c, targetId)) return true;
    }
    return false;
}

// Persis Dynalist: Ctrl+Shift+] / Ctrl+Shift+[ = zoom ke item berikutnya/sebelumnya
// pada level saat ini (antar top-level item pada zoom aktif, atau antar item akar).
function zoomToSiblingItem(dir) {
    let levelNodes;
    if (zoomId) {
        const root = findNodeInTree(zoomId);
        levelNodes = root ? (root.children || []) : [];
    } else {
        levelNodes = tree;
    }
    if (!levelNodes.length) return;
    let idx = -1;
    const anchorId = selectedId || zoomId;
    if (levelNodes.some((s) => s.id === anchorId)) {
        idx = levelNodes.findIndex((s) => s.id === anchorId);
    } else {
        for (let i = 0; i < levelNodes.length; i++) {
            if (containsNode(levelNodes[i], anchorId)) { idx = i; break; }
        }
    }
    if (idx === -1) idx = 0;
    const targetIdx = dir === 'next' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= levelNodes.length) {
        toast(dir === 'next' ? 'Sudah item terakhir pada level ini.' : 'Sudah item pertama pada level ini.');
        return;
    }
    zoomInto(levelNodes[targetIdx].id);
}

function collapseAll() {
    flat.forEach((f) => {
        if (Array.isArray(f.node.children) && f.node.children.length) collapsed.add(f.node.id);
    });
    saveUiState();
    render();
}

function expandAll() {
    collapsed.clear();
    saveUiState();
    render();
}

function collapseSiblings(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const pid = rec.node.parent_id || null;
    flat.forEach((f) => {
        if (f.node.id === id) return;
        if ((f.node.parent_id || null) === pid && Array.isArray(f.node.children) && f.node.children.length) collapsed.add(f.node.id);
    });
    saveUiState();
    render();
}

function expandSiblings(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const pid = rec.node.parent_id || null;
    flat.forEach((f) => {
        if ((f.node.parent_id || null) === pid) collapsed.delete(f.node.id);
    });
    saveUiState();
    render();
}

function expandToLevel(level) {
    collapsed.clear();
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            if (Array.isArray(n.children) && n.children.length) {
                if (depth >= level) collapsed.add(n.id);
                walk(n.children, depth + 1);
            }
        }
    };
    walk(tree, 1);
    saveUiState();
    render();
}

async function sortChildren(id, order) {
    recordUndo();
    const rec = rows.get(id);
    if (!rec) return;
    const children = flat.filter((f) => f.node.parent_id === id).map((f) => f.node);
    if (order === 'default') { /* no-op, restore original order */ }
    else if (order === 'name_asc') children.sort((a, b) => (a.content || '').localeCompare(b.content || ''));
    else if (order === 'name_desc') children.sort((a, b) => (b.content || '').localeCompare(a.content || ''));
    else if (order === 'checked') children.sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
    else if (order === 'checked_desc') children.sort((a, b) => (b.checked ? 1 : 0) - (a.checked ? 1 : 0));
    else if (order === 'updated_desc') children.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    else if (order === 'updated_asc') children.sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
    else if (order === 'created_desc') children.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (order === 'created_asc') children.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    else if (order === 'reverse') children.reverse();
    else if (order === 'shuffle') {
        for (let i = children.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [children[i], children[j]] = [children[j], children[i]]; }
    }
    const treeParent = id ? findNodeInTree(id) : null;
    if (treeParent) { treeParent.children = children; children.forEach((c) => { c.parent_id = id; }); }
    buildFlat(); applyZoomFilter(); render();
    api.post(`/documents/${docId}/items/${id}/sort`, { order }).catch((e) => { showFailedAlert(e.message); loadItems(); });
}

async function toggleCheckChildren(id, checked) {
    recordUndo();
    flat.filter((f) => f.parents.includes(id) || f.node.id === id).forEach((f) => { f.node.checked = checked; });
    render();
    api.post(`/documents/${docId}/items/${id}/toggle-check-children`, { checked }).catch((e) => { showFailedAlert(e.message); loadItems(); });
}

function openMovePicker(id) {
    import('./quick-finder').then(({ open }) => {
        open('move', (it) => {
            if (!it || it.type === 'folder' || it.id === docId) return;
            moveItemToDocument(id, it.id);
        });
    });
}

async function moveItemToDocument(id, targetDocId) {
    recordUndo();
    removeNodeLocally(id);
    buildFlat(); applyZoomFilter(); render();
    showSuccess('Item dipindahkan');
    Promise.all([
        api.post(`/documents/${docId}/items/${id}/move-document`, { target_document_id: targetDocId }).catch(() => {}),
        loadTree(),
    ]).catch(() => loadItems());
}

export async function moveItemsToDocument(ids, targetDocId) {
    const roots = ids.filter((id) => !ids.some((o) => o !== id && flat.find((f) => f.node.id === id)?.parents.includes(o)));
    recordUndo();
    roots.forEach((id) => removeNodeLocally(id));
    buildFlat(); applyZoomFilter(); render();
    showSuccess(roots.length > 1 ? `${roots.length} item dipindahkan` : 'Item dipindahkan');
    Promise.all([
        ...roots.map((id) => api.post(`/documents/${docId}/items/${id}/move-document`, { target_document_id: targetDocId }).catch(() => {})),
        loadTree(),
    ]).catch(() => loadItems());
}

function snapshotNode(node) {
    const s = {
        content: node.content || '',
        note: node.note || '',
        checked: !!node.checked,
        heading: node.heading || 0,
        color: node.color || null,
        bullet: node.bullet || 'bullet',
    };
    if (Array.isArray(node.children) && node.children.length) {
        s.children = node.children.map(snapshotNode);
    }
    return s;
}

function snapshotToText(s, depth) {
    let out = '\t'.repeat(depth) + (s.content || '');
    if (Array.isArray(s.children)) {
        for (const c of s.children) out += '\n' + snapshotToText(c, depth + 1);
    }
    return out;
}

function collectClipboard() {
    const ids = multi.size > 1 ? [...multi] : selectedId ? [selectedId] : [];
    const snapshots = [];
    for (const id of ids) {
        const f = flat.find((x) => x.node.id === id);
        if (f) snapshots.push(snapshotNode(f.node));
    }
    return snapshots;
}

async function copyItems() {
    const snapshots = collectClipboard();
    if (!snapshots.length) return;
    itemClipboard = { snapshots, cut: false };
    try {
        await navigator.clipboard.writeText(snapshots.map((s) => snapshotToText(s, 0)).join('\n'));
    } catch { /* clipboard teks tidak tersedia */ }
    showSuccess('Item disalin');
}

async function cutItems() {
    const ids = multi.size > 1 ? [...multi] : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    await copyItems();
    if (ids.length > 1) await bulkDelete();
    else await deleteItem(selectedId);
}

function buildTempNodeFromSnapshot(snap, parentId) {
    const tempId = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const node = {
        id: tempId,
        parent_id: parentId || null,
        content: snap.content || '',
        note: snap.note || '',
        checked: !!snap.checked,
        heading: snap.heading || 0,
        color: snap.color || null,
        bullet: snap.bullet || 'bullet',
        tags: [],
        sort_order: 0,
        children: [],
    };
    if (Array.isArray(snap.children)) {
        node.children = snap.children.map((c) => buildTempNodeFromSnapshot(c, tempId));
    }
    return node;
}

async function persistPastedNode(node, parentId, position) {
    const tempId = node.id;
    const realParent = await resolveParentAsync(parentId);
    const promise = api
        .post(`/documents/${docId}/items`, {
            parent_id: realParent,
            position,
            content: node.content || '',
            note: node.note || '',
            checked: !!node.checked,
            heading: node.heading || 0,
            color: node.color || null,
            bullet: node.bullet || 'bullet',
        })
        .then((res) => res.data.id)
        .catch((e) => {
            unregisterPendingItem(tempId);
            throw e;
        });
    registerPendingItem(tempId, promise);
    const realId = await promise;
    node.id = realId;
    node.parent_id = realParent;
    rememberId(tempId, realId);
    if (selectedId === tempId) selectedId = realId;
    if (multi.has(tempId)) { multi.delete(tempId); multi.add(realId); }
    if (selAnchor === tempId) selAnchor = realId;
    if (selEdge === tempId) selEdge = realId;
    if (collapsed.has(tempId)) { collapsed.delete(tempId); collapsed.add(realId); }
    const rec = rows.get(tempId);
    if (rec) {
        rows.delete(tempId);
        rows.set(realId, rec);
        rec.node = node;
        if (rec.row) rec.row.dataset.id = realId;
    }
    unregisterPendingItem(tempId);
    reparentTempChildren(tempId, realId);
    if (Array.isArray(node.children) && node.children.length) {
        for (let i = 0; i < node.children.length; i++) {
            await persistPastedNode(node.children[i], realId, i);
        }
    }
    return realId;
}

async function pasteSnapshots(snapshots, id, mode) {
    recordUndo();
    let parentId;
    let pos;
    if (mode === 'child') {
        parentId = id;
        pos = (rows.get(id)?.node.children || []).length;
    } else {
        const rec = rows.get(id);
        if (!rec) { parentId = null; pos = 0; }
        else { parentId = rec.node.parent_id || null; pos = siblingPosition(rec.node) + 1; }
    }

    const tempNodes = snapshots.map((snap) => buildTempNodeFromSnapshot(snap, parentId));
    tempNodes.forEach((node, i) => insertNodeLocally(parentId, pos + i, node));
    buildFlat();
    applyZoomFilter();
    render();
    const lastTop = tempNodes[tempNodes.length - 1];
    if (lastTop) selectItem(lastTop.id);

    (async () => {
        try {
            for (let i = 0; i < tempNodes.length; i++) {
                await persistPastedNode(tempNodes[i], parentId, pos + i);
            }
            buildFlat();
            applyZoomFilter();
            render();
            refreshHighlights();
        } catch (e) {
            showFailedAlert('Gagal menyimpan item yang di-paste: ' + e.message);
            loadItems();
        }
    })();
}

async function pasteAsChild(id) {
    if (!itemClipboard) return;
    try {
        await pasteSnapshots(itemClipboard.snapshots, id, 'child');
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function pasteAsSibling(id) {
    if (!itemClipboard) return;
    try {
        await pasteSnapshots(itemClipboard.snapshots, id, 'sibling');
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function duplicateItem(id) {
    const rec = rows.get(id);
    if (!rec) return;
    try {
        await pasteSnapshots([snapshotNode(rec.node)], id, 'sibling');
        showSuccess('Item diduplikasi');
    } catch (e) {
        showFailedAlert(e.message);
    }
}

function menuItemsFor(node) {
    const hasChildren = Array.isArray(node.children) && node.children.length;
    const items = [];

    if (multi.size > 1) {
        const ids = [...multi];
        const allChecked = ids.every((id) => flat.find((f) => f.node.id === id)?.node.checked);
        items.push({
            label: `${allChecked ? 'Uncheck' : 'Check off'} (${ids.length})`,
            action: () => bulkComplete(!allChecked),
        });
        items.push({ label: `Delete (${ids.length})`, danger: true, action: () => bulkDelete() });
        items.push('sep');
    }

    if (hasChildren) {
        items.push({
            label: collapsed.has(node.id) ? 'Expand' : 'Collapse',
            shortcut: 'Ctrl+.',
            action: () => toggleCollapse(node.id),
        });
        items.push({ label: 'Collapse all', action: () => collapseAll() });
        items.push({ label: 'Expand all', action: () => expandAll() });
        items.push({
            label: 'Expand to level',
            children: [
                { label: 'Expand to level 1', action: () => expandToLevel(1) },
                { label: 'Expand to level 2', action: () => expandToLevel(2) },
                { label: 'Expand to level 3', action: () => expandToLevel(3) },
                { label: 'Expand to level 4', action: () => expandToLevel(4) },
            ],
        });
        items.push({ label: 'Collapse all siblings', action: () => collapseSiblings(node.id) });
        items.push({ label: 'Expand all siblings', action: () => expandSiblings(node.id) });
    }

    items.push({ label: 'Zoom in', shortcut: 'Ctrl+]', action: () => zoomInto(node.id) });
    items.push({ label: node.note ? 'Edit note' : 'Add note', shortcut: 'Shift+Enter', action: () => openNoteEditor(node.id) });
    items.push({ label: 'Delete', shortcut: 'Ctrl+Shift+Backspace', danger: true, action: () => deleteItem(node.id) });
    items.push('sep');

    items.push({ label: 'Delete checked items', action: () => deleteChecked() });
    items.push({
        label: isItemBookmarked(node.id) ? 'Remove from bookmarks' : 'Add to bookmarks',
        shortcut: 'Ctrl+Alt+N',
        action: () => toggleItemBookmark(node.id),
    });
    if (hasChildren) {
        items.push({
            label: 'Sort',
            children: [
                { label: 'None', action: () => sortChildren(node.id, 'default') },
                { label: 'Title (A to Z)', action: () => sortChildren(node.id, 'name_asc') },
                { label: 'Title (Z to A)', action: () => sortChildren(node.id, 'name_desc') },
                { label: 'Unchecked first', action: () => sortChildren(node.id, 'checked') },
                { label: 'Checked first', action: () => sortChildren(node.id, 'checked_desc') },
                { label: 'Edited (new to old)', action: () => sortChildren(node.id, 'updated_desc') },
                { label: 'Edited (old to new)', action: () => sortChildren(node.id, 'updated_asc') },
                { label: 'Created (new to old)', action: () => sortChildren(node.id, 'created_desc') },
                { label: 'Created (old to new)', action: () => sortChildren(node.id, 'created_asc') },
                { label: 'Reverse current', action: () => sortChildren(node.id, 'reverse') },
            ],
        });
    }
    items.push({ label: 'Search and replace…', action: () => openSr() });
    items.push('sep');

    if (siblingPosition(node) > 0) {
        items.push({
            label: 'Indent',
            shortcut: 'Tab',
            action: () => {
                const ids = multi.size > 1 ? [...multi].filter((x) => flat.some((f) => f.node.id === x)) : [node.id];
                if (ids.length > 1) indentMany(ids);
                else indent(node.id);
            },
        });
    }
    if (node.parent_id) {
        items.push({
            label: 'Unindent',
            shortcut: 'Shift+Tab',
            action: () => {
                const ids = multi.size > 1 ? [...multi].filter((x) => flat.some((f) => f.node.id === x)) : [node.id];
                if (ids.length > 1) unindentMany(ids);
                else unindent(node.id);
            },
        });
    }
    items.push({ label: 'Move to…', shortcut: 'Ctrl+Shift+M', action: () => openMovePicker(node.id) });

    const userTpls = getUserTemplates();
    const tplChildren = [
        ...Object.keys(TEMPLATES).map((name) => ({
            label: name,
            action: () => insertTemplate(node.id, name),
        })),
    ];
    if (userTpls.length) {
        tplChildren.push({ label: '—' });
        userTpls.forEach((t) => {
            tplChildren.push({
                label: t.name,
                action: () => insertTemplate(node.id, t.name),
            });
        });
    }
    items.push({ label: 'Insert template…', children: tplChildren });
    if (hasChildren || node.content) {
        items.push({ label: 'Save as template…', action: () => saveAsTemplate(node.id) });
    }
    items.push('sep');

    // Checkbox — tampilkan sesuai state saat ini (persis ABCLIST)
    const isChecklist = (node.bullet || 'bullet') === 'checklist';
    if (!isChecklist) {
        items.push({ label: 'Add checkbox', shortcut: 'Ctrl+Shift+C', action: () => setBullet(node.id, 'checklist') });
    } else {
        items.push({ label: 'Remove checkbox', shortcut: 'Ctrl+Shift+C', action: () => setBullet(node.id, 'bullet') });
    }
    items.push({
        label: node.checked ? 'Uncheck' : 'Check off',
        shortcut: 'Ctrl+Enter',
        action: () => toggleCheck(node.id),
    });
    if (hasChildren) {
        items.push({ label: 'Add checkbox to children', action: () => setBulletChildren(node.id, 'checklist') });
        items.push({ label: 'Remove checkbox from children', action: () => setBulletChildren(node.id, 'bullet') });
    }
    if (hasChildren) {
        const childNodes = flat.filter((f) => f.node.parent_id === node.id).map((f) => f.node);
        const allNumbered = childNodes.length && childNodes.every((c) => (c.bullet || 'bullet') === 'numbered');
        items.push({ label: 'Number children', action: () => numberChildren(), disabled: allNumbered });
        items.push({ label: 'Stop numbering children', action: () => stopNumberingChildren(), disabled: !allNumbered });
    }
    items.push('sep');

    items.push({ label: 'Manage sharing…', action: () => openItemSharing() });
    items.push({ label: 'Get link', action: () => copyItemLink(node.id) });
    items.push({ label: 'Copy internal link', action: () => copyInternalLink(node.id) });
    items.push({ label: 'Show all references', action: () => openBacklinks(node.id) });
    items.push({ label: 'Export…', action: () => openListExportDialog(node.id) });
    const inboxDoc = findInbox();
    if (inboxDoc) {
        items.push({
            label: 'Add to inbox',
            action: () => moveItemToDocument(node.id, inboxDoc.id),
            disabled: inboxDoc.id === docId,
        });
    }
    const docNode = store.selectedNode;
    if (docNode) {
        items.push({
            label: docNode.is_inbox ? 'Remove as inbox' : 'Set as inbox',
            action: () => {
                const isInbox = !docNode.is_inbox;
                const prev = docNode.is_inbox;
                docNode.is_inbox = isInbox;
                loadTree();
                toast(isInbox ? 'Dokumen dijadikan Inbox' : 'Inbox dihapus dari dokumen');
                api.post(`/documents/${docId}/set-inbox`, { is_inbox: isInbox }).catch((err) => {
                    docNode.is_inbox = prev;
                    loadTree();
                    toast(err.message, 'error');
                });
            },
        });
    }
    items.push('sep');

    const headings = [['Clear heading', 0], ['H1', 1], ['H2', 2], ['H3', 3]];
    headings.forEach(([label, h]) => {
        items.push({
            label: (node.heading || 0) === h ? `✓ ${label}` : label,
            action: () => setHeading(node.id, h),
        });
    });
    items.push('sep');

    const colors = [
        ['Clear color', ''],
        ['Red', '#dc2626'],
        ['Orange', '#ea580c'],
        ['Yellow', '#d9a900'],
        ['Green', '#16a34a'],
        ['Blue', '#2563eb'],
        ['Purple', '#7c3aed'],
    ];
    colors.forEach(([label, c]) => {
        items.push({
            label: (node.color || null) === (c || null) ? `✓ ${label}` : label,
            swatch: c,
            action: () => setColor(node.id, c || null),
        });
    });
    items.push('sep');

    items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: () => copyItems() });
    items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: () => cutItems() });
    items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: () => pasteAsChild(node.id), disabled: !itemClipboard });
    items.push({ label: 'Paste as sibling', shortcut: 'Ctrl+Shift+V', action: () => pasteAsSibling(node.id), disabled: !itemClipboard });
    items.push({ label: 'Duplicate', shortcut: 'Ctrl+Shift+D', action: () => duplicateItem(node.id) });
    items.push({ label: 'Add child', action: () => addChildItem() });
    items.push({ label: 'Add sibling below', action: () => addSiblingBelow() });
    items.push({ label: 'Add sibling above', action: () => addSiblingAbove() });
    items.push({ label: 'Move up', shortcut: 'Ctrl+↑', action: () => move('up') });
    items.push({ label: 'Move down', shortcut: 'Ctrl+↓', action: () => move('down') });
    if (hasChildren) {
        const descendants = flat.filter((f) => f.parents.includes(node.id)).map((f) => f.node);
        const anyUnchecked = descendants.some((n) => !n.checked);
        items.push({
            label: anyUnchecked ? 'Check off all children' : 'Uncheck all children',
            action: () => toggleCheckChildren(node.id, anyUnchecked),
        });
        items.push({ label: 'Deduplicate children', action: () => deduplicateChildren(node.id) });
    }
    items.push('sep');
    items.push({ label: 'Revision history…', action: () => openRevisions(node.id) });

    const currentBullet = node.bullet || 'bullet';
    items.push({
        label: 'Bullet type',
        children: [
            { label: currentBullet === 'bullet' ? '✓ Bullet' : 'Bullet', action: () => setBullet(node.id, 'bullet') },
            { label: currentBullet === 'numbered' ? '✓ Numbered' : 'Numbered', shortcut: 'Ctrl+Shift+X', action: () => setBullet(node.id, 'numbered') },
            { label: currentBullet === 'checklist' ? '✓ Checklist' : 'Checklist', shortcut: 'Ctrl+Shift+C', action: () => setBullet(node.id, 'checklist') },
        ],
    });
    return items;
}

const TEMPLATES = {
    'Meeting notes': [
        { content: 'Agenda', children: [
            { content: 'Welcome & introductions' },
            { content: 'Review action items from last meeting' },
            { content: 'Main discussion' },
            { content: 'Next steps' },
        ] },
        { content: 'Action items' },
        { content: 'Attendees' },
    ],
    'To-do list': [
        { content: 'Inbox', bullet: 'bullet', children: [
            { content: 'Task 1' },
            { content: 'Task 2' },
        ] },
        { content: 'Today' },
        { content: 'Tomorrow' },
    ],
    'Project plan': [
        { content: 'Goals', bullet: 'bullet', children: [
            { content: 'Define success criteria' },
            { content: 'Set measurable milestones' },
        ] },
        { content: 'Milestones', children: [
            { content: 'Kickoff' },
            { content: 'Phase 1' },
            { content: 'Launch' },
        ] },
        { content: 'Risks' },
        { content: 'Resources' },
    ],
    'Weekly review': [
        { content: 'What went well?' },
        { content: 'What could be improved?' },
        { content: 'What will I do next week?', children: [
            { content: 'Top priority' },
        ] },
    ],
};

const STORAGE_KEY_USER_TPL = 'abclist_user_templates';

function getUserTemplates() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_USER_TPL) || '[]'); } catch { return []; }
}

function saveUserTemplates(tpls) {
    localStorage.setItem(STORAGE_KEY_USER_TPL, JSON.stringify(tpls));
}

function deleteUserTemplate(name) {
    const tpls = getUserTemplates().filter((t) => t.name !== name);
    saveUserTemplates(tpls);
    toast(`Template "${name}" dihapus.`);
}

function saveAsTemplate(nodeId) {
    const name = prompt('Nama template:');
    if (!name || !name.trim()) return;
    const node = rows.get(nodeId)?.node;
    if (!node) return;
    const snapshot = buildTemplateSnapshot(node);
    const tpls = getUserTemplates().filter((t) => t.name !== name.trim());
    tpls.push({ name: name.trim(), nodes: snapshot });
    saveUserTemplates(tpls);
    toast(`Template "${name.trim()}" disimpan.`);
}

function buildTemplateSnapshot(node) {
    const children = flat.filter((f) => f.node.parent_id === node.id).map((f) => f.node);
    return [{
        content: node.content || '',
        bullet: node.bullet || 'bullet',
        children: children.length ? children.flatMap((c) => buildTemplateSnapshot(c)) : [],
    }];
}

async function createItemBranch(parentId, nodes) {
    let pos = 0;
    for (const n of nodes) {
        const data = await api.post(`/documents/${docId}/items`, {
            parent_id: parentId,
            position: pos++,
            content: n.content,
            bullet: n.bullet || 'bullet',
        });
        if (Array.isArray(n.children) && n.children.length) {
            await createItemBranch(data.data.id, n.children);
        }
    }
}

async function insertTemplate(nodeId, name) {
    const nodes = TEMPLATES[name] || getUserTemplates().find((t) => t.name === name)?.nodes;
    if (!nodes) return;
    recordUndo();
    try {
        await createItemBranch(nodeId, nodes);
        await loadItems();
        toast(`Template "${name}" disisipkan.`);
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function copyItemLink(id) {
    const url = `${window.location.origin}${window.location.pathname}?doc=${docId}&item=${id}`;
    try {
        await navigator.clipboard.writeText(url);
        toast('Tautan item disalin ke clipboard.');
    } catch {
        toast('Gagal menyalin tautan.', 'error');
    }
}

async function copyInternalLink(id) {
    const rec = rows.get(id);
    const label = (rec?.node.content || '').trim() || 'Item';
    const link = `[[${label}|${id}]]`;
    try {
        await navigator.clipboard.writeText(link);
        toast('Tautan internal disalin ke clipboard.');
    } catch {
        toast('Gagal menyalin tautan.', 'error');
    }
}

function openItemSharing() {
    const docNode = store.selectedNode && store.selectedNode.id === docId
        ? store.selectedNode
        : { id: docId, name: els.title.value || 'Tanpa judul' };
    import('./context-menu').then((m) => m.openShareDialog(docNode));
}

async function openBacklinks(id) {
    const rec = rows.get(id);
    if (!rec) return;
    import('./backlinks').then((m) => m.showForItem(id));
}

function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diff = Math.max(0, Date.now() - then);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} hari lalu`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo} bulan lalu`;
    return `${Math.floor(mo / 12)} tahun lalu`;
}

function bulletLabel(b) {
    if (b === 'bullet') return 'Bullet';
    if (b === 'numbered') return 'Numbered';
    return 'Checklist';
}

async function openRevisions(id) {
    const rec = rows.get(id);
    if (!rec) return;
    Swal.fire({
        title: 'Revision history',
        html: '<div class="text-left"><p id="rv-body" class="text-[13px] text-[#8a857e]">Memuat…</p></div>',
        showConfirmButton: false,
        showCloseButton: true,
        width: '480px',
        didOpen: async () => {
            const body = document.getElementById('rv-body');
            try {
                const res = await api.get(`/documents/${docId}/items/${id}/revisions`);
                const data = res.data || [];
                if (!data.length) {
                    body.innerHTML = 'Belum ada revisi untuk item ini.';
                    return;
                }
                body.removeAttribute('id');
                body.className = 'space-y-2';
                data.forEach((r) => {
                    const wrap = document.createElement('div');
                    wrap.className = 'flex items-start gap-2 rounded-md border border-black/10 p-2';
                    const meta = document.createElement('div');
                    meta.className = 'flex-1 min-w-0';
                    const head = document.createElement('div');
                    head.className = 'flex items-center gap-2 mb-0.5';
                    const time = document.createElement('span');
                    time.className = 'text-[11px] font-medium text-[#8a857e]';
                    time.textContent = timeAgo(r.created_at);
                    const badge = document.createElement('span');
                    badge.className = 'rounded px-1.5 py-px text-[10px] font-medium text-[#c07a12] bg-[#c07a12]/10';
                    badge.textContent = bulletLabel(r.bullet) + (r.checked ? ' · selesai' : '') + (r.heading ? ` · H${r.heading}` : '');
                    head.append(time, badge);
                    const text = document.createElement('p');
                    text.className = 'text-[13px] text-[#5a5650] leading-snug break-words';
                    text.textContent = (r.content || '(kosong)') + (r.note ? `\n${r.note}` : '');
                    text.style.whiteSpace = 'pre-wrap';
                    meta.append(head, text);
                    const restoreBtn = document.createElement('button');
                    restoreBtn.type = 'button';
                    restoreBtn.className = 'shrink-0 rounded-md border border-[#c07a12] text-[#c07a12] px-2.5 py-1 text-[12px] hover:bg-[#c07a12]/10';
                    restoreBtn.textContent = 'Pulihkan';
                    restoreBtn.addEventListener('click', async () => {
                        try {
                            await api.post(`/documents/${docId}/items/${id}/revisions/${r.id}/restore`);
                            Swal.close();
                            toast('Item dipulihkan dari revisi.');
                            await loadItems();
                        } catch (e) {
                            toast(e.message, 'error');
                        }
                    });
                    wrap.append(meta, restoreBtn);
                    body.append(wrap);
                });
            } catch (e) {
                body.innerHTML = `<span class="text-red-600">${esc(e.message)}</span>`;
            }
        },
    });
}

async function setHeading(id, heading) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    const prev = rec.node.heading;
    rec.node.heading = heading;
    render();
    api.patch(`/documents/${docId}/items/${id}`, { heading }).catch((e) => {
        rec.node.heading = prev;
        render();
        showFailedAlert(e.message);
    });
}

async function setColor(id, color) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    const prev = rec.node.color;
    rec.node.color = color;
    render();
    api.patch(`/documents/${docId}/items/${id}`, { color }).catch((e) => {
        rec.node.color = prev;
        render();
        showFailedAlert(e.message);
    });
}

async function setBullet(id, bullet) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    const prev = rec.node.bullet;
    rec.node.bullet = bullet;
    render();
    api.patch(`/documents/${docId}/items/${id}`, { bullet }).catch((e) => {
        rec.node.bullet = prev;
        render();
        showFailedAlert(e.message);
    });
}

function toggleBulletType(id, type) {
    const rec = rows.get(id);
    if (!rec) return;
    const cur = rec.node.bullet || 'bullet';
    setBullet(id, cur === type ? 'bullet' : type);
}

async function setBulletChildren(id, bullet) {
    const rec = rows.get(id);
    if (!rec) return;
    const targets = [rec.node, ...flat.filter((f) => f.parents.includes(id)).map((f) => f.node)];
    if (!targets.length) return;
    recordUndo();
    targets.forEach((c) => { c.bullet = bullet; });
    render();
    Promise.all(targets.map((c) => api.patch(`/documents/${docId}/items/${c.id}`, { bullet }).catch(() => {}))).then(() => {}).catch(() => loadItems());
}

function renderMenuItems(items) {
    ensureMenu();
    const render = (list, stack) => {
        menuEl.innerHTML = '';
        if (stack.length) {
            const back = document.createElement('button');
            back.type = 'button';
            back.className = 'ctx-item shrink-0 w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-[#8a857e]';
            back.innerHTML = '<span class="text-[#b5b0a9]">←</span><span>Kembali</span>';
            back.addEventListener('click', () => render(stack[stack.length - 1], stack.slice(0, -1)));
            menuEl.append(back);
            const s = document.createElement('div');
            s.className = 'shrink-0 h-px bg-black/10 my-1';
            menuEl.append(s);
        }
        const body = document.createElement('div');
        body.className = 'item-menu-body flex-1 min-h-0 overflow-y-auto';
        body.style.scrollbarWidth = 'thin';
        for (const item of list) {
            if (item === 'sep') {
                const s = document.createElement('div');
                s.className = 'h-px bg-black/10 my-1';
                body.append(s);
                continue;
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `ctx-item w-full text-left px-2.5 py-1.5 text-[13px] ${
                item.danger ? 'danger text-red-600' : 'text-[#24221f]'
            }`;
            if (item.disabled) {
                b.disabled = true;
                b.classList.add('opacity-40', 'cursor-not-allowed');
            }
            if (item.swatch !== undefined || item.shortcut) b.classList.add('flex', 'items-center', 'gap-2');
            if (item.swatch !== undefined) {
                const dot = document.createElement('span');
                dot.className = 'inline-block w-3 h-3 rounded-full mr-1 align-middle border border-black/20 shrink-0';
                dot.style.background = item.swatch || 'transparent';
                b.append(dot);
            }
            const labelSpan = document.createElement('span');
            labelSpan.className = item.shortcut ? 'flex-1 text-left' : '';
            labelSpan.textContent = item.label;
            b.append(labelSpan);
            if (item.shortcut) {
                const k = document.createElement('span');
                k.className = 'ctx-shortcut text-[11px] text-[#a8a29e] shrink-0';
                k.textContent = item.shortcut;
                b.append(k);
            }
            if (Array.isArray(item.children)) {
                b.classList.add('flex', 'items-center', 'justify-between', 'gap-3');
                const arrow = document.createElement('span');
                arrow.className = 'text-[#b5b0a9]';
                arrow.textContent = '›';
                b.append(arrow);
                b.addEventListener('click', () => render(item.children, stack.concat(list)));
            } else {
                b.addEventListener('click', () => {
                    closeMenu();
                    item.action();
                });
            }
            body.append(b);
        }
        menuEl.append(body);
        clampMenu();
    };
    render(items, []);
}

function toggleContextMenu(btn, items) {
    if (menuEl && !menuEl.classList.contains('hidden') && menuEl._btn === btn) {
        closeMenu();
        return;
    }
    closeMenu();
    renderMenuItems(items);
    menuEl.classList.remove('hidden');
    menuEl._btn = btn;
    const r = btn.getBoundingClientRect();
    const m = menuEl.getBoundingClientRect();
    let left = Math.min(r.right, window.innerWidth - m.width - 8);
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 4;
    menuEl.style.left = `${Math.max(8, left)}px`;
    menuEl.style.top = `${Math.max(8, top)}px`;
}

function openContextAt(x, y, items) {
    closeMenu();
    renderMenuItems(items);
    menuEl.classList.remove('hidden');
    menuEl._btn = null;
    const m = menuEl.getBoundingClientRect();
    menuEl.style.left = `${Math.min(Math.max(8, x), window.innerWidth - m.width - 8)}px`;
    menuEl.style.top = `${Math.min(Math.max(8, y), window.innerHeight - m.height - 8)}px`;
}

function ensureMenu() {
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.className = 'item-menu hidden fixed z-50 min-w-[200px] max-w-[260px] max-h-[min(480px,calc(100vh-96px))] flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg';
    document.body.append(menuEl);
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.item-menu')) closeMenu();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });
}

function clampMenu() {
    if (!menuEl || menuEl.classList.contains('hidden')) return;
    const m = menuEl.getBoundingClientRect();
    if (m.bottom > window.innerHeight - 8) {
        menuEl.style.top = `${Math.max(8, window.innerHeight - m.height - 8)}px`;
    }
    if (m.right > window.innerWidth - 8) {
        menuEl.style.left = `${Math.max(8, window.innerWidth - m.width - 8)}px`;
    }
}

function closeMenu() {
    if (menuEl) {
        menuEl.classList.add('hidden');
        menuEl.innerHTML = '';
        menuEl._btn = null;
    }
}

function createZoomBar() {
    const bar = document.createElement('div');
    bar.id = 'zoom-bar';
    bar.className = 'hidden items-center gap-1 flex-wrap mb-3 px-2 py-1.5 rounded-md bg-[#fff3db] text-[13px] text-[#24221f]';
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'shrink-0 mr-1 flex items-center gap-1.5 text-[#c07a12] hover:underline';
    exitBtn.innerHTML = `${SVG.zoomOut} Keluar`;
    exitBtn.addEventListener('click', exitZoom);
    bar.append(exitBtn);
    return bar;
}

function findAncestorPath(nodes, targetId, trail = []) {
    for (const n of nodes) {
        const next = trail.concat(n);
        if (n.id === targetId) return next;
        if (Array.isArray(n.children) && n.children.length) {
            const r = findAncestorPath(n.children, targetId, next);
            if (r) return r;
        }
    }
    return null;
}

function updateZoomBar() {
    if (!els.zoomBar) return;
    els.zoomBar.querySelectorAll('[data-crumb]').forEach((n) => n.remove());
    if (!zoomId) {
        els.zoomBar.classList.add('hidden');
        return;
    }
    const path = findAncestorPath(tree, zoomId);
    if (!path || path.length === 0) {
        els.zoomBar.classList.add('hidden');
        return;
    }
    els.zoomBar.classList.remove('hidden');

    path.forEach((p, i) => {
        const sep = document.createElement('span');
        sep.dataset.crumb = '1';
        sep.className = 'text-[#b5b0a9]';
        sep.textContent = '›';
        const crumb = document.createElement('button');
        crumb.type = 'button';
        crumb.dataset.crumb = '1';
        crumb.className = 'truncate max-w-[180px]';
        crumb.textContent = p.content || '(tanpa nama)';
        if (i === path.length - 1) {
            crumb.className += ' font-medium cursor-default';
        } else {
            crumb.className += ' text-[#c07a12] hover:underline';
            crumb.addEventListener('click', () => zoomInto(p.id));
        }
        els.zoomBar.append(sep, crumb);
    });
}

function selectItem(id) {
    selectedId = id;
    refreshHighlights();
    const rec = rows.get(id);
    if (rec) {
        rec.row.scrollIntoView({ block: 'nearest' });
        rec.row.focus({ preventScroll: true });
    }
    document.dispatchEvent(new CustomEvent('dyn:item-selected', { detail: id }));
}

function unrenderMath(el) {
    el.querySelectorAll('.katex-display, .katex').forEach((k) => {
        if (k.classList.contains('katex') && k.closest('.katex-display')) return;
        const ann = k.querySelector('annotation[encoding="application/x-tex"]');
        const tex = ann ? ann.textContent : '';
        const txt = document.createTextNode(`$$${tex}$$`);
        if (k.parentNode) k.replaceWith(txt);
    });
}

function startEdit(id, evt) {
    const rec = rows.get(id);
    if (!rec) return;
    editing = true;
    unrenderMath(rec.text);
    rec.text.focus();
    if (evt && document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(evt.clientX, evt.clientY);
        if (r && rec.text.contains(r.startContainer)) {
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(r);
            return;
        }
    }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && (rec.text.contains(sel.anchorNode) || hasCrossItemSelection())) return;
    const range = document.createRange();
    range.selectNodeContents(rec.text);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
}

async function commitEdit(id) {
    const rec = rows.get(id);
    if (!rec) return false;
    editing = false;
    acHide();
    const value = contentFromElement(rec.text);
    if (value === (rec.node.content || '')) {
        return false;
    }
    const previous = rec.node.content || '';
    recordUndo();
    rec.node.content = value;
    rec.text.innerHTML = contentHtml(value);
    wireInlineImages(rec.text, id);
    await api.patch(`/documents/${docId}/items/${id}`, { content: value }).catch((e) => {
        rec.node.content = previous;
        rec.text.innerHTML = contentHtml(previous);
        wireInlineImages(rec.text, id);
        showFailedAlert(e.message);
    });
    return true;
}

function cancelEdit(id) {
    const rec = rows.get(id);
    if (!rec) return;
    editing = false;
    acHide();
    rec.text.innerHTML = contentHtml(rec.node.content || '');
    wireInlineImages(rec.text, id);
}

function hasTextSelectionInside(id) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    const text = rows.get(id)?.text;
    return !!text && text.contains(sel.anchorNode);
}

function hasCrossItemSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    let anchorId = null;
    for (const [id, rec] of rows) {
        if (rec.text.contains(anchor)) { anchorId = id; break; }
    }
    if (anchorId === null) return false;
    for (const [id, rec] of rows) {
        if (id !== anchorId && rec.text.contains(focus)) return true;
    }
    return false;
}

function isWholeItemSelected(id) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    const text = rows.get(id)?.text;
    if (!text || !text.contains(sel.anchorNode)) return false;
    const range = sel.getRangeAt(0);
    const r = document.createRange();
    r.selectNodeContents(text);
    return range.toString() === r.toString();
}

function handleEditKey(e, id) {
    if (ac.el && !ac.el.classList.contains('hidden') && ac.node) {
        if (ac.type === 'tag') {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                ac.index = (ac.index + 1) % ac.items.length;
                acRender();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                ac.index = (ac.index - 1 + ac.items.length) % ac.items.length;
                acRender();
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                acSelect();
                return;
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            acHide();
            ac.node.focus();
            return;
        }
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && hasCrossItemSelection()) {
        e.preventDefault();
        e.stopPropagation();
        const info = getCrossItemSelectionInfo();
        commitEdit(id).then(async () => {
            const result = await deleteCrossItemSelection(info);
            if (result) {
                const rec = rows.get(result.firstId);
                if (rec) {
                    const txt = rec.node.content || '';
                    rec.node.content = txt.slice(0, result.caretOffset) + e.key + txt.slice(result.caretOffset);
                    rec.text.innerHTML = contentHtml(rec.node.content);
                    applyTagColors(rec.text);
                    wireInlineImages(rec.text, result.firstId);
                    selectItem(result.firstId);
                    editing = true;
                    unrenderMath(rec.text);
                    rec.text.focus();
                    setCaretAtOffset(rec.text, result.caretOffset + 1);
                    (async () => {
                        try {
                            await api.patch(`/documents/${docId}/items/${result.firstId}`, { content: rec.node.content });
                        } catch (err) {
                            showFailedAlert(err.message);
                            loadItems();
                        }
                    })();
                }
            }
        });
        return;
    }
    if (e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'enter' && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            insertLineBreak(rows.get(id)?.text);
        } else if (key === 'enter') {
            e.preventDefault();
            e.stopPropagation();
            // Ctrl+Enter = tandai selesai (mark as done, persis Dynalist)
            commitEdit(id).then(() => markAsDone(id));
        } else if (key === 'c' && !e.shiftKey) {
            if (hasTextSelectionInside(id) || hasCrossItemSelection()) return;
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => copyItems());
        } else if (key === 'x' && !e.shiftKey) {
            if (hasTextSelectionInside(id) || hasCrossItemSelection()) return;
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => cutItems());
        } else if (key === 'v' && e.shiftKey) {
            if (!itemClipboard) return;
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => pasteAsSibling(id));
        } else if (key === 'v' && !e.shiftKey) {
            if (!itemClipboard) return;
            const recText = rows.get(id)?.text;
            const value = (recText?.innerText || recText?.textContent || '').trim();
            if (value !== '' && !isWholeItemSelected(id)) return;
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => pasteAsChild(id));
        } else if (key === 'd' && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => duplicateItem(id));
        } else if (e.shiftKey && key === 'e') {
            e.preventDefault();
            e.stopPropagation();
            wrapCode(rows.get(id)?.text);
        } else if (key === 'e') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id);
        } else if (!e.shiftKey && key === 'b') {
            e.preventDefault();
            e.stopPropagation();
            wrapInline(rows.get(id)?.text, '**', '**');
        } else if (!e.shiftKey && key === 'i') {
            e.preventDefault();
            e.stopPropagation();
            wrapInline(rows.get(id)?.text, '__', '__');
        } else if (!e.shiftKey && key === 'k') {
            e.preventDefault();
            e.stopPropagation();
            openLinkPicker(id);
        } else if (e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => {
                if (multi.size > 1) bulkDelete();
                else deleteItem(id);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => move('up'));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => move('down'));
        } else if (e.shiftKey && key === 'c') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => toggleBulletType(id, 'checklist'));
        } else if (e.shiftKey && key === 'x') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => toggleBulletType(id, 'numbered'));
        } else if (key === 'z' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => undo());
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => redo());
        } else if (e.shiftKey && key === 'h') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => toggleHeading(id));
        } else if (e.shiftKey && key === 'l') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => cycleDocColor());
        } else if (e.shiftKey && key === 'm') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => openMovePicker(id));
        } else if (e.code === 'Period') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => (e.shiftKey ? toggleCollapseAll() : toggleCollapse(id)));
        } else if (e.code === 'BracketRight') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => zoomInto(id));
        } else if (e.code === 'BracketLeft') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => zoomOutLevel());
        } else if (e.code === 'Backquote') {
            e.preventDefault();
            e.stopPropagation();
            wrapCode(rows.get(id)?.text);
        }
        return;
    }

    if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        commitEdit(id).then(() => {
            const rec = rows.get(id);
            const ne = rec?.row.querySelector('.item-note-editor');
            if (ne) ne.blur();
            else openNoteEditor(id);
        });
    } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleEnter(id);
    } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        editIndent(id, e.shiftKey ? 'out' : 'in');
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit(id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasCrossItemSelection()) {
            e.preventDefault();
            e.stopPropagation();
            const info = getCrossItemSelectionInfo();
            commitEdit(id).then(async () => {
                const result = await deleteCrossItemSelection(info);
                if (result) selectItem(result.firstId);
            });
            return;
        }
        const recText = rows.get(id)?.text;
        const img = recText ? imageAtCaret(recText, e.key === 'Backspace' ? 'backspace' : 'delete') : null;
        if (img) {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => deleteImage(id, img.getAttribute('src')));
            return;
        }
        const value = (recText?.innerText || recText?.textContent || '').trim();
        if (multi.size > 1 || value === '') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => {
                if (multi.size > 1) bulkDelete();
                else deleteItem(id);
            });
            return;
        }
        if (e.key === 'Backspace' && isCaretAtStart(recText)) {
            const prev = previousSiblingOf(id);
            if (prev) {
                e.preventDefault();
                e.stopPropagation();
                commitEdit(id).then(() => mergeItems(prev, id, (rows.get(prev)?.node.content || '').length));
            } else if (rows.get(id)?.node.parent_id) {
                e.preventDefault();
                e.stopPropagation();
                commitEdit(id).then(() => unindent(id));
            }
        } else if (e.key === 'Delete' && isCaretAtEnd(recText)) {
            const next = nextSiblingOf(id);
            if (next) {
                e.preventDefault();
                e.stopPropagation();
                commitEdit(id).then(() => mergeItems(id, next));
            }
        }
    }
}

async function editIndent(id, dir) {
    await commitEdit(id);
    if (dir === 'in') await indent(id);
    else await unindent(id);
    if (rows.has(selectedId)) startEdit(selectedId);
}

async function enterCreateSibling(id) {
    commitEdit(id);
    const rec = rows.get(id);
    if (!rec) return;
    await createItemAt(rec.node.parent_id || null, siblingPosition(rec.node) + 1, rec.node.bullet);
}

async function enterCreateSiblingAbove(id) {
    commitEdit(id);
    const rec = rows.get(id);
    if (!rec) return;
    await createItemAt(rec.node.parent_id || null, Math.max(0, siblingPosition(rec.node)), rec.node.bullet);
}

async function enterCreateSiblingSplit(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const tail = splitTailAtCaret(rec.text);
    const hasChildren = Array.isArray(rec.node.children) && rec.node.children.length;
    if (!tail && !hasChildren) {
        enterCreateSibling(id);
        return;
    }
    recordUndo();
    commitEdit(id);
    const node = rec.node;
    if (hasChildren) {
        const pos = siblingPosition(node) + 1;
        const data = await api.post(`/documents/${docId}/items`, { parent_id: node.parent_id || null, position: pos, content: tail, bullet: node.bullet || defaultBullet });
        const newId = data.data.id;
        const newNode = { ...data.data, children: [] };
        insertNodeLocally(node.parent_id || null, pos, newNode);
        if (!collapsed.has(id)) {
            const children = flat.filter((f) => f.node.parent_id === node.id).map((f) => f.node);
            const oldParent = findNodeInTree(id);
            if (oldParent) {
                newNode.children = oldParent.children || [];
                oldParent.children = [];
                newNode.children.forEach((c) => (c.parent_id = newId));
            }
            buildFlat();
            applyZoomFilter();
            render();
            selectItem(newId);
            startEdit(newId);
            if (children.length) {
                api.post(`/documents/${docId}/items/${id}/split-children`, { new_id: newId }).catch((e) => {
                    showFailedAlert(e.message);
                    loadItems();
                });
            }
            return;
        }
        buildFlat();
        applyZoomFilter();
        render();
        selectItem(newId);
        startEdit(newId);
        return;
    }
    await createItemAt(node.parent_id || null, siblingPosition(node) + 1, node.bullet, tail);
}

function handleEnter(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const value = (rec.text.innerText || rec.text.textContent || '').trim();
    if (value === '' && rec.node.parent_id) {
        editIndent(id, 'out');
        return;
    }
    if (value !== '' && isCaretAtStart(rec.text)) {
        enterCreateSiblingAbove(id);
    } else {
        enterCreateSiblingSplit(id);
    }
}

function siblingPosition(node) {
    const group = flat.filter((f) => (f.node.parent_id || null) === (node.parent_id || null));
    return group.findIndex((f) => f.node.id === node.id);
}

function previousSiblingOf(id) {
    const f = flat.find((x) => x.node.id === id);
    if (!f) return null;
    const group = flat.filter((x) => (x.node.parent_id || null) === (f.node.parent_id || null));
    const i = group.findIndex((x) => x.node.id === id);
    return i > 0 ? group[i - 1].node.id : null;
}

function nextSiblingOf(id) {
    const f = flat.find((x) => x.node.id === id);
    if (!f) return null;
    const group = flat.filter((x) => (x.node.parent_id || null) === (f.node.parent_id || null));
    const i = group.findIndex((x) => x.node.id === id);
    return i >= 0 && i < group.length - 1 ? group[i + 1].node.id : null;
}

async function mergeItems(keepId, dropId, junction) {
    const keep = rows.get(keepId);
    const drop = rows.get(dropId);
    if (!keep || !drop) return;
    recordUndo();
    const a = keep.node.content || '';
    const b = drop.node.content || '';
    const merged = a && b ? `${a.trimEnd()} ${b.trimStart()}` : a + b;
    const children = flat.filter((f) => f.node.parent_id === drop.node.id).map((f) => f.node);
    const keepStart = childCount(keepId);
    children.forEach((c, i) => { c.parent_id = keepId; });
    keep.node.content = merged;
    removeNodeLocally(dropId);
    buildFlat(); applyZoomFilter(); render(); selectItem(keepId); startEdit(keepId);
    if (junction != null) setCaretAtOffset(rows.get(keepId)?.text, junction);
    (async () => {
        try {
            await api.patch(`/documents/${docId}/items/${keepId}`, { content: merged });
            if (children.length) {
                await Promise.all(children.map((c, i) =>
                    api.post(`/documents/${docId}/items/${c.id}/move`, { parent_id: keepId, position: keepStart + i })
                ));
            }
            await api.delete(`/documents/${docId}/items/${dropId}`);
        } catch (e) {
            showFailedAlert(e.message);
            loadItems();
        }
    })();
}

function getCrossItemSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    try {
        const range = sel.getRangeAt(0);
        const anchor = sel.anchorNode;
        const focus = sel.focusNode;
        let startItem = null;
        let endItem = null;
        for (const [id, rec] of rows) {
            if (rec.text.contains(anchor)) startItem = { id, textEl: rec.text };
            if (rec.text.contains(focus)) endItem = { id, textEl: rec.text };
        }
        if (!startItem || !endItem || startItem.id === endItem.id) return null;
        const visibleIds = flat.map((f) => f.node.id);
        const si = visibleIds.indexOf(startItem.id);
        const ei = visibleIds.indexOf(endItem.id);
        if (si === -1 || ei === -1) return null;
        const first = si <= ei ? startItem : endItem;
        const last = si <= ei ? endItem : startItem;
        const r1 = document.createRange();
        r1.setStart(first.textEl, 0);
        r1.setEnd(si <= ei ? range.startContainer : range.endContainer, si <= ei ? range.startOffset : range.endOffset);
        const textBefore = r1.toString();
        const r2 = document.createRange();
        r2.setStart(si <= ei ? range.endContainer : range.startContainer, si <= ei ? range.endOffset : range.startOffset);
        r2.setEnd(last.textEl, last.textEl.childNodes.length);
        const textAfter = r2.toString();
        const middleIds = [];
        const firstIdx = visibleIds.indexOf(first.id);
        const lastIdx = visibleIds.indexOf(last.id);
        for (let i = firstIdx + 1; i <= lastIdx; i++) middleIds.push(visibleIds[i]);
        return { first, last, textBefore, textAfter, middleIds, caretOffset: textBefore.length };
    } catch (e) {
        return null;
    }
}

async function deleteCrossItemSelection(preInfo) {
    const info = preInfo || getCrossItemSelectionInfo();
    if (!info) return;
    const { first, last, textBefore, textAfter, middleIds, caretOffset } = info;
    const merged = textBefore + textAfter;
    recordUndo();
    const keepRec = rows.get(first.id);
    if (!keepRec) return;
    keepRec.node.content = merged;
    const idsToRemove = [first.id === last.id ? null : last.id, ...middleIds].filter(Boolean);
    const uniqueRemove = [...new Set(idsToRemove)].filter((id) => id !== first.id);
    uniqueRemove.forEach((id) => {
        removeNodeLocally(id);
        collapsed.delete(id);
    });
    buildFlat();
    applyZoomFilter();
    render();
    const freshRec = rows.get(first.id);
    if (freshRec) {
        selectItem(first.id);
        editing = true;
        unrenderMath(freshRec.text);
        freshRec.text.focus();
        setCaretAtOffset(freshRec.text, caretOffset);
    }
    (async () => {
        try {
            await api.patch(`/documents/${docId}/items/${first.id}`, { content: merged });
            if (uniqueRemove.length) {
                await Promise.allSettled(uniqueRemove.map((id) =>
                    api.delete(`/documents/${docId}/items/${id}`)
                ));
            }
        } catch (e) {
            showFailedAlert(e.message);
            loadItems();
        }
    })();
    return { firstId: first.id, caretOffset };
}

function setCaretAtOffset(textEl, targetLen) {
    if (!textEl) return;
    let acc = 0;
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            if (acc + node.textContent.length >= targetLen) {
                const r = document.createRange();
                r.setStart(node, Math.max(0, Math.min(node.textContent.length, targetLen - acc)));
                r.collapse(true);
                const s = window.getSelection();
                s.removeAllRanges();
                s.addRange(r);
                return true;
            }
            acc += node.textContent.length;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList?.contains('item-img-wrap') || node.tagName === 'IMG') acc += 1;
            for (const c of node.childNodes) {
                if (walk(c)) return true;
            }
        }
        return false;
    };
    walk(textEl);
}

async function toggleCheck(id) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    const next = !rec.node.checked;
    rec.node.checked = next;
    render();
    api.patch(`/documents/${docId}/items/${id}`, { checked: next }).catch((e) => {
        rec.node.checked = !next;
        render();
        showFailedAlert(e.message);
    });
}

// Persis Dynalist: Ctrl+Enter = "mark as done" → hanya menandai SELESAI item
// checklist yang belum dicentang, tanpa berisiko membatalkan centang.
async function markAsDone(id) {
    const rec = rows.get(id);
    if (!rec) return;
    const node = rec.node;
    if ((node.bullet || 'bullet') !== 'checklist' || node.checked) return;
    recordUndo();
    node.checked = true;
    render();
    api.patch(`/documents/${docId}/items/${id}`, { checked: true }).catch((e) => {
        node.checked = false;
        render();
        showFailedAlert(e.message);
    });
}

async function indent(id) {
    if (!id) return toast('Pilih item dulu', 'error');
    const node = rows.get(id)?.node;
    if (!node) return;
    const siblings = flat.filter((f) => (f.node.parent_id || null) === (node.parent_id || null));
    const idx = siblings.findIndex((f) => f.node.id === id);
    if (idx <= 0) return toast('Tidak bisa indent');
    const prevSibling = siblings[idx - 1].node;
    recordUndo();
    const oldParentId = node.parent_id || null;
    removeNodeLocally(id);
    prevSibling.children = prevSibling.children || [];
    node.parent_id = prevSibling.id;
    prevSibling.children.push(node);
    buildFlat(); applyZoomFilter(); render(); selectItem(id);
    api.post(`/documents/${docId}/items/${id}/indent`).catch((e) => {
        showFailedAlert(e.message);
        loadItems();
    });
}

async function unindent(id) {
    if (!id) return toast('Pilih item dulu', 'error');
    const node = rows.get(id)?.node;
    if (!node || !node.parent_id) return toast('Tidak bisa unindent');
    const parent = rows.get(node.parent_id)?.node;
    if (!parent) return;
    recordUndo();
    const grandparentId = parent.parent_id || null;
    removeNodeLocally(id);
    const parentSiblings = flat.filter((f) => (f.node.parent_id || null) === grandparentId);
    const parentIdx = parentSiblings.findIndex((f) => f.node.id === parent.id);
    const insertPos = parentIdx + 1;
    node.parent_id = grandparentId;
    insertNodeLocally(grandparentId, insertPos, node);
    buildFlat(); applyZoomFilter(); render(); selectItem(id);
    api.post(`/documents/${docId}/items/${id}/unindent`).catch((e) => {
        showFailedAlert(e.message);
        loadItems();
    });
}

// Apakah id memiliki ancestor (termasuk di pohon) yang termasuk dalam set seleksi?
function selectionHasAncestor(id, ids) {
    const path = findAncestorPath(tree, id);
    if (!path) return false;
    for (let i = 0; i < path.length - 1; i++) {
        if (ids.has(path[i].id)) return true;
    }
    return false;
}

// indent / unindent untuk multi-seleksi (persis Dynalist): hanya item teratas
// pada seleksi (bukan yang merupakan keturunan dari item lain yang ikut terseleksi)
// yang diproses, lalu satu render + sinkronisasi per item di background.
async function indentMany(ids) {
    const idSet = new Set(ids);
    const targets = flat
        .filter((f) => idSet.has(f.node.id) && !selectionHasAncestor(f.node.id, idSet))
        .map((f) => f.node);
    recordUndo();
    const moved = [];
    targets.forEach((node) => {
        const parentList = node.parent_id ? (findNodeInTree(node.parent_id)?.children || null) : tree;
        if (!parentList) return;
        const i = parentList.indexOf(node);
        if (i <= 0) return;
        const prev = parentList[i - 1];
        parentList.splice(i, 1);
        prev.children = prev.children || [];
        node.parent_id = prev.id;
        prev.children.push(node);
        collapsed.delete(prev.id);
        moved.push(node.id);
    });
    if (!moved.length) return toast('Tidak bisa indent seleksi ini', 'error');
    buildFlat(); applyZoomFilter(); render();
    moved.forEach((mid) => {
        api.post(`/documents/${docId}/items/${mid}/indent`).catch(() => {});
    });
    selectItem(targets[0].id);
}

async function unindentMany(ids) {
    const idSet = new Set(ids);
    const targets = flat
        .filter((f) => idSet.has(f.node.id) && !selectionHasAncestor(f.node.id, idSet))
        .map((f) => f.node);
    recordUndo();
    const moved = [];
    targets.forEach((node) => {
        const parent = findNodeInTree(node.parent_id);
        if (!parent) return;
        const grandparentId = parent.parent_id || null;
        const parentList = grandparentId ? (findNodeInTree(grandparentId)?.children || null) : tree;
        if (!parentList) return;
        const removeFrom = parent.children || [];
        const pi = removeFrom.indexOf(node);
        if (pi === -1) return;
        removeFrom.splice(pi, 1);
        const gIdx = parentList.findIndex((s) => s.id === parent.id);
        node.parent_id = grandparentId;
        parentList.splice(gIdx + 1, 0, node);
        moved.push(node.id);
    });
    if (!moved.length) return toast('Tidak bisa unindent seleksi ini', 'error');
    buildFlat(); applyZoomFilter(); render();
    moved.forEach((mid) => {
        api.post(`/documents/${docId}/items/${mid}/unindent`).catch(() => {});
    });
    selectItem(targets[0].id);
}

async function deleteItem(id) {
    id = resolveItemId(id);
    if (!id) return toast('Pilih item dulu', 'error');
    recordUndo();
    const idx = flat.findIndex((f) => f.node.id === id);
    removeNodeLocally(id);
    collapsed.delete(id);
    multi.delete(id);
    if (selectedId === id) selectedId = null;
    buildFlat();
    applyZoomFilter();
    render();
    const target = flat[Math.max(0, Math.min(idx, flat.length - 1))];
    if (target) selectItem(target.node.id);
    api.delete(`/documents/${docId}/items/${id}`).catch((e) => {
        showFailedAlert('Gagal menghapus: ' + e.message);
        loadItems();
    });
}

async function deleteChecked() {
    const checkedIds = flat.filter((f) => f.node.checked).map((f) => f.node.id);
    if (!checkedIds.length) return toast('Tidak ada item yang dicentang', 'error');
    recordUndo();
    checkedIds.forEach((id) => {
        removeNodeLocally(id);
        collapsed.delete(id);
        multi.delete(id);
    });
    selAnchor = null;
    selEdge = null;
    if (selectedId && checkedIds.includes(selectedId)) selectedId = null;
    buildFlat();
    applyZoomFilter();
    render();
    toast(`${checkedIds.length} item dihapus. Pulihkan dari Trash.`);
    api.post(`/documents/${docId}/items-delete-checked`).catch((e) => {
        showFailedAlert('Gagal menghapus: ' + e.message);
        loadItems();
    });
}

async function numberChildren() {
    const rec = selectedId && rows.get(selectedId);
    if (!rec) return toast('Pilih item dulu', 'error');
    const children = flat.filter((f) => f.node.parent_id === rec.node.id).map((f) => f.node);
    if (!children.length) return toast('Item ini tidak punya anak', 'error');
    recordUndo();
    children.forEach((c) => { c.bullet = 'numbered'; });
    render();
    showSuccess('Anak dinomori');
    Promise.all(children.map((c) => api.patch(`/documents/${docId}/items/${c.id}`, { bullet: 'numbered' }).catch(() => {}))).catch(() => loadItems());
}

async function deduplicateChildren(id) {
    recordUndo();
    try {
        const res = await api.post(`/documents/${docId}/items/${id}/deduplicate-children`);
        const removed = res.removed ?? 0;
        if (removed) showSuccess(`${removed} item duplikat dihapus`);
        else toast('Tidak ada duplikat di antara anak item ini.');
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function stopNumberingChildren() {
    const rec = selectedId && rows.get(selectedId);
    if (!rec) return toast('Pilih item dulu', 'error');
    const children = flat.filter((f) => f.node.parent_id === rec.node.id).map((f) => f.node);
    if (!children.length) return;
    recordUndo();
    children.forEach((c) => { c.bullet = 'bullet'; });
    render();
    showSuccess('Penomoran anak dihapus');
    Promise.all(children.map((c) => api.patch(`/documents/${docId}/items/${c.id}`, { bullet: 'bullet' }).catch(() => {}))).catch(() => loadItems());
}

async function move(dir) {
    if (!selectedId) return toast('Pilih item dulu', 'error');
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    recordUndo();
    const parentId = node.parent_id || null;
    const group = flat.filter((f) => (f.node.parent_id || null) === parentId).map((f) => f.node);
    const i = group.findIndex((s) => s.id === node.id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= group.length) return toast('Posisi sudah di ujung');
    [group[i], group[j]] = [group[j], group[i]];
    const parentNodes = parentId ? findNodeInTree(parentId)?.children : tree;
    if (parentNodes) {
        parentNodes.length = 0;
        group.forEach((n) => parentNodes.push(n));
    }
    buildFlat(); applyZoomFilter(); render(); selectItem(node.id);
    api.post(`/documents/${docId}/items/${node.id}/move`, { parent_id: parentId, position: j }).catch((e) => {
        showFailedAlert(e.message);
        loadItems();
    });
}

function findNodeInTree(id, nodes = tree) {
    for (const n of nodes) {
        if (n.id === id) return n;
        if (Array.isArray(n.children) && n.children.length) {
            const found = findNodeInTree(id, n.children);
            if (found) return found;
        }
    }
    return null;
}

function applyZoomFilter() {
    if (zoomId) {
        const root = flat.find((f) => f.node.id === zoomId);
        if (root) {
            const sub = [];
            const collect = (n, d, parents) => {
                sub.push({ node: n, depth: d, parents });
                if (Array.isArray(n.children)) n.children.forEach((c) => collect(c, d + 1, parents.concat(n.id)));
            };
            collect(root.node, 0, []);
            flat = sub;
        }
    }
}

function insertNodeLocally(parentId, position, node) {
    if (parentId) {
        const parent = findNodeInTree(parentId);
        if (parent) {
            parent.children = parent.children || [];
            if (position == null || position >= parent.children.length) parent.children.push(node);
            else parent.children.splice(position, 0, node);
            collapsed.delete(parentId);
        }
    } else if (position == null || position >= tree.length) {
        tree.push(node);
    } else {
        tree.splice(position, 0, node);
    }
}

function removeNodeLocally(id) {
    const splice = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) {
                nodes.splice(i, 1);
                return true;
            }
            if (Array.isArray(nodes[i].children) && nodes[i].children.length) {
                if (splice(nodes[i].children)) return true;
            }
        }
        return false;
    };
    splice(tree);
}

// Saat sebuah tempId (item yang belum tersimpan ke server) berhasil di-resolve
// jadi ID asli, item lain yang masih menunjuk tempId itu sebagai parent_id-nya
// perlu ikut diperbarui, supaya tidak ada operasi berikutnya yang mengirim
// tempId basi ke server (penyebab error "Parent item not found").
function reparentTempChildren(tempId, realId) {
    for (const [, rec] of rows) {
        if (rec?.node && rec.node.parent_id === tempId) {
            rec.node.parent_id = realId;
        }
    }
}

async function createItemAt(parentId, position, bullet, content) {
    recordUndo();
    const tempId = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const node = {
        id: tempId,
        parent_id: parentId || null,
        content: content || '',
        note: '',
        checked: false,
        heading: 0,
        color: null,
        bullet: bullet || defaultBullet,
        tags: [],
        sort_order: 0,
        children: [],
    };
    insertNodeLocally(parentId, position, node);
    buildFlat();
    applyZoomFilter();
    render();
    selectItem(tempId);
    startEdit(tempId);
    const realParent = await resolveParentAsync(parentId);
    const promise = api
        .post(`/documents/${docId}/items`, {
            parent_id: realParent,
            ...(position != null ? { position } : {}),
            content: node.content,
            bullet: node.bullet,
        })
        .then((data) => data.data.id)
        .catch((e) => {
            unregisterPendingItem(tempId);
            throw e;
        });
    registerPendingItem(tempId, promise);
    try {
        const realId = await promise;
        node.id = realId;
        rememberId(tempId, realId);
        if (selectedId === tempId) selectedId = realId;
        if (multi.has(tempId)) { multi.delete(tempId); multi.add(realId); }
        if (selAnchor === tempId) selAnchor = realId;
        if (selEdge === tempId) selEdge = realId;
        if (collapsed.has(tempId)) { collapsed.delete(tempId); collapsed.add(realId); }
        const rec = rows.get(tempId);
        if (rec) {
            rows.delete(tempId);
            rows.set(realId, rec);
            rec.node = node;
            if (rec.row) rec.row.dataset.id = realId;
        }
        unregisterPendingItem(tempId);
        reparentTempChildren(tempId, realId);
        return realId;
    } catch (e) {
        removeNodeLocally(tempId);
        buildFlat();
        applyZoomFilter();
        render();
        showFailedAlert(e.message);
        return null;
    }
}

async function addItem() {
    let parentId = null;
    let bullet;
    if (selectedId) {
        const rec = rows.get(selectedId);
        if (rec && rec.node.parent_id) parentId = rec.node.parent_id;
        bullet = rec?.node.bullet;
    }
    await createItemAt(parentId, undefined, bullet);
}

async function addSiblingBelow() {
    if (!selectedId) return addItem();
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    await createItemAt(node.parent_id || null, siblingPosition(node) + 1, node.bullet);
}

async function addChildItem() {
    if (!selectedId) return addItem();
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    await createItemAt(node.id, childCount(node.id), node.bullet);
}

async function addSiblingAbove() {
    if (!selectedId) return;
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    await createItemAt(node.parent_id || null, Math.max(0, siblingPosition(node)), node.bullet);
}

function nav(dir) {
    selAnchor = null;
    selEdge = null;
    if (!flat.length) return;
    let i = flat.findIndex((f) => f.node.id === selectedId);
    if (i === -1) i = dir > 0 ? -1 : 0;
    i = Math.max(0, Math.min(flat.length - 1, i + dir));
    selectItem(flat[i].node.id);
}

function navInto() {
    const node = rows.get(selectedId)?.node;
    if (!node || !node.children || !node.children.length) return;
    if (collapsed.has(selectedId)) {
        collapsed.delete(selectedId);
        saveUiState();
        render();
    }
    const idx = flat.findIndex(f => f.node.id === selectedId);
    if (idx >= 0 && idx + 1 < flat.length) selectItem(flat[idx + 1].node.id);
}

function navOut() {
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    if (!collapsed.has(selectedId) && node.children && node.children.length) {
        collapsed.add(selectedId);
        saveUiState();
        render();
    } else if (node.parent_id) {
        selectItem(node.parent_id);
    }
}

function extendSelect(dir) {
    if (!selectedId || !flat.length) return;
    const ids = flat.map((f) => f.node.id);
    if (multi.size === 0 || !selAnchor) {
        selAnchor = selectedId;
        selEdge = selectedId;
    }
    const e = ids.indexOf(selEdge);
    const n = e + (dir === 'down' ? 1 : -1);
    if (n < 0 || n >= ids.length) return;
    selEdge = ids[n];
    const a = ids.indexOf(selAnchor);
    const lo = Math.min(a, n);
    const hi = Math.max(a, n);
    multi.clear();
    for (let i = lo; i <= hi; i++) multi.add(ids[i]);
    selectItem(selEdge);
    refreshHighlights();
}

function selectUpward() {
    if (!flat.length) return;
    const ids = multi.size ? [...multi] : selectedId ? [selectedId] : [];
    const parentSet = new Set();
    for (const id of ids) {
        const parents = flat.find((f) => f.node.id === id)?.parents || [];
        const direct = parents[parents.length - 1];
        if (direct) parentSet.add(direct);
    }
    multi.clear();
    ids.forEach((id) => multi.add(id));
    if (parentSet.size) parentSet.forEach((p) => multi.add(p));
    else flat.forEach((f) => multi.add(f.node.id));
    refreshHighlights();
}

function toggleCollapseAll() {
    const anyExpanded = flat.some((f) => Array.isArray(f.node.children) && f.node.children.length && !collapsed.has(f.node.id));
    if (anyExpanded) collapseAll();
    else expandAll();
}

async function toggleHeading(id) {
    if (!id) return;
    const rec = rows.get(id);
    if (!rec) return;
    await setHeading(id, rec.node.heading ? 0 : 1);
}

const COLOR_CYCLE = ['', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#2563eb', '#7c3aed', '#6b7280'];

async function cycleColor(id) {
    if (!id) return;
    const rec = rows.get(id);
    if (!rec) return;
    const i = Math.max(0, COLOR_CYCLE.indexOf(rec.node.color || ''));
    await setColor(id, COLOR_CYCLE[(i + 1) % COLOR_CYCLE.length] || null);
}

// Persis dynalist: Ctrl+Shift+L = toggle color label DOKUMEN (bukan item).
const DOC_COLOR_CYCLE = [null, '#dc2626', '#ea580c', '#d97706', '#16a34a', '#2563eb', '#7c3aed', '#6b7280'];

async function cycleDocColor() {
    const node = store.selectedNode;
    if (!node || node.type === 'folder') return;
    const i = Math.max(0, DOC_COLOR_CYCLE.indexOf(node.color || null));
    const color = DOC_COLOR_CYCLE[(i + 1) % DOC_COLOR_CYCLE.length];
    const prev = node.color;
    node.color = color;
    loadTree();
    toast(color ? 'Warna label dokumen diubah.' : 'Warna label dokumen dihapus.');
    api.patch(`/documents/${docId}`, { color }).catch((e) => {
        node.color = prev;
        loadTree();
        showFailedAlert(e.message);
    });
}

function insertLineBreak(container) {
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !container.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const br = document.createElement('br');
    range.deleteContents();
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function wrapCode(container) {
    wrapInline(container, '`', '`');
}

function applyFormat(id, left, right) {
    const text = rows.get(id)?.text;
    if (!text) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !text.contains(sel.anchorNode)) {
        const r = document.createRange();
        r.selectNodeContents(text);
        sel.removeAllRanges();
        sel.addRange(r);
    }
    wrapInline(text, left, right);
    commitEdit(id);
}

function wrapInline(container, left, right) {
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !container.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const caret = document.createRange();
    if (range.collapsed) {
        const node = document.createTextNode(left + right);
        range.insertNode(node);
        caret.setStart(node, left.length);
        caret.collapse(true);
    } else {
        const selectedText = range.toString();
        range.deleteContents();
        const node = document.createTextNode(left + selectedText + right);
        range.insertNode(node);
        caret.setStartAfter(node);
        caret.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(caret);
}

// ---- Undo / Redo ----
function captureSnapshot() {
    const items = [];
    const walk = (nodes, parentId) => {
        for (const n of nodes) {
            items.push({
                id: n.id,
                parent_id: parentId,
                content: n.content || '',
                note: n.note || '',
                checked: !!n.checked,
                heading: n.heading || 0,
                color: n.color || null,
                bullet: n.bullet || 'bullet',
                tags: n.tags || [],
            });
            if (Array.isArray(n.children) && n.children.length) walk(n.children, n.id);
        }
    };
    walk(tree, null);
    return items;
}

function flatToTree(items) {
    const map = new Map();
    const roots = [];
    items.forEach((it) => {
        map.set(it.id, { ...it, children: [] });
    });
    items.forEach((it) => {
        const node = map.get(it.id);
        if (it.parent_id && map.has(it.parent_id)) {
            map.get(it.parent_id).children.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
}

function applySnapshotLocal(snap) {
    tree = flatToTree(snap);
    buildFlat();
    render();
    renderTags();
    updateWordCount();
}

function recordUndo() {
    if (!docId) return;
    const snap = captureSnapshot();
    const last = undoStack[undoStack.length - 1];
    if (last && last.length === snap.length) {
        let same = true;
        for (let i = 0; i < last.length; i++) {
            const a = last[i], b = snap[i];
            if (a.id !== b.id || a.content !== b.content || a.parent_id !== b.parent_id || a.checked !== b.checked || a.heading !== b.heading || a.note !== b.note) { same = false; break; }
        }
        if (same) return;
    }
    undoStack.push(snap);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
    markItemOp();
}

async function restoreSnapshot(snap) {
    applySnapshotLocal(snap);
    api.post(`/documents/${docId}/items-restore`, { items: snap }).catch(async (e) => {
        await loadItems();
        showFailedAlert(e.message);
    });
}

function undo() {
    if (!docId || !undoStack.length) return;
    const snap = undoStack.pop();
    redoStack.push(captureSnapshot());
    restoreSnapshot(snap);
}

function redo() {
    if (!docId || !redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(captureSnapshot());
    restoreSnapshot(snap);
}

function updateUndoButtons() {
    const ub = document.getElementById('undo-btn');
    const rb = document.getElementById('redo-btn');
    if (ub) ub.disabled = !undoStack.length;
    if (rb) rb.disabled = !redoStack.length;
}

// ---- Bookmark dokumen ----
let bookmarks = [];

async function loadBookmarkState() {
    try {
        const data = await api.get('/bookmarks');
        bookmarks = data.data || [];
        updateBookmarkBtn();
    } catch {
        // ignore
    }
}

function isBookmarked() {
    return bookmarks.some((b) => b.target_type === 'document' && b.target && String(b.target.id) === String(docId));
}

function updateBookmarkBtn() {
    const active = isBookmarked();
    els.bookmarkBtn.classList.toggle('bookmarked', active);
    els.bookmarkBtn.innerHTML = active ? SVG.starFilled : SVG.star;
}

async function toggleBookmark() {
    const wasBookmarked = isBookmarked();
    if (wasBookmarked) {
        const b = bookmarks.find((x) => x.target_type === 'document' && String(x.target.id) === String(docId));
        bookmarks = bookmarks.filter((x) => x !== b);
        updateBookmarkBtn();
        showSuccess('Bookmark dihapus');
        api.delete(`/bookmarks/${b.id}`).catch((e) => { showFailedAlert(e.message); loadBookmarkState(); });
    } else {
        const temp = { id: `tmp-${Date.now()}`, target_type: 'document', target: { id: docId } };
        bookmarks.push(temp);
        updateBookmarkBtn();
        showSuccess('Dibookmark');
        api.post('/bookmarks', { target_type: 'document', target_id: docId }).then((d) => {
            Object.assign(temp, d.data || d);
        }).catch((e) => { showFailedAlert(e.message); loadBookmarkState(); });
    }
}

function isItemBookmarked(id) {
    return bookmarks.some((b) => b.target_type === 'item' && b.target && String(b.target.id) === String(id));
}

async function toggleItemBookmark(id) {
    const existing = bookmarks.find((b) => b.target_type === 'item' && b.target && String(b.target.id) === String(id));
    if (existing) {
        bookmarks = bookmarks.filter((b) => b !== existing);
        showSuccess('Bookmark dihapus');
        loadBookmarks();
        api.delete(`/bookmarks/${existing.id}`).catch((e) => { showFailedAlert(e.message); loadBookmarkState(); });
    } else {
        const temp = { id: `tmp-${Date.now()}`, target_type: 'item', target: { id } };
        bookmarks.push(temp);
        showSuccess('Item dibookmark');
        loadBookmarks();
        api.post('/bookmarks', { target_type: 'item', target_id: id }).then((d) => {
            Object.assign(temp, d.data || d);
        }).catch((e) => { showFailedAlert(e.message); loadBookmarkState(); });
    }
}

export function resetView() {
    docId = null;
    selectedId = null;
    editing = false;
    zoomId = null;
    collapsed.clear();
    tagFilter = null;
    undoStack.length = 0;
    redoStack.length = 0;
    updateUndoButtons();
    updateZoomBar();
    if (els.tags) {
        els.tags.innerHTML = '';
        els.tags.classList.add('hidden');
    }
    showToolbar(false);
    els.container.classList.add('hidden');
    els.empty.classList.remove('hidden');
    if (els.breadcrumb) els.breadcrumb.classList.add('hidden');
    if (els.trashView) els.trashView.classList.add('hidden');
}

// ---- Search & Replace ----
export function isDocOpen() {
    return !!docId;
}

export function openSearch() {
    if (!docId) return;
    openDocSearch();
}

export function openSr() {
    els.srModal.classList.remove('hidden');
    els.srFind.focus();
    els.srFind.select();
}

function closeSr() {
    els.srModal.classList.add('hidden');
}

// ---- Cari dalam dokumen (bar pencarian ala ABCLIST) ----
let searchMatches = [];
let searchIndex = -1;
let savedCollapsed = null;

function openDocSearch() {
    if (!docId) return;
    closeSr();
    els.docSearchbar.classList.remove('hidden');
    els.docSearchInput.value = '';
    els.docSearchCount.textContent = '';
    const hint = document.getElementById('doc-search-flat-hint');
    if (hint) hint.classList.add('hidden');
    flatSearch = false;
    savedCollapsed = null;
    searchMatches = [];
    searchIndex = -1;
    clearDocSearchHighlight();
    els.docSearchInput.focus();
}

function closeDocSearch() {
    els.docSearchbar.classList.add('hidden');
    if (flatSearch) setFlatSearch(false);
    searchMatches = [];
    searchIndex = -1;
    clearDocSearchHighlight();
    if (editing && selectedId && rows.has(selectedId)) rows.get(selectedId).text.focus();
    else if (els.outline) els.outline.focus();
}

function clearDocSearchHighlight() {
    els.outline.querySelectorAll('.search-hit, .search-current, .search-dim').forEach((r) => {
        r.classList.remove('search-hit', 'search-current', 'search-dim');
    });
}

function parseSearchQuery(q) {
    const tokens = q.trim().split(/\s+/);
    const ops = { is: null, edited: null, tag: null, atDate: null, remDate: null };
    const keywords = [];
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const t of tokens) {
        if (/^is:(completed|checked|uncompleted|unchecked|starred|bookmarked)$/i.test(t)) {
            const v = t.slice(3).toLowerCase();
            if (v === 'completed' || v === 'checked') ops.is = true;
            else if (v === 'uncompleted' || v === 'unchecked') ops.is = false;
            else ops.is = 'starred';
        } else if (/^edited:(today|yesterday|\d+[dwmy])$/i.test(t)) {
            const v = t.slice(7).toLowerCase();
            if (v === 'today') ops.edited = 0;
            else if (v === 'yesterday') ops.edited = 1;
            else {
                const n = parseInt(v, 10);
                const mult = v.endsWith('w') ? 7 : v.endsWith('m') ? 30 : v.endsWith('y') ? 365 : 1;
                ops.edited = n * mult;
            }
        } else if (/^#[A-Za-z0-9_-]+$/.test(t)) {
            ops.tag = t.slice(1).toLowerCase();
        } else if (/^@\d{4}-\d{2}-\d{2}$/.test(t)) {
            ops.atDate = t.slice(1);
        } else if (/^@(today|yesterday)$/i.test(t)) {
            const d = new Date();
            if (/yesterday/i.test(t)) d.setDate(d.getDate() - 1);
            ops.atDate = iso(d);
        } else if (/^!\d{4}-\d{2}-\d{2}$/.test(t)) {
            ops.remDate = t.slice(1);
        } else {
            keywords.push(t);
        }
    }
    return { ops, keyword: keywords.join(' ') };
}

function setFlatSearch(on) {
    if (on === flatSearch) return;
    flatSearch = on;
    if (on) {
        savedCollapsed = new Set(collapsed);
        collapsed.clear();
    } else if (savedCollapsed) {
        collapsed.clear();
        savedCollapsed.forEach((id) => collapsed.add(id));
        savedCollapsed = null;
    }
    const hint = document.getElementById('doc-search-flat-hint');
    if (hint) hint.classList.toggle('hidden', !on);
    render();
    runDocSearch();
}

function runDocSearch() {
    const raw = els.docSearchInput.value.trim();
    clearDocSearchHighlight();
    searchMatches = [];
    searchIndex = -1;
    if (!raw) {
        els.docSearchCount.textContent = '';
        return;
    }
    const { ops, keyword } = parseSearchQuery(raw);
    const kw = keyword.toLowerCase();
    const hits = [];
    for (const f of flat) {
        if (!rows.has(f.node.id)) continue;
        if (ops.is !== null) {
            if (ops.is === 'starred') {
                if (!isItemBookmarked(f.node.id)) continue;
            } else if ((f.node.checked === true) !== ops.is) {
                continue;
            }
        }
        if (ops.edited !== null) {
            const ts = new Date(f.node.updated_at).getTime();
            if (Number.isNaN(ts) || ts < Date.now() - ops.edited * 86400000) continue;
        }
        const content = String(f.node.content || '');
        const note = String(f.node.note || '');
        if (ops.tag !== null && !`${content}\n${note}`.toLowerCase().includes(`#${ops.tag}`)) continue;
        if (ops.atDate !== null && !(`${content}\n${note}`).includes(`@${ops.atDate}`) && !(`${content}\n${note}`).includes(`!${ops.atDate}`)) continue;
        if (ops.remDate !== null && !(`${content}\n${note}`).includes(`!${ops.remDate}`)) continue;
        if (kw && !`${content}\n${note}`.toLowerCase().includes(kw)) continue;
        hits.push(f.node.id);
    }
    searchMatches = hits;
    if (!searchMatches.length) {
        els.docSearchCount.textContent = 'Tidak ditemukan';
        return;
    }
    els.docSearchCount.textContent = `${searchMatches.length} hasil`;
    for (const f of flat) {
        if (!rows.has(f.node.id)) continue;
        if (!searchMatches.includes(f.node.id)) rows.get(f.node.id).row.classList.add('search-dim');
    }
    for (const id of searchMatches) rows.get(id).row.classList.add('search-hit');
    goToDocSearch(0, false);
}

function goToDocSearch(step, scroll = true) {
    if (!searchMatches.length) return;
    searchIndex = (searchIndex + step + searchMatches.length) % searchMatches.length;
    const id = searchMatches[searchIndex];
    const rec = rows.get(id);
    if (!rec) return;
    els.outline.querySelectorAll('.search-current').forEach((r) => r.classList.remove('search-current'));
    rec.row.classList.add('search-current');
    els.docSearchCount.textContent = `${searchIndex + 1} / ${searchMatches.length}`;
    if (scroll) rec.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function wireDocSearch() {
    els.docSearchInput.addEventListener('input', runDocSearch);
    els.docSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                closeDocSearch();
                import('./quick-finder').then(({ open }) => open('item'));
                return;
            }
            if (e.shiftKey) {
                setFlatSearch(!flatSearch);
                return;
            }
            goToDocSearch(1);
        } else if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            goToDocSearch(-1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDocSearch();
        }
    });
    els.docSearchPrev.addEventListener('click', () => goToDocSearch(-1));
    els.docSearchNext.addEventListener('click', () => goToDocSearch(1));
    els.docSearchClose.addEventListener('click', closeDocSearch);
}

// ---- Trash ----
function showTrashView(show) {
    els.trashView.classList.toggle('hidden', !show);
    els.container.classList.toggle('hidden', show);
    els.empty.classList.toggle('hidden', show);
    els.toolbar.classList.toggle('hidden', show);
}

export async function openTrash() {
    if (!docId) return;
    closeSr();
    closeDocSearch();
    selectedId = null;
    editing = false;
    multi.clear();
    refreshHighlights();
    showTrashView(true);
    await loadTrash();
}

export function closeTrash() {
    showTrashView(false);
    els.outline.classList.remove('hidden');
}

async function loadTrash() {
    if (!docId) return;
    try {
        const data = await api.get(`/documents/${docId}/trash`);
        trashItems = data.data || [];
        renderTrash();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

function renderTrash() {
    els.trashList.innerHTML = '';
    if (!trashItems.length) {
        els.trashEmptyMsg.classList.remove('hidden');
        return;
    }
    els.trashEmptyMsg.classList.add('hidden');

    const ids = new Set(trashItems.map((it) => it.id));
    const byId = new Map(trashItems.map((it) => [it.id, it]));
    const depthOf = (it) => {
        let d = 0;
        let cur = it;
        const seen = new Set();
        while (cur.parent_id && ids.has(cur.parent_id) && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = byId.get(cur.parent_id);
            d++;
        }
        return d;
    };

    for (const it of trashItems) {
        const row = document.createElement('div');
        row.className = 'trash-row flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[#f4f3f2]';
        const pad = document.createElement('span');
        pad.className = 'shrink-0';
        pad.style.width = `${depthOf(it) * 20}px`;
        row.append(pad);

        const bullet = document.createElement('span');
        bullet.className = 'shrink-0 mt-[3px] w-[13px] text-center text-[#8a857e] text-[12px]';
        bullet.textContent = it.checked ? '☑' : (it.bullet === 'checklist' ? '☐' : '•');
        row.append(bullet);

        const main = document.createElement('div');
        main.className = 'flex-1 min-w-0';

        const content = document.createElement('div');
        content.className = `text-[14px] break-words ${it.checked ? 'is-checked-text' : 'text-[#24221f]'}`;
        content.textContent = it.content || '(tanpa nama)';
        main.append(content);

        if (it.note) {
            const note = document.createElement('div');
            note.className = 'mt-0.5 text-[12.5px] text-[#8a857e] whitespace-pre-wrap';
            note.textContent = it.note;
            main.append(note);
        }

        if (Array.isArray(it.tags) && it.tags.length) {
            const tagWrap = document.createElement('div');
            tagWrap.className = 'mt-1 flex flex-wrap gap-1';
            it.tags.forEach((t) => {
                const tag = document.createElement('span');
                tag.className = 'text-[11px] text-[#c07a12]';
                tag.textContent = `#${t}`;
                tagWrap.append(tag);
            });
            main.append(tagWrap);
        }
        row.append(main);

        const meta = document.createElement('div');
        meta.className = 'flex items-center gap-2 shrink-0 mt-[3px]';
        if (it.deleted_at) {
            const time = document.createElement('span');
            time.className = 'text-[11px] text-[#b5b0a9]';
            time.textContent = new Date(it.deleted_at).toLocaleString();
            meta.append(time);
        }
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'text-[13px] text-[#c07a12] hover:underline';
        restoreBtn.textContent = 'Pulihkan';
        restoreBtn.addEventListener('click', () => restoreFromTrash(it.id));
        meta.append(restoreBtn);
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'text-[13px] text-red-600 hover:underline';
        delBtn.textContent = 'Hapus';
        delBtn.addEventListener('click', () => trashItemForever(it.id));
        meta.append(delBtn);
        row.append(meta);

        els.trashList.append(row);
    }
}

async function restoreFromTrash(id) {
    closeTrash();
    showSuccess('Memulihkan item...', 'Dipulihkan');
    try {
        await api.post(`/documents/${docId}/items/${id}/restore`);
        await Promise.all([loadTrash(), loadItems()]);
        if (flat.some((f) => f.node.id === id)) selectItem(id);
    } catch (e) {
        showFailedAlert(e.message);
        loadItems();
    }
}

function trashItemForever(id) {
    const it = trashItems.find((t) => t.id === id);
    showPopupWithAction({
        title: 'Hapus Permanen?',
        subtitle: `Item <b>"${esc(it?.content || '(tanpa nama)')}"</b> akan dihapus permanen dan tidak bisa dipulihkan.`,
        path: `/documents/${docId}/items/${id}/force`,
        onDone: async () => {
            await loadTrash();
        },
    });
}

function emptyTrash() {
    showPopupWithAction({
        title: 'Kosongkan Trash?',
        subtitle: 'Semua item di Trash akan dihapus permanen dan tidak bisa dipulihkan.',
        path: `/documents/${docId}/trash`,
        onDone: async () => {
            await loadTrash();
        },
    });
}

function wireTrash() {
    els.trashBtn.addEventListener('click', () => {
        if (els.trashView.classList.contains('hidden')) openTrash();
        else closeTrash();
    });
    els.trashClose.addEventListener('click', closeTrash);
    els.trashEmpty.addEventListener('click', emptyTrash);
}

// ---- Autocomplete (#/@ tags, ! date) ----
const ac = { el: null, type: null, items: [], index: 0, node: null, data: null };
let acTagsCache = null;

function ensureAcEl() {
    if (ac.el) return;
    ac.el = document.createElement('div');
    ac.el.id = 'ac-popup';
    ac.el.className = 'hidden fixed z-50 min-w-[220px] rounded-lg border border-black/10 bg-white shadow-lg py-1 text-[13px] text-[#24221f]';
    document.body.append(ac.el);
    window.addEventListener('click', (e) => {
        if (ac.el && !ac.el.classList.contains('hidden') && !ac.el.contains(e.target)) acHide();
    });
}

function acHide() {
    if (!ac.el) return;
    ac.el.classList.add('hidden');
    ac.el.innerHTML = '';
    ac.type = null;
    ac.node = null;
    ac.data = null;
    ac.items = [];
    ac.index = 0;
}

function findTriggerAtCaret(textEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !textEl.contains(range.commonAncestorContainer)) return null;
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return null;
    const slice = container.textContent.slice(0, range.startOffset);
    const tagM = slice.match(/([#@][A-Za-z0-9_-]*)$/);
    if (tagM) {
        const start = range.startOffset - tagM[1].length;
        if (start === 0 || !/[A-Za-z0-9_-]/.test(slice[start - 1])) {
            return { type: 'tag', trigger: tagM[1], query: tagM[1].slice(1), container, start, end: range.startOffset };
        }
    }
    const dateM = slice.match(/(^|[^0-9\-/])(!)([0-9\-/]*)$/);
    if (dateM && (dateM[1] === '' || dateM[1] === ' ' || dateM[1] === '(' || dateM[1] === '\n')) {
        return { type: 'date', trigger: '!', query: dateM[3], container, start: range.startOffset - 1 - dateM[3].length, end: range.startOffset };
    }
    return null;
}

function replaceAcRange(container, start, end, text) {
    container.replaceData(start, end - start, text);
    const range = document.createRange();
    range.setStart(container, start + text.length);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function acShowAtCaret(textEl) {
    const sel = window.getSelection();
    let rect = null;
    if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width || r.height)) rect = r;
    }
    const x = rect ? Math.min(rect.left, window.innerWidth - ac.el.offsetWidth - 8) : 80;
    const y = rect ? rect.bottom + 4 : 80;
    ac.el.style.left = `${Math.max(8, x)}px`;
    ac.el.style.top = `${y}px`;
    ac.el.classList.remove('hidden');
}

async function loadAcTags() {
    if (acTagsCache) return acTagsCache;
    try {
        const data = await api.get('/tags');
        acTagsCache = (data.data || []).map((x) => x.tag);
        return acTagsCache;
    } catch {
        return [];
    }
}

function acRender() {
    ac.el.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'max-h-56 overflow-y-auto';
    ac.items.forEach((item, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f4f3f2] ${i === ac.index ? 'bg-[#fff3db]' : ''}`;
        if (item.create) {
            btn.innerHTML = `<span class="text-[#c07a12]">Buat tag</span><span class="font-medium">${esc('#' + item.create)}</span>`;
        } else {
            btn.innerHTML = `<span class="text-[#c07a12]">#</span><span>${esc(item.tag)}</span>`;
        }
        btn.addEventListener('mouseenter', () => {
            ac.index = i;
            acRender();
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            acSelect();
        });
        list.append(btn);
    });
    ac.el.append(list);
}

async function acShowTags(textEl, trig) {
    const tags = await loadAcTags();
    const q = trig.query;
    const filtered = tags.filter((t) => t.toLowerCase().startsWith(q.toLowerCase())).sort();
    const items = [];
    if (q && !filtered.some((t) => t.toLowerCase() === q.toLowerCase())) {
        items.push({ create: q });
    }
    items.push(...filtered.slice(0, 8).map((t) => ({ tag: t })));
    if (!items.length) {
        acHide();
        return;
    }
    ac.type = 'tag';
    ac.node = textEl;
    ac.data = trig;
    ac.items = items;
    ac.index = 0;
    acRender();
    acShowAtCaret(textEl);
}

function acSelect() {
    if (!ac.node || ac.type === null) return;
    const item = ac.items[ac.index];
    if (!item) return;
    const trig = findTriggerAtCaret(ac.node);
    if (!trig || trig.type !== ac.type) {
        acHide();
        return;
    }
    let insert = '';
    if (ac.type === 'tag') {
        insert = trig.trigger[0] + (item.create || item.tag);
    }
    replaceAcRange(trig.container, trig.start, trig.end, insert);
    acHide();
    ac.node.focus();
}

function acShowDate(textEl, trig) {
    ac.type = 'date';
    ac.node = textEl;
    ac.data = trig;
    ac.el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'p-2 space-y-2 w-56';
    const today = new Date();
    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const input = document.createElement('input');
    input.type = 'date';
    input.value = /^\d{4}-\d{2}-\d{2}$/.test(trig.query) ? trig.query : fmt(today);
    input.className = 'w-full rounded border border-black/10 px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#d9a441]';
    const quick = [
        ['Hari ini', today],
        ['Besok', new Date(today.getTime() + 86400000)],
        ['Kemarin', new Date(today.getTime() - 86400000)],
        ['+1 minggu', new Date(today.getTime() + 7 * 86400000)],
    ];
    const rowWrap = document.createElement('div');
    rowWrap.className = 'flex gap-1 flex-wrap';
    quick.forEach(([label, d]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-2 py-1 rounded text-[12px] bg-[#f4f3f2] hover:bg-black/10';
        b.textContent = label;
        b.addEventListener('click', () => acInsertDate(fmt(d)));
        rowWrap.append(b);
    });
    const ok = () => acInsertDate(input.value);
    input.addEventListener('change', ok);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            ok();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            acHide();
            textEl.focus();
        }
    });
    wrap.append(input, rowWrap);
    ac.el.append(wrap);
    acShowAtCaret(textEl);
    input.focus();
}

function acInsertDate(value) {
    if (!ac.node) return;
    const trig = findTriggerAtCaret(ac.node);
    if (trig && trig.type === 'date') {
        replaceAcRange(trig.container, trig.start, trig.end, `!${value}`);
    }
    acHide();
    ac.node.focus();
}

async function updateAutocomplete(textEl, id) {
    ensureAcEl();
    if (!editing) {
        acHide();
        return;
    }
    const t = textEl.innerText || textEl.textContent || '';
    if (t.endsWith('[[')) {
        acHide();
        return;
    }
    const trig = findTriggerAtCaret(textEl);
    if (!trig) {
        acHide();
        return;
    }
    if (trig.type === 'tag') await acShowTags(textEl, trig);
    else if (trig.type === 'date') acShowDate(textEl, trig);
}

function showSr(msg) {
    els.srResult.textContent = msg;
    els.srResult.classList.remove('hidden');
}

function srParams() {
    const q = els.srFind.value.trim();
    if (!q) {
        showSr('Ketik kata yang dicari.');
        return null;
    }
    return { q, case_sensitive: els.srMatch.checked };
}

async function srCount() {
    const p = srParams();
    if (!p) return;
    try {
        const data = await api.post(`/documents/${docId}/items-search`, { ...p, match: true });
        showSr(`Ditemukan ${data.count} item.`);
    } catch (e) {
        showSr(e.message);
    }
}

async function srReplaceAll() {
    const p = srParams();
    if (!p) return;
    recordUndo();
    try {
        const data = await api.post(`/documents/${docId}/items-search`, { ...p, replace_with: els.srReplace.value });
        showSr(`Diganti di ${data.count} item.`);
        loadItems();
    } catch (e) {
        showSr(e.message);
    }
}

// ---- Wiring ----
function setShowCompleted(v) {
    completedOverride = v ? 'show' : 'hide';
    saveUiState();
    applyEffectiveView();
    render();
    if (!document.getElementById('view-options')?.classList.contains('hidden')) renderViewOptions();
}

function setShowNotes(v) {
    notesOverride = v ? 'show' : 'hide';
    saveUiState();
    applyEffectiveView();
    render();
    if (!document.getElementById('view-options')?.classList.contains('hidden')) renderViewOptions();
}

function cycleTheme() {
    theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'sepia' : 'light';
    savePrefs();
    applyTheme();
    renderViewOptions();
}

function setTheme(t) {
    theme = t;
    savePrefs();
    applyTheme();
    renderViewOptions();
}

function setDefaultBullet(b) {
    defaultBullet = b;
    savePrefs();
    renderViewOptions();
}

function setSpacing(v) {
    spacing = v;
    savePrefs();
    applySpacing();
    renderViewOptions();
}

function applySpacing() {
    const outline = els.outline;
    if (!outline) return;
    outline.classList.remove('spacing-dense', 'spacing-normal', 'spacing-wide');
    outline.classList.add(`spacing-${spacing}`);
}

// ---- Prefs visual (font size, narrow, dll) ----
function applyPrefsVisual() {
    const outline = els.outline;
    if (outline) {
        outline.classList.remove('font-small', 'font-medium', 'font-large');
        outline.classList.add(`font-${fontSize}`);
    }
    document.body.classList.toggle('narrow', narrow);
    document.body.classList.toggle('no-highlight', !highlightCurrent);
    renderSettingsModal();
    if (!document.getElementById('view-options')?.classList.contains('hidden')) renderViewOptions();
}

function updateWordCount() {
    if (!els.statusWords || !els.statusBar) return;
    if (!docId) return;
    let count = 0;
    for (const f of flat) {
        const c = String(f.node.content || '');
        const n = String(f.node.note || '');
        count += c.trim() ? c.trim().split(/\s+/).length : 0;
        count += n.trim() ? n.trim().split(/\s+/).length : 0;
    }
    if (showWordCount) {
        els.statusCount.textContent = `${flat.length.toLocaleString('id-ID')} item`;
        els.statusWords.textContent = `${count.toLocaleString('id-ID')} kata`;
    } else {
        els.statusCount.textContent = '';
        els.statusWords.textContent = '';
    }
}

let saveStatusTimer = null;
function setSaveStatus(text, ok) {
    if (!els.statusSave) return;
    els.statusSave.textContent = text;
    els.statusSave.style.color = ok ? '' : '#c07a12';
    clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
        els.statusSave.textContent = 'Tersimpan';
        els.statusSave.style.color = '';
    }, 1500);
}

// ---- Settings modal ----
function openSettings() {
    renderSettingsModal();
    els.settingsModal.classList.remove('hidden');
}

function renderSettingsModal() {
    if (!els.settingsModal) return;
    els.settingsModal.querySelectorAll('.pref-btn').forEach((b) => {
        const pref = b.dataset.pref;
        const val = b.dataset.val;
        const current = pref === 'fontSize' ? fontSize : pref === 'globalCompleted' ? globalCompleted : pref === 'globalNotes' ? globalNotes : spacing;
        b.classList.toggle('pref-active', current === val);
    });
    els.settingsModal.querySelectorAll('[data-pref-toggle]').forEach((cb) => {
        const pref = cb.dataset.prefToggle;
        const current = pref === 'highlightCurrent' ? highlightCurrent : pref === 'narrow' ? narrow : pref === 'bulletZoom' ? bulletZoom : showWordCount;
        cb.checked = current;
    });
}

function wireSettings() {
    if (!els.settingsModal) return;
    els.settingsModal.querySelectorAll('[data-settings-close]').forEach((el) => el.addEventListener('click', () => els.settingsModal.classList.add('hidden')));
    els.settingsModal.querySelectorAll('.pref-btn').forEach((b) => {
        b.addEventListener('click', () => {
            const pref = b.dataset.pref;
            const val = b.dataset.val;
            if (pref === 'theme') theme = val;
            else if (pref === 'spacing') spacing = val;
            else if (pref === 'fontSize') fontSize = val;
            else if (pref === 'globalCompleted') globalCompleted = val;
            else if (pref === 'globalNotes') globalNotes = val;
            savePrefs();
            applyTheme();
            applySpacing();
            applyPrefsVisual();
            applyEffectiveView();
            render();
        });
    });
    els.settingsModal.querySelectorAll('[data-pref-toggle]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const pref = cb.dataset.prefToggle;
            if (pref === 'highlightCurrent') highlightCurrent = cb.checked;
            else if (pref === 'narrow') narrow = cb.checked;
            else if (pref === 'bulletZoom') bulletZoom = cb.checked;
            else if (pref === 'showWordCount') showWordCount = cb.checked;
            else if (pref === 'reminderNotify') reminderNotify = cb.checked;
            savePrefs();
            applyPrefsVisual();
            updateWordCount();
        });
    });
}

function renderViewOptions() {
    const pop = document.getElementById('view-options');
    if (!pop) return;
    pop.querySelectorAll('.view-opt').forEach((b) => {
        const group = b.dataset.view;
        const val = b.dataset.val;
        let active = false;
        if (group === 'completed') active = (val === 'global' && completedOverride === null) || (completedOverride !== null && val === completedOverride);
        else if (group === 'notes') active = (val === 'global' && notesOverride === null) || (notesOverride !== null && val === notesOverride);
        else if (group === 'theme') active = theme === val;
        else if (group === 'spacing') active = spacing === val;
        else if (group === 'bullet') active = defaultBullet === val;
        b.classList.toggle('view-opt-active', active);
        b.style.fontWeight = active ? '600' : '400';
        b.style.color = active ? '#c07a12' : '';
        let mark = b.querySelector('.view-opt-mark');
        if (active && !mark) {
            mark = document.createElement('span');
            mark.className = 'view-opt-mark shrink-0';
            mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M20 6 9 17l-5-5"/></svg>';
            b.prepend(mark);
        } else if (!active && mark) {
            mark.remove();
        }
    });
}

function toggleViewOptions(btn) {
    const pop = document.getElementById('view-options');
    if (pop.classList.contains('hidden')) {
        closeMenu();
        renderViewOptions();
        pop.classList.remove('hidden');
        const r = btn.getBoundingClientRect();
        const m = pop.getBoundingClientRect();
        let left = Math.min(r.right, window.innerWidth - m.width - 8);
        let top = r.bottom + 4;
        if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 4;
        pop.style.left = `${Math.max(8, left)}px`;
        pop.style.top = `${Math.max(8, top)}px`;
    } else {
        pop.classList.add('hidden');
    }
}

function closeViewOptions() {
    const pop = document.getElementById('view-options');
    if (pop) pop.classList.add('hidden');
}

function updateReminderBadge() {
    if (!els.reminderBadge) return;
    const upcoming = flat.filter((f) => !f.node.checked && hasReminder(f.node.content, f.node.note)).length;
    els.reminderBadge.classList.toggle('hidden', upcoming === 0);
    if (upcoming) els.reminderBadge.textContent = upcoming > 9 ? '9+' : String(upcoming);
}

function renderReminderPop() {
    if (!els.reminderList) return;
    const upcoming = flat
        .filter((f) => !f.node.checked && hasReminder(f.node.content, f.node.note))
        .map((f) => {
            const all = parseReminders(`${f.node.content}\n${f.node.note}`);
            const next = all.sort((a, b) => a - b)[0];
            return { node: f.node, next };
        })
        .sort((a, b) => a.next - b.next);
    els.reminderList.innerHTML = '';
    if (!upcoming.length) {
        const empty = document.createElement('div');
        empty.className = 'px-3 py-3 text-[12px] text-[#8a857e]';
        empty.textContent = 'Tidak ada item dengan pengingat. Ketik !2026-08-10 pada item.';
        els.reminderList.appendChild(empty);
    } else {
        for (const r of upcoming) {
            const row = document.createElement('button');
            row.className = 'view-opt w-full flex items-center gap-2 px-3 py-1.5 text-left';
            row.innerHTML = `<span class="w-5 h-5 shrink-0 flex items-center justify-center text-[#c07a12]">${SVG.clock}</span>
                <span class="flex-1 min-w-0"><span class="block truncate">${escapeHtml(r.node.content || '(tanpa judul)')}</span>
                <span class="block text-[11px] ${r.next < new Date() ? 'text-red-600' : 'text-[#8a857e]'}">${r.next.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}${r.next < new Date() ? ' — terlambat' : ''}</span></span>`;
            row.addEventListener('click', () => {
                if (r.node.document_id === docId) {
                    zoomToItem(r.node.id);
                    closeReminderPop();
                } else {
                    openDocument(r.node.document_id).then(() => zoomToItem(r.node.id));
                    closeReminderPop();
                }
            });
            els.reminderList.appendChild(row);
        }
    }
    const on = reminderNotify && 'Notification' in window && Notification.permission === 'granted';
    els.reminderNotifyLabel.textContent = `Notifikasi browser ${on ? 'aktif' : 'mati'}`;
}

function toggleReminderPop(btn) {
    if (els.reminderPop.classList.contains('hidden')) {
        closeMenu();
        closeViewOptions();
        renderReminderPop();
        els.reminderPop.classList.remove('hidden');
        const r = btn.getBoundingClientRect();
        const m = els.reminderPop.getBoundingClientRect();
        let left = Math.min(r.right, window.innerWidth - m.width - 8);
        let top = r.bottom + 4;
        if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 4;
        els.reminderPop.style.left = `${Math.max(8, left)}px`;
        els.reminderPop.style.top = `${Math.max(8, top)}px`;
    } else {
        closeReminderPop();
    }
}

function closeReminderPop() {
    if (els.reminderPop) els.reminderPop.classList.add('hidden');
}

function wireToolbar() {
    els.bookmarkBtn.addEventListener('click', toggleBookmark);
    els.reminderBtn.addEventListener('click', () => toggleReminderPop(els.reminderBtn));
    els.reminderNotifyToggle.addEventListener('click', async () => {
        if (!('Notification' in window)) {
            toast('Browser tidak mendukung notifikasi.');
            return;
        }
        if (Notification.permission === 'granted') {
            reminderNotify = !reminderNotify;
            savePrefs();
            renderReminderPop();
            toast(reminderNotify ? 'Notifikasi pengingat aktif.' : 'Notifikasi pengingat dimatikan.');
        } else if (Notification.permission === 'denied') {
            toast('Izin notifikasi ditolak oleh browser.');
        } else {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                reminderNotify = true;
                savePrefs();
                renderReminderPop();
                toast('Notifikasi pengingat aktif.');
            }
        }
    });

    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);
    updateUndoButtons();

    document.querySelectorAll('#doc-toolbar [data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const act = btn.dataset.act;
            if (act === 'add') addItem();
            else if (act === 'search') openDocSearch();
            else if (act === 'view-options') toggleViewOptions(btn);
            else if (act === 'zoom-in') zoomInto(selectedId);
            else if (act === 'note') openNoteEditor(selectedId);
            else if (act === 'bold') applyFormat(selectedId, '**', '**');
            else if (act === 'italic') applyFormat(selectedId, '__', '__');
            else if (act === 'code') applyFormat(selectedId, '`', '`');
            else if (act === 'heading') toggleHeading(selectedId);
            else if (act === 'color') cycleColor(selectedId);
            else if (act === 'indent') {
                const ids = multi.size > 1 ? [...multi].filter((id) => flat.some((f) => f.node.id === id)) : [selectedId];
                if (ids.length > 1) indentMany(ids);
                else indent(selectedId);
            }
            else if (act === 'unindent') {
                const ids = multi.size > 1 ? [...multi].filter((id) => flat.some((f) => f.node.id === id)) : [selectedId];
                if (ids.length > 1) unindentMany(ids);
                else unindent(selectedId);
            }
            else if (act === 'move-up') move('up');
            else if (act === 'move-down') move('down');
            else if (act === 'toggle-check') {
                if (multi.size > 1) {
                    const checklistIds = [...multi].filter((id) => {
                        const f = flat.find((x) => x.node.id === id);
                        return f && (f.node.bullet || 'bullet') === 'checklist';
                    });
                    if (checklistIds.length) {
                        const allChecked = checklistIds.every((id) => flat.find((f) => f.node.id === id)?.node.checked);
                        bulkComplete(!allChecked);
                    }
                } else if (selectedId) {
                    const rec = rows.get(selectedId);
                    if (rec && (rec.node.bullet || 'bullet') === 'checklist') {
                        toggleCheck(selectedId);
                    }
                }
            }
            else if (act === 'number-children') numberChildren();
            else if (act === 'delete') {
                if (multi.size > 1) bulkDelete();
                else deleteItem(selectedId);
            }
            else if (act === 'delete-checked') deleteChecked();
            else if (act === 'more') {
                const node = selectedId && rows.get(selectedId)?.node;
                if (!node) return;
                toggleContextMenu(btn, menuItemsFor(node));
            }
            else if (act === 'toggle-show-completed') setShowCompleted(!showCompleted);
            else if (act === 'toggle-show-notes') setShowNotes(notesMode === 'hide');
            else if (act === 'toggle-theme') cycleTheme();
            else if (act === 'settings') openSettings();
        });
    });

    const pop = document.getElementById('view-options');
    pop.querySelectorAll('.view-opt').forEach((b) => {
        b.addEventListener('click', () => {
            const group = b.dataset.view;
            const val = b.dataset.val;
            if (group === 'completed') {
                completedOverride = val === 'global' ? null : val;
                saveUiState();
                applyEffectiveView();
                render();
            } else if (group === 'notes') {
                notesOverride = val === 'global' ? null : val;
                saveUiState();
                applyEffectiveView();
                render();
            } else if (group === 'theme') setTheme(val);
            else if (group === 'spacing') setSpacing(val);
            else if (group === 'bullet') setDefaultBullet(val);
            closeViewOptions();
        });
    });

    document.addEventListener('click', (e) => {
        const pop = document.getElementById('view-options');
        if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && !e.target.closest('[data-act="view-options"]')) {
            pop.classList.add('hidden');
        }
        if (els.reminderPop && !els.reminderPop.classList.contains('hidden') && !els.reminderPop.contains(e.target) && !e.target.closest('#reminder-btn')) {
            els.reminderPop.classList.add('hidden');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeViewOptions();
            closeReminderPop();
        }
    });
    window.addEventListener('resize', () => {
        closeViewOptions();
        closeReminderPop();
    });
}

function wireOutline() {
    els.outline.addEventListener('paste', async (e) => {
        if (e.target.closest('.item-text')) return;
        const imgItem = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
        if (imgItem) {
            e.preventDefault();
            const file = imgItem.getAsFile();
            if (!file) return;
            const selRec = selectedId ? rows.get(selectedId) : null;
            let parentId = selRec ? (selRec.node.parent_id || null) : null;
            if (parentId && String(parentId).startsWith('tmp-')) parentId = null;
            const blobUrl = URL.createObjectURL(file);
            recordUndo();
            const tempId = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const content = `![](${blobUrl})`;
            const node = { id: tempId, parent_id: parentId, content, note: '', checked: false, heading: 0, color: null, bullet: defaultBullet, tags: [], sort_order: 0, children: [] };
            const pos = selRec ? siblingPosition(selRec.node) + 1 : flat.filter((f) => !f.node.parent_id).length;
            insertNodeLocally(parentId, pos, node);
            buildFlat(); applyZoomFilter(); render(); selectItem(tempId);
            const promise = api.post(`/documents/${docId}/items`, { parent_id: parentId, content: node.content, bullet: node.bullet }).then((d) => d.data.id);
            registerPendingItem(tempId, promise);
            promise.then((realId) => {
                node.id = realId;
                const rec = rows.get(tempId);
                if (rec) { rows.delete(tempId); rows.set(realId, rec); rec.node = node; if (rec.row) rec.row.dataset.id = realId; }
                if (selectedId === tempId) selectedId = realId;
                unregisterPendingItem(tempId);
                reparentTempChildren(tempId, realId);
            }).catch(() => { removeNodeLocally(tempId); unregisterPendingItem(tempId); });
            const permanentUrl = await uploadImage(file);
            if (permanentUrl) {
                URL.revokeObjectURL(blobUrl);
                node.content = `![](${permanentUrl})`;
                const realId = await promise.catch(() => null);
                if (realId) {
                    const rec = rows.get(realId);
                    if (rec) { rec.node = node; if (rec.text) { rec.text.innerHTML = contentHtml(node.content); wireInlineImages(rec.text, realId); } }
                }
                api.patch(`/documents/${docId}/items/${realId || tempId}`, { content: node.content }).catch(() => {});
            }
            return;
        }
        const parsed = parseClipboardItems(e.clipboardData);
        if (!parsed.length) return;
        e.preventDefault();
        const selRec = selectedId ? rows.get(selectedId) : null;
        let parentId = selRec ? selRec.node.id : null;
        if (parentId && String(parentId).startsWith('tmp-')) parentId = null;
        const baseIndent = parsed.reduce((min, p) => Math.min(min, p.indent), Infinity);
        parsed.forEach(p => { p.indent -= baseIndent; });

        const buildSnapshotTree = (lines) => {
            const root = { children: [] };
            const stack = [{ indent: -1, node: root }];
            for (const { content, indent } of lines) {
                while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
                const snap = { content, children: [] };
                stack[stack.length - 1].node.children.push(snap);
                stack.push({ indent, node: snap });
            }
            return root.children;
        };
        const snapshots = buildSnapshotTree(parsed);
        const pos = parentId ? childCount(parentId) : flat.filter((f) => !f.node.parent_id).length;

        recordUndo();
        const tempNodes = snapshots.map((snap) => buildTempNodeFromSnapshot(snap, parentId));
        tempNodes.forEach((n, i) => insertNodeLocally(parentId, pos + i, n));
        buildFlat();
        applyZoomFilter();
        render();
        const firstTop = tempNodes[0];
        if (firstTop) selectItem(firstTop.id);

        try {
            await Promise.all(tempNodes.map((n, i) => persistPastedNode(n, parentId, pos + i)));
        } catch (err) {
            showFailedAlert('Sebagian item gagal disimpan: ' + err.message);
            loadItems();
        }
    });

    // ── drop file eksternal (gambar / teks) ke outline ───────────────────
    els.outline.addEventListener('dragover', (e) => {
        if ([...(e.dataTransfer?.types || [])].includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            els.outline.classList.add('file-drop-target');
        }
    });
    els.outline.addEventListener('dragleave', () => {
        els.outline.classList.remove('file-drop-target');
    });
    els.outline.addEventListener('drop', async (e) => {
        const types = [...(e.dataTransfer?.types || [])];
        if (!types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        els.outline.classList.remove('file-drop-target');
        const rowEl = e.target && e.target.closest ? e.target.closest('.item-row') : null;
        const parentId = rowEl ? rowEl.dataset.id : null;
        await insertDroppedFiles(e.dataTransfer, parentId);
    }, true);

    // ── drag-select antar baris (mirip Dynalist: drag di luar bullet/teks) ──
    document.addEventListener('mousemove', (e) => {
        if (blockSelectStartId == null || !(e.buttons & 1)) return;
        const rowEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.item-row');
        if (!rowEl) return;
        const overId = rowEl.dataset.id;
        if (String(overId) === String(blockSelectStartId) && !blockSelectActive) return;

        if (!blockSelectActive) {
            blockSelectActive = true;
            window.getSelection()?.removeAllRanges();
            document.body.classList.add('block-select-dragging');
        }

        const ids = flat.map((f) => String(f.node.id));
        const a = ids.indexOf(String(blockSelectStartId));
        const b = ids.indexOf(String(overId));
        if (a === -1 || b === -1) return;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        multi.clear();
        for (let i = lo; i <= hi; i++) multi.add(flat[i].node.id);
        selAnchor = blockSelectStartId;
        selEdge = overId;
        selectedId = flat[b].node.id;
        refreshHighlights();
    });

    document.addEventListener('mouseup', () => {
        if (blockSelectActive) {
            document.body.classList.remove('block-select-dragging');
            suppressNextRowClick = true;
        }
        blockSelectStartId = null;
        blockSelectActive = false;
    });

    els.outline.addEventListener('keydown', (e) => {
        if (editing || e.defaultPrevented) return;

        if (e.ctrlKey) {
            const key = e.key.toLowerCase();
            if (key === 'a' && e.shiftKey) {
                e.preventDefault();
                multi.clear();
                flat.forEach((f) => multi.add(f.node.id));
                refreshHighlights();
            } else if (key === 'a') {
                e.preventDefault();
                selectUpward();
            } else if (key === 'enter') {
                e.preventDefault();
                // Ctrl+Enter = mark as done (hanya menandai selesai, persis Dynalist)
                markAsDone(selectedId);
            } else if (e.shiftKey && key === 'e') {
                e.preventDefault();
                e.stopPropagation();
                if (selectedId) applyFormat(selectedId, '`', '`');
            } else if (key === 'e') {
                e.preventDefault();
                e.stopPropagation();
                if (selectedId) startEdit(selectedId);
            } else if (!e.shiftKey && key === 'b') {
                e.preventDefault();
                e.stopPropagation();
                if (selectedId) applyFormat(selectedId, '**', '**');
            } else if (!e.shiftKey && key === 'i') {
                e.preventDefault();
                e.stopPropagation();
                if (selectedId) applyFormat(selectedId, '__', '__');
            } else if (!e.shiftKey && key === 'k') {
                e.preventDefault();
                e.stopPropagation();
                if (selectedId) openLinkPicker(selectedId);
            } else if (e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
                e.preventDefault();
                if (multi.size > 1) bulkDelete();
                else deleteItem(selectedId);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                move('up');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                move('down');
            } else if (e.code === 'Period') {
                e.preventDefault();
                if (e.shiftKey) toggleCollapseAll();
                else if (selectedId) toggleCollapse(selectedId);
            } else if (e.code === 'BracketRight') {
                e.preventDefault();
                if (e.shiftKey) zoomToSiblingItem('next');
                else if (selectedId) zoomInto(selectedId);
            } else if (e.code === 'BracketLeft') {
                e.preventDefault();
                if (e.shiftKey) zoomToSiblingItem('prev');
                else zoomOutLevel();
            } else if (e.shiftKey && key === 'h') {
                e.preventDefault();
                toggleHeading(selectedId);
            } else if (e.shiftKey && key === 'l') {
                e.preventDefault();
                cycleDocColor();
            } else if (e.shiftKey && key === 'c') {
                e.preventDefault();
                toggleBulletType(selectedId, 'checklist');
            } else if (e.shiftKey && key === 'x') {
                e.preventDefault();
                toggleBulletType(selectedId, 'numbered');
            } else if (e.shiftKey && key === 'm') {
                e.preventDefault();
                openMovePicker(selectedId);
            } else if (key === 'c' && !e.shiftKey) {
                e.preventDefault();
                copyItems();
            } else if (key === 'x' && !e.shiftKey) {
                e.preventDefault();
                cutItems();
            } else if (key === 'v' && e.shiftKey) {
                if (itemClipboard) {
                    e.preventDefault();
                    pasteAsSibling(selectedId);
                }
            } else if (key === 'v' && !e.shiftKey) {
                if (itemClipboard) {
                    e.preventDefault();
                    pasteAsChild(selectedId);
                }
            } else if (key === 'd' && e.shiftKey) {
                e.preventDefault();
                duplicateItem(selectedId);
            } else if (key === 'n' && e.altKey && !e.shiftKey) {
                e.preventDefault();
                if (selectedId) toggleItemBookmark(selectedId);
            } else if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (docUndoIsNewest()) undoLastDocCreation();
                else undo();
            } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                redo();
            } else if (e.key === 'Home') {
                e.preventDefault();
                if (flat.length) selectItem(flat[0].node.id);
            } else if (e.key === 'End') {
                e.preventDefault();
                if (flat.length) selectItem(flat[flat.length - 1].node.id);
            }
            return;
        }

        if (e.key === 'ArrowDown' && e.shiftKey) {
            e.preventDefault();
            extendSelect('down');
        } else if (e.key === 'ArrowUp' && e.shiftKey) {
            e.preventDefault();
            extendSelect('up');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            nav(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nav(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navInto();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navOut();
        } else if (e.key === 'PageDown') {
            e.preventDefault();
            nav(10);
        } else if (e.key === 'PageUp') {
            e.preventDefault();
            nav(-10);
        } else if (e.key === 'Home') {
            e.preventDefault();
            if (flat.length) selectItem(flat[0].node.id);
        } else if (e.key === 'End') {
            e.preventDefault();
            if (flat.length) selectItem(flat[flat.length - 1].node.id);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const node = rows.get(selectedId)?.node;
            if (node && node.children && node.children.length) {
                navInto();
            } else {
                addSiblingBelow();
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (multi.size > 1) {
                const ids = [...multi].filter((id) => flat.some((f) => f.node.id === id));
                if (ids.length > 1) {
                    if (e.shiftKey) unindentMany(ids);
                    else indentMany(ids);
                } else if (e.shiftKey) {
                    unindent(selectedId);
                } else {
                    indent(selectedId);
                }
            } else if (e.shiftKey) {
                unindent(selectedId);
            } else {
                indent(selectedId);
            }
        } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            if (multi.size > 1) {
                // Bulk: hanya check item yang merupakan checklist
                const checklistIds = [...multi].filter((id) => {
                    const f = flat.find((x) => x.node.id === id);
                    return f && (f.node.bullet || 'bullet') === 'checklist';
                });
                if (checklistIds.length) {
                    const allChecked = checklistIds.every((id) => flat.find((f) => f.node.id === id)?.node.checked);
                    bulkComplete(!allChecked);
                }
            } else if (selectedId) {
                const rec = rows.get(selectedId);
                if (rec && (rec.node.bullet || 'bullet') === 'checklist') {
                    toggleCheck(selectedId);
                }
                // bukan checklist = tidak ada efek (persis ABCLIST)
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (multi.size) clearMulti();
        }
    });
}

function wireTitle() {
    els.docMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = store.selectedNode;
        if (!node || node.type === 'folder') return;
        import('./context-menu').then(({ openDocMenuAt }) => {
            const r = els.docMenuBtn.getBoundingClientRect();
            openDocMenuAt(r.left, r.bottom + 4, node);
        });
    });

    els.title.addEventListener('change', async () => {
        const v = els.title.value.trim();
        if (!v) {
            els.title.value = store.selectedNode?.name || '';
            return;
        }
        if (v === (store.selectedNode?.name || '')) return;
        const previous = els.title.value;
        try {
            await api.patch(`/documents/${docId}`, { name: v });
            if (store.selectedNode) store.selectedNode.name = v;
            loadTree();
        } catch (e) {
            els.title.value = previous;
            showFailedAlert(e.message);
        }
    });
}

function wireSr() {
    els.srCountBtn.addEventListener('click', srCount);
    els.srReplaceBtn.addEventListener('click', srReplaceAll);
    els.srCancel.addEventListener('click', closeSr);
    els.srModal.querySelectorAll('[data-sr-close]').forEach((el) => el.addEventListener('click', closeSr));
    els.srFind.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            srCount();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeSr();
        }
    });
}

export function init() {
    cacheEls();
    loadPrefs();
    applyTheme();
    applySpacing();
    applyPrefsVisual();
    wireSettings();
    window.addEventListener('dyn:save-start', () => setSaveStatus('Menyimpan…', false));
    window.addEventListener('dyn:save-end', () => setSaveStatus('Tersimpan', true));
    els.zoomBar = createZoomBar();
    els.container.insertBefore(els.zoomBar, els.outline);
    updateZoomBar();
    wireToolbar();
    wireTrash();
    wireOutline();
    wireTitle();
    wireSr();
    wireDocSearch();

    document.addEventListener('dyn:select', () => {
        const node = store.selectedNode;
        if (!node) return;
        if (node.type === 'folder') showFolder(node);
        else openDocument(node.id);
    });

    document.addEventListener('dyn:tag-colors-changed', () => {
        applyTagColors(els.outline);
        renderTags();
    });

    setInterval(() => {
        if (!docId) return;
        notifyDueReminders();
        updateReminderBadge();
    }, 30000);
}
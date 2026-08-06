import { api } from './api';
import { toast } from './ui';
import { store } from './store';
import { showSuccess, showFailedAlert, esc, showPopupWithAction } from './alerts';
import Swal from 'sweetalert2';
import { loadTree, highlightDocument, findNode } from './sidebar';
import { loadBookmarks } from './bookmarks';
import katex from 'katex';
import 'katex/dist/katex.min.css';

let docId = null;
let tree = [];
let flat = [];
let selectedId = null;
let editing = false;
let zoomId = null;
let tagFilter = null;
let dragId = null;
let dropAction = null;
let showCompleted = true;
let showNotes = true;
let theme = 'light';
let defaultBullet = 'bullet';
let trashItems = [];
const multi = new Set();
let selAnchor = null;
let selEdge = null;
let linkPickerTarget = null;
let linkPickerRange = null;
let hoveredRowId = null;
let ntHideTimer = null;
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
};

function cacheEls() {
    els.toolbar = document.getElementById('doc-toolbar');
    els.view = document.getElementById('doc-view');
    els.empty = document.getElementById('main-empty');
    els.container = document.getElementById('doc-container');
    els.breadcrumb = document.getElementById('doc-breadcrumb');
    els.title = document.getElementById('doc-title');
    els.meta = document.getElementById('doc-meta');
    els.tags = document.getElementById('doc-tags');
    els.outline = document.getElementById('outline');
    els.loading = document.getElementById('outline-loading');
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
    updateNodeToolbar();
    closeTrash();

    showToolbar(true);
    showDocContainer(true);

    const node = store.selectedNode;
    els.title.value = node?.name || 'Tanpa judul';
    els.meta.textContent = node?.is_inbox ? 'Dokumen Inbox' : 'Dokumen';
    renderBreadcrumb(node);

    await loadBookmarkState();
    await loadItems();
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
    updateNodeToolbar();

    showToolbar(false);
    showDocContainer(true);
    els.title.value = node.name || 'Folder';
    els.meta.textContent = 'Folder';
    renderBreadcrumb(node);
    if (els.tags) {
        els.tags.innerHTML = '';
        els.tags.classList.add('hidden');
    }
    els.loading.classList.add('hidden');
    els.outline.classList.remove('hidden');
    els.outline.innerHTML =
        '<p class="py-6 text-center text-sm text-[#b5b0a9]">Folder. Pilih dokumen di dalamnya dari panel kiri.</p>';
}

async function loadItems() {
    if (!docId) return;
    const id = docId;
    els.loading.classList.remove('hidden');
    els.outline.classList.add('hidden');
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
    } catch (e) {
        if (id === docId) showFailedAlert(e.message);
    } finally {
        if (id === docId) {
            els.loading.classList.add('hidden');
            els.outline.classList.remove('hidden');
        }
    }
}

function uiKey() {
    return `dynalist_ui_${docId}`;
}

function loadUiState() {
    zoomId = null;
    collapsed.clear();
    try {
        const raw = localStorage.getItem(uiKey());
        if (raw) {
            const s = JSON.parse(raw);
            if (s.zoom) zoomId = s.zoom;
            if (Array.isArray(s.collapsed)) s.collapsed.forEach((c) => collapsed.add(c));
        }
    } catch {
        // ignore
    }
}

function saveUiState() {
    try {
        localStorage.setItem(uiKey(), JSON.stringify({ zoom: zoomId, collapsed: [...collapsed] }));
    } catch {
        // ignore
    }
}

function render() {
    els.outline.innerHTML = '';
    rows.clear();
    hoveredRowId = null;
    clearTimeout(ntHideTimer);
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
        updateNodeToolbar();
        return;
    }
    for (const { node, depth } of visible) {
        els.outline.append(buildRow(node, depth));
    }
    updateNodeToolbar();
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

    const bulletType = node.bullet === 'checklist' ? 'checklist' : node.bullet === 'numbered' ? 'numbered' : 'bullet';

    // ── chevron (collapse/expand) ─────────────────────────────────────────
    // Selalu alokasikan ruang chevron (w-3) agar teks tetap lurus
    const chevronWrap = document.createElement('div');
    chevronWrap.className = 'shrink-0 mt-[4px] w-3 h-4 flex items-center justify-center';

    if (Array.isArray(node.children) && node.children.length) {
        const chevron = document.createElement('button');
        chevron.type = 'button';
        chevron.className = 'item-chevron w-3 h-3 flex items-center justify-center rounded transition-transform opacity-0';
        chevron.innerHTML = SVG.chevron;
        chevron.title = 'Ciutkan / bentangkan';
        if (collapsed.has(node.id)) chevron.classList.add('-rotate-90');
        chevron.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollapse(node.id);
            chevron.classList.toggle('-rotate-90', collapsed.has(node.id));
        });
        chevronWrap.append(chevron);
    }

    // ── bullet ────────────────────────────────────────────────────────────
    // Bullet SELALU ada (disc/angka). Klik = collapse/expand children.
    const bullet = document.createElement('button');
    bullet.type = 'button';
    bullet.draggable = true;
    bullet.className = 'bullet shrink-0 w-4 h-4 flex items-center justify-center rounded cursor-grab';

    if (bulletType === 'numbered') {
        bullet.classList.add('numbered-bullet');
        bullet.title = 'Item bernomor · seret untuk memindahkan';
        bullet.innerHTML = `<span class="numbered-num">${numberedIndex(node)}</span>`;
    } else {
        // bullet biasa DAN checklist — keduanya tampil disc
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
        // Bullet klik = collapse/expand children (sama seperti Dynalist)
        if (Array.isArray(node.children) && node.children.length) {
            toggleCollapse(node.id);
        }
    });

    bullet.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragId = node.id;
        row.classList.add('opacity-40');
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = 'move';
    });
    bullet.addEventListener('dragend', () => {
        dragId = null;
        dropAction = null;
        clearDropIndicators();
        row.classList.remove('opacity-40');
    });

    // ── checkbox (hanya untuk checklist, muncul di kiri teks) ────────────
    let checkboxEl = null;
    if (bulletType === 'checklist') {
        checkboxEl = document.createElement('button');
        checkboxEl.type = 'button';
        checkboxEl.className = 'item-checkbox shrink-0 mt-[3px] w-[15px] h-[15px] flex items-center justify-center rounded-[3px] border transition-all cursor-pointer';
        if (node.checked) {
            checkboxEl.classList.add('checked');
        } else {
            checkboxEl.classList.add('unchecked');
        }
        checkboxEl.title = node.checked ? 'Klik untuk batal tandai' : 'Klik untuk tandai selesai';
        checkboxEl.innerHTML = node.checked ? SVG.check : '';
        checkboxEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (multi.size) clearMulti();
            selectItem(node.id);
            toggleCheck(node.id);
        });
    }

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
    wireInlineImages(text, node.id);
    text.contentEditable = 'false';

    let noteEl = null;
    if (node.note && showNotes) {
        noteEl = document.createElement('div');
        noteEl.className = 'item-note mt-0.5 text-[12.5px] text-[#8a857e] whitespace-pre-wrap';
        noteEl.textContent = node.note;
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

    // ── zoom & menu icons (inline sebelum bullet, muncul saat hover) ─────
    // Di Dynalist: hover row → ikon "titik tiga" (menu) & kaca pembesar (zoom)
    // muncul tepat di kiri bullet. Kita pakai pendekatan inline agar tidak
    // terpengaruh overflow hidden dari parent.
    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'item-zoom opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto shrink-0 w-[18px] h-[18px] flex items-center justify-center rounded text-[#8a857e] hover:text-[#c07a12] hover:bg-black/[0.06] transition-all';
    zoomBtn.innerHTML = SVG.zoom;
    zoomBtn.title = 'Zoom in (Ctrl+])';
    zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomInto(node.id);
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'item-menu-btn opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto shrink-0 w-[18px] h-[18px] flex items-center justify-center rounded text-[#8a857e] hover:text-[#24221f] hover:bg-black/[0.06] transition-all';
    menuBtn.innerHTML = SVG.dots;
    menuBtn.title = 'Menu item';
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleContextMenu(menuBtn, menuItemsFor(node));
    });

    const bulletZone = document.createElement('div');
    bulletZone.className = 'bullet-zone shrink-0 flex items-center gap-0.5 mt-[3px]';
    // urutan: [menu] [zoom] [chevron] [bullet]
    bulletZone.append(menuBtn, zoomBtn, chevronWrap, bullet);

    // ── badge children collapsed ──────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-0.5';
    if (Array.isArray(node.children) && node.children.length && collapsed.has(node.id)) {
        const badge = document.createElement('span');
        badge.className = 'shrink-0 mt-[3px] text-[11px] text-[#b5b0a9]';
        badge.textContent = `▸ ${countDescendants(node)}`;
        actions.append(badge);
    }
    actions.append(del);

    // ── susun baris ───────────────────────────────────────────────────────
    // urutan: [bulletZone] [checkbox?] [cell] [actions]
    row.append(bulletZone);
    if (checkboxEl) row.append(checkboxEl);
    row.append(cell, actions);

    row.dataset.id = node.id;
    rows.set(node.id, { row, text, bullet, cell, node, checkboxEl });

    // ── event baris ───────────────────────────────────────────────────────
    row.addEventListener('click', (e) => {
        if (e.target.closest('.bullet') ||
            e.target.closest('.item-del') ||
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
        const selInText = sel && !sel.isCollapsed && text.contains(sel.anchorNode);
        if (selInText) {
            if (!editing) { editing = true; text.contentEditable = 'true'; text.focus(); }
            return;
        }
        if (multi.size) clearMulti();
        selectItem(node.id);
        startEdit(node.id, e);
    });

    row.addEventListener('contextmenu', (e) => {
        if (editing) return;
        e.preventDefault();
        e.stopPropagation();
        if (!multi.has(node.id) && multi.size) { clearMulti(); }
        selectItem(node.id);
        openContextAt(e.clientX, e.clientY, menuItemsFor(node));
    });

    row.addEventListener('mouseenter', () => {
        hoveredRowId = node.id;
        clearTimeout(ntHideTimer);
        updateNodeToolbar();
    });
    row.addEventListener('mouseleave', () => {
        if (hoveredRowId !== node.id) return;
        hoveredRowId = null;
        clearTimeout(ntHideTimer);
        ntHideTimer = setTimeout(hideNodeToolbar, 200);
    });

    row.addEventListener('dragover', (e) => {
        if (!dragId || dragId === node.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
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
        if (action && dragId) doMove(dragId, action);
    });

    text.addEventListener('keydown', (e) => handleEditKey(e, node.id));
    text.addEventListener('blur', () => commitEdit(node.id));
    text.addEventListener('paste', async (e) => {
        const imgItem = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
        if (imgItem) {
            e.preventDefault();
            const file = imgItem.getAsFile();
            if (!file) return;
            const url = await uploadImage(file);
            if (!url) return;
            insertImageAtCaret(text, url);
            return;
        }
        e.preventDefault();
        const t = e.clipboardData.getData('text/plain');
        if (!t) return;
        let lines = t.split(/\r?\n/);
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        document.execCommand('insertText', false, lines[0]);
        if (lines.length > 1) {
            const parentId = node.parent_id || null;
            const pos = siblingPosition(node) + 1;
            commitEdit(node.id).then(async () => {
                let position = pos;
                try {
                    for (const line of lines.slice(1)) {
                        await api.post(`/documents/${docId}/items`, { parent_id: parentId, position, content: line });
                        position++;
                    }
                    await loadItems();
                } catch (err) {
                    showFailedAlert(err.message);
                }
            });
        }
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
    const restore = () => textEl.append(...Array.from(holder.childNodes));
    if (!tail.trim()) {
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

async function deleteImage(id, url) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    const path = String(url || '').split('/storage/')[1] || '';
    const content = rec.node.content || '';
    const next = content.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(url)}\\)`), ' ').replace(/\s{2,}/g, ' ').trim();
    try {
        if (path.startsWith('images/')) {
            await api.delete(`/documents/${docId}/images`, { path });
        }
        if (next !== content) {
            await api.patch(`/documents/${docId}/items/${id}`, { content: next });
            rec.node.content = next;
        }
        render();
    } catch (e) {
        showFailedAlert(e.message);
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
                out += `**${node.textContent}**`;
            } else if (node.tagName === 'EM' || node.tagName === 'I') {
                out += `__${node.textContent}__`;
            } else if (node.tagName === 'CODE') {
                out += `\`${node.textContent}\``;
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
    updateNodeToolbar();
}

function clearMulti() {
    if (!multi.size) return;
    multi.clear();
    selAnchor = null;
    selEdge = null;
    refreshHighlights();
    updateNodeToolbar();
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
    try {
        await Promise.all(targets.map((f) => api.patch(`/documents/${docId}/items/${f.node.id}`, { checked })));
        targets.forEach((f) => { f.node.checked = checked; });
        clearMulti();
        render();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function bulkDelete() {
    const ids = [...multi];
    if (!ids.length) return;
    recordUndo();
    try {
        await Promise.all(ids.map((id) => api.delete(`/documents/${docId}/items/${id}`)));
        ids.forEach((id) => {
            removeNodeLocally(id);
            collapsed.delete(id);
            multi.delete(id);
        });
        selAnchor = null;
        selEdge = null;
        if (selectedId && ids.includes(selectedId)) selectedId = null;
        buildFlat();
        applyZoomFilter();
        render();
        toast(`${ids.length} item dihapus. Pulihkan dari Trash.`);
    } catch (e) {
        showFailedAlert(e.message);
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
        const s = JSON.parse(localStorage.getItem('dynalist_prefs') || '{}');
        showCompleted = s.showCompleted !== false;
        showNotes = s.showNotes !== false;
        theme = s.theme || 'light';
        defaultBullet = ['bullet', 'checklist', 'numbered'].includes(s.defaultBullet) ? s.defaultBullet : 'bullet';
    } catch {
        // ignore
    }
}

function savePrefs() {
    try {
        localStorage.setItem('dynalist_prefs', JSON.stringify({ showCompleted, showNotes, theme, defaultBullet }));
    } catch {
        // ignore
    }
}

function applyTheme() {
    document.body.dataset.theme = theme;
}

function clearDropIndicators() {
    els.outline.querySelectorAll('.item-row.drop-before, .item-row.drop-after, .item-row.drop-child')
        .forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-child'));
}

function indexAmongSiblings(node) {
    const group = flat.filter((f) => (f.node.parent_id || null) === (node.parent_id || null));
    return group.findIndex((f) => f.node.id === node.id);
}

function numberedIndex(node) {
    let n = 1;
    for (const f of flat) {
        if ((f.node.parent_id || null) === (node.parent_id || null) && f.node.bullet === 'numbered') {
            if (f.node.id === node.id) return n;
            n++;
        }
    }
    return n;
}

function childCount(id) {
    return flat.filter((f) => (f.node.parent_id || null) === id).length;
}

function isDescendant(ancestorId, id) {
    const f = flat.find((x) => x.node.id === id);
    return f ? f.parents.includes(ancestorId) : false;
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

    try {
        await api.post(`/documents/${docId}/items/${id}/move`, { parent_id: parentId, position });
        await loadItems();
        selectItem(id);
    } catch (e) {
        showFailedAlert(e.message);
    }
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
    const finish = async (save) => {
        if (done) return;
        done = true;
        const value = ta.value.trim();
        ta.remove();
        if (save && value !== (rec.node.note || '')) {
            recordUndo();
            try {
                await api.patch(`/documents/${docId}/items/${id}`, { note: value });
                rec.node.note = value;
                render();
            } catch (e) {
                showFailedAlert(e.message);
            }
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

function exportDoc() {
    if (!tree.length) return;
    const lines = [];
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            const prefix = n.checked ? '- [x] ' : '- ';
            lines.push('  '.repeat(depth) + prefix + (n.content || ''));
            if (n.note) lines.push('  '.repeat(depth) + '  > ' + n.note);
            if (Array.isArray(n.children)) walk(n.children, depth + 1);
        }
    };
    walk(tree, 0);
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(store.selectedNode?.name || 'dokumen').replace(/[^\w.-]+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    showSuccess('Dokumen diekspor sebagai Markdown.');
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
        chip.textContent = `${tag} ${count}`;
        chip.addEventListener('click', () => {
            tagFilter = tagFilter === tag ? null : tag;
            renderTags();
            render();
        });
        els.tags.append(chip);
    });
}

function countDescendants(node) {
    let n = 0;
    const walk = (children) => {
        for (const c of children) {
            n++;
            if (Array.isArray(c.children) && c.children.length) walk(c.children);
        }
    };
    if (Array.isArray(node.children)) walk(node.children);
    return n;
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
    updateZoomBar();
    saveUiState();
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
    try {
        await api.post(`/documents/${docId}/items/${id}/sort`, { order });
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function toggleCheckChildren(id, checked) {
    recordUndo();
    try {
        await api.post(`/documents/${docId}/items/${id}/toggle-check-children`, { checked });
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
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
    try {
        await api.post(`/documents/${docId}/items/${id}/move-document`, { target_document_id: targetDocId });
        showSuccess('Item dipindahkan');
        await loadTree();
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
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

async function createFromSnapshot(snap, parentId, position) {
    const payload = {
        parent_id: parentId || null,
        position,
        content: snap.content || '',
        note: snap.note || '',
        checked: !!snap.checked,
        heading: snap.heading || 0,
        color: snap.color || null,
        bullet: snap.bullet || 'bullet',
    };
    const res = await api.post(`/documents/${docId}/items`, payload);
    const newId = res.data.id;
    if (Array.isArray(snap.children)) {
        for (let i = 0; i < snap.children.length; i++) {
            await createFromSnapshot(snap.children[i], newId, i);
        }
    }
    return newId;
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
        parentId = rec.node.parent_id || null;
        pos = siblingPosition(rec.node) + 1;
    }
    let firstId = null;
    let lastId = null;
    for (let i = 0; i < snapshots.length; i++) {
        const newId = await createFromSnapshot(snapshots[i], parentId, pos + i);
        if (!firstId) firstId = newId;
        lastId = newId;
    }
    await loadItems();
    selectItem(lastId || firstId);
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
                { label: 'Title (A to Z)', action: () => sortChildren(node.id, 'name_asc') },
                { label: 'Title (Z to A)', action: () => sortChildren(node.id, 'name_desc') },
                { label: 'Date (new to old)', action: () => sortChildren(node.id, 'created_desc') },
                { label: 'Date (old to new)', action: () => sortChildren(node.id, 'created_asc') },
                { label: 'Unchecked first', action: () => sortChildren(node.id, 'checked') },
            ],
        });
    }
    items.push({ label: 'Search and replace…', action: () => openSearch() });
    items.push('sep');

    if (siblingPosition(node) > 0) {
        items.push({ label: 'Indent', shortcut: 'Tab', action: () => indent(node.id) });
    }
    if (node.parent_id) {
        items.push({ label: 'Unindent', shortcut: 'Shift+Tab', action: () => unindent(node.id) });
    }
    items.push({ label: 'Move to…', shortcut: 'Ctrl+Shift+M', action: () => openMovePicker(node.id) });
    items.push({
        label: 'Insert template…',
        children: Object.keys(TEMPLATES).map((name) => ({
            label: name,
            action: () => insertTemplate(node.id, name),
        })),
    });
    items.push('sep');

    // Checkbox — tampilkan sesuai state saat ini (persis Dynalist)
    const isChecklist = (node.bullet || 'bullet') === 'checklist';
    if (!isChecklist) {
        items.push({ label: 'Add checkbox', shortcut: 'Ctrl+Shift+C', action: () => setBullet(node.id, 'checklist') });
    } else {
        items.push({ label: 'Remove checkbox', shortcut: 'Ctrl+Shift+C', action: () => setBullet(node.id, 'bullet') });
        items.push({
            label: node.checked ? 'Uncheck' : 'Check off',
            shortcut: 'Ctrl+Enter',
            action: () => toggleCheck(node.id),
        });
    }
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
    items.push({ label: 'Show all references', action: () => openBacklinks(node.id) });
    items.push({ label: 'Export…', action: () => exportDoc() });
    const docNode = store.selectedNode;
    if (docNode) {
        items.push({
            label: docNode.is_inbox ? 'Remove as inbox' : 'Set as inbox',
            action: async () => {
                const isInbox = !docNode.is_inbox;
                try {
                    await api.post(`/documents/${docId}/set-inbox`, { is_inbox });
                    docNode.is_inbox = isInbox;
                    toast(isInbox ? 'Dokumen dijadikan Inbox' : 'Inbox dihapus dari dokumen');
                    await loadTree();
                } catch (err) {
                    toast(err.message, 'error');
                }
            },
        });
    }
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

    const headings = [['None', 0], ['Heading 1', 1], ['Heading 2', 2], ['Heading 3', 3]];
    headings.forEach(([label, h]) => {
        items.push({
            label: (node.heading || 0) === h ? `✓ ${label}` : label,
            action: () => setHeading(node.id, h),
        });
    });
    items.push('sep');

    const colors = [
        ['None', ''],
        ['Red', '#dc2626'],
        ['Orange', '#ea580c'],
        ['Amber', '#d97706'],
        ['Green', '#16a34a'],
        ['Blue', '#2563eb'],
        ['Purple', '#7c3aed'],
        ['Gray', '#6b7280'],
    ];
    colors.forEach(([label, c]) => {
        items.push({
            label: (node.color || null) === (c || null) ? `✓ ${label}` : label,
            swatch: c,
            action: () => setColor(node.id, c || null),
        });
    });
    items.push('sep');

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
    const nodes = TEMPLATES[name];
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

function openItemSharing() {
    const docNode = store.selectedNode && store.selectedNode.id === docId
        ? store.selectedNode
        : { id: docId, name: els.title.value || 'Tanpa judul' };
    import('./context-menu').then((m) => m.openShareDialog(docNode));
}

async function openBacklinks(id) {
    const rec = rows.get(id);
    if (!rec) return;
    Swal.fire({
        title: 'Backlinks',
        html: '<div class="text-left"><p id="bl-body" class="text-[13px] text-[#8a857e]">Memuat…</p></div>',
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: async () => {
            const body = document.getElementById('bl-body');
            try {
                const res = await api.get(`/items/${id}/backlinks`);
                const data = res.data || [];
                if (!data.length) {
                    body.innerHTML = 'Tidak ada item lain yang menautkan ke item ini.';
                    return;
                }
                body.removeAttribute('id');
                body.className = 'space-y-1';
                data.forEach((b) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-black/[0.05]';
                    btn.innerHTML = `<span class="truncate font-medium text-[#5a5650]">${esc(b.label || b.content)}</span>
                        <span class="ml-auto shrink-0 text-[11px] text-[#b5b0a9]">${esc(b.document_name)}</span>`;
                    btn.addEventListener('click', async () => {
                        Swal.close();
                        const node = highlightDocument(b.document_id);
                        if (!node) store.select(b.document_id, { id: b.document_id, type: 'document', name: b.document_name });
                        await openDocument(b.document_id);
                        zoomToItem(b.id);
                    });
                    body.append(btn);
                });
            } catch (e) {
                body.innerHTML = `<span class="text-red-600">${esc(e.message)}</span>`;
            }
        },
    });
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
    try {
        await api.patch(`/documents/${docId}/items/${id}`, { heading });
        rec.node.heading = heading;
        render();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function setColor(id, color) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    try {
        await api.patch(`/documents/${docId}/items/${id}`, { color });
        rec.node.color = color;
        render();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function setBullet(id, bullet) {
    const rec = rows.get(id);
    if (!rec) return;
    recordUndo();
    try {
        await api.patch(`/documents/${docId}/items/${id}`, { bullet });
        rec.node.bullet = bullet;
        render();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

function toggleBulletType(id, type) {
    const rec = rows.get(id);
    if (!rec) return;
    const cur = rec.node.bullet || 'bullet';
    setBullet(id, cur === type ? 'bullet' : type);
}

async function setBulletChildren(id, bullet) {
    const children = flat.filter((f) => f.node.parent_id === id).map((f) => f.node);
    if (!children.length) return;
    recordUndo();
    try {
        await Promise.all(children.map((c) => api.patch(`/documents/${docId}/items/${c.id}`, { bullet })));
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
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
    updateNodeToolbar();
    const rec = rows.get(id);
    if (rec) {
        rec.row.scrollIntoView({ block: 'nearest' });
        rec.row.focus({ preventScroll: true });
    }
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
    updateNodeToolbar();
    rec.text.contentEditable = 'true';
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
    if (sel && !sel.isCollapsed && rec.text.contains(sel.anchorNode)) return;
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
    rec.text.contentEditable = 'false';
    const value = contentFromElement(rec.text);
    if (value === (rec.node.content || '')) {
        updateNodeToolbar();
        return false;
    }
    const previous = rec.node.content || '';
    recordUndo();
    rec.node.content = value;
    try {
        await api.patch(`/documents/${docId}/items/${id}`, { content: value });
        rec.text.innerHTML = contentHtml(value);
        wireInlineImages(rec.text, id);
        updateNodeToolbar();
        return true;
    } catch (e) {
        rec.node.content = previous;
        rec.text.innerHTML = contentHtml(previous);
        showFailedAlert(e.message);
        updateNodeToolbar();
        return false;
    }
}

function cancelEdit(id) {
    const rec = rows.get(id);
    if (!rec) return;
    editing = false;
    acHide();
    rec.text.contentEditable = 'false';
    rec.text.innerHTML = contentHtml(rec.node.content || '');
    wireInlineImages(rec.text, id);
    updateNodeToolbar();
}

function hasTextSelectionInside(id) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    const text = rows.get(id)?.text;
    return !!text && text.contains(sel.anchorNode);
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
    if (e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'enter' && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            insertLineBreak(rows.get(id)?.text);
        } else if (key === 'enter') {
            e.preventDefault();
            e.stopPropagation();
            // Ctrl+Enter = toggle check, tapi hanya jika item adalah checklist
            const rec = rows.get(id);
            if (rec && (rec.node.bullet || 'bullet') === 'checklist') {
                commitEdit(id).then(() => toggleCheck(id));
            }
        } else if (key === 'c' && !e.shiftKey) {
            if (hasTextSelectionInside(id)) return;
            e.preventDefault();
            e.stopPropagation();
            commitEdit(id).then(() => copyItems());
        } else if (key === 'x' && !e.shiftKey) {
            if (hasTextSelectionInside(id)) return;
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
            wrapInline(rows.get(id)?.text, '*', '*');
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
            commitEdit(id).then(() => cycleColor(id));
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
    await commitEdit(id);
    const rec = rows.get(id);
    if (!rec) return;
    await createItemAt(rec.node.parent_id || null, siblingPosition(rec.node) + 1);
}

async function enterCreateSiblingAbove(id) {
    await commitEdit(id);
    const rec = rows.get(id);
    if (!rec) return;
    await createItemAt(rec.node.parent_id || null, Math.max(0, siblingPosition(rec.node)));
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
    await commitEdit(id);
    const node = rec.node;
    const pos = siblingPosition(node) + 1;
    try {
        const data = await api.post(`/documents/${docId}/items`, { parent_id: node.parent_id || null, position: pos, content: tail, bullet: defaultBullet });
        const newId = data.data.id;
        const newNode = { ...data.data, children: [] };
        insertNodeLocally(node.parent_id || null, pos, newNode);
        if (!collapsed.has(id)) {
            const children = flat.filter((f) => f.node.parent_id === node.id).map((f) => f.node);
            for (let i = 0; i < children.length; i++) {
                await api.post(`/documents/${docId}/items/${children[i].id}/move`, { parent_id: newId, position: i });
            }
            const oldParent = findNodeInTree(id);
            if (oldParent) {
                newNode.children = oldParent.children || [];
                oldParent.children = [];
                newNode.children.forEach((c) => (c.parent_id = newId));
            }
        }
        buildFlat();
        applyZoomFilter();
        render();
        selectItem(newId);
        startEdit(newId);
    } catch (e) {
        showFailedAlert(e.message);
    }
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
    try {
        await api.patch(`/documents/${docId}/items/${keepId}`, { content: merged });
        const start = childCount(keepId);
        for (let i = 0; i < children.length; i++) {
            await api.post(`/documents/${docId}/items/${children[i].id}/move`, { parent_id: keepId, position: start + i });
        }
        await api.delete(`/documents/${docId}/items/${dropId}`);
        await loadItems();
        selectItem(keepId);
        startEdit(keepId);
        if (junction != null) setCaretAtOffset(rows.get(keepId)?.text, junction);
    } catch (e) {
        showFailedAlert(e.message);
    }
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
    if ((rec.node.bullet || 'bullet') !== 'checklist') return; // hanya checklist
    recordUndo();
    const next = !rec.node.checked;
    rec.node.checked = next;
    try {
        await api.patch(`/documents/${docId}/items/${id}`, { checked: next });
        render();
    } catch (e) {
        rec.node.checked = !next;
        render();
        showFailedAlert(e.message);
    }
}

async function indent(id) {
    if (!id) return toast('Pilih item dulu', 'error');
    recordUndo();
    try {
        await api.post(`/documents/${docId}/items/${id}/indent`);
        await loadItems();
        selectItem(id);
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function unindent(id) {
    if (!id) return toast('Pilih item dulu', 'error');
    recordUndo();
    try {
        await api.post(`/documents/${docId}/items/${id}/unindent`);
        await loadItems();
        selectItem(id);
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function deleteItem(id) {
    if (!id) return toast('Pilih item dulu', 'error');
    recordUndo();
    const idx = flat.findIndex((f) => f.node.id === id);
    try {
        await api.delete(`/documents/${docId}/items/${id}`);
        removeNodeLocally(id);
        collapsed.delete(id);
        multi.delete(id);
        if (selectedId === id) selectedId = null;
        buildFlat();
        applyZoomFilter();
        render();
        const target = flat[Math.max(0, Math.min(idx, flat.length - 1))];
        if (target) selectItem(target.node.id);
        toast('Item dihapus. Pulihkan dari Trash.');
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function deleteChecked() {
    const checkedIds = flat.filter((f) => f.node.checked).map((f) => f.node.id);
    if (!checkedIds.length) return toast('Tidak ada item yang dicentang', 'error');
    recordUndo();
    try {
        await api.post(`/documents/${docId}/items-delete-checked`);
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
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function numberChildren() {
    const rec = selectedId && rows.get(selectedId);
    if (!rec) return toast('Pilih item dulu', 'error');
    const children = flat.filter((f) => f.node.parent_id === rec.node.id).map((f) => f.node);
    if (!children.length) return toast('Item ini tidak punya anak', 'error');
    recordUndo();
    try {
        await Promise.all(children.map((c) => api.patch(`/documents/${docId}/items/${c.id}`, { bullet: 'numbered' })));
        showSuccess('Anak dinomori');
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
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
    try {
        await Promise.all(children.map((c) => api.patch(`/documents/${docId}/items/${c.id}`, { bullet: 'bullet' })));
        showSuccess('Penomoran anak dihapus');
        await loadItems();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function move(dir) {
    if (!selectedId) return toast('Pilih item dulu', 'error');
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    recordUndo();
    const group = flat.filter((f) => (f.node.parent_id || null) === (node.parent_id || null)).map((f) => f.node);
    const i = group.findIndex((s) => s.id === node.id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= group.length) return toast('Posisi sudah di ujung');
    try {
        await api.post(`/documents/${docId}/items/${node.id}/move`, { parent_id: node.parent_id || null, position: j });
        await loadItems();
        selectItem(node.id);
    } catch (e) {
        showFailedAlert(e.message);
    }
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

async function createItemAt(parentId, position) {
    recordUndo();
    try {
        const data = await api.post(`/documents/${docId}/items`, {
            parent_id: parentId,
            ...(position != null ? { position } : {}),
            bullet: defaultBullet,
        });
        const node = { ...data.data, children: [] };
        insertNodeLocally(parentId, position, node);
        buildFlat();
        applyZoomFilter();
        render();
        selectItem(node.id);
        startEdit(node.id);
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function addItem() {
    let parentId = null;
    if (selectedId) {
        const rec = rows.get(selectedId);
        if (rec && rec.node.parent_id) parentId = rec.node.parent_id;
    }
    await createItemAt(parentId);
}

async function addSiblingBelow() {
    if (!selectedId) return addItem();
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    await createItemAt(node.parent_id || null, siblingPosition(node) + 1);
}

async function addChildItem() {
    if (!selectedId) return addItem();
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    await createItemAt(node.id, childCount(node.id));
}

async function addSiblingAbove() {
    if (!selectedId) return;
    const node = rows.get(selectedId)?.node;
    if (!node) return;
    await createItemAt(node.parent_id || null, Math.max(0, siblingPosition(node)));
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
    updateNodeToolbar();
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
    updateNodeToolbar();
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
            });
            if (Array.isArray(n.children) && n.children.length) walk(n.children, n.id);
        }
    };
    walk(tree, null);
    return items;
}

function recordUndo() {
    if (!docId) return;
    const snap = captureSnapshot();
    const last = undoStack[undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    undoStack.push(snap);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
}

async function restoreSnapshot(snap) {
    try {
        await api.post(`/documents/${docId}/items-restore`, { items: snap });
        await loadItems();
        updateUndoButtons();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function undo() {
    if (!docId || !undoStack.length) return;
    const snap = undoStack.pop();
    redoStack.push(captureSnapshot());
    await restoreSnapshot(snap);
}

async function redo() {
    if (!docId || !redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(captureSnapshot());
    await restoreSnapshot(snap);
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
    if (isBookmarked()) {
        const b = bookmarks.find((x) => x.target_type === 'document' && String(x.target.id) === String(docId));
        try {
            await api.delete(`/bookmarks/${b.id}`);
            showSuccess('Bookmark dihapus');
        } catch (e) {
            showFailedAlert(e.message);
            return;
        }
    } else {
        try {
            await api.post('/bookmarks', { target_type: 'document', target_id: docId });
            showSuccess('Dibookmark');
        } catch (e) {
            showFailedAlert(e.message);
            return;
        }
    }
    await loadBookmarkState();
}

function isItemBookmarked(id) {
    return bookmarks.some((b) => b.target_type === 'item' && b.target && String(b.target.id) === String(id));
}

async function toggleItemBookmark(id) {
    const existing = bookmarks.find((b) => b.target_type === 'item' && b.target && String(b.target.id) === String(id));
    try {
        if (existing) {
            await api.delete(`/bookmarks/${existing.id}`);
            showSuccess('Bookmark dihapus');
        } else {
            await api.post('/bookmarks', { target_type: 'item', target_id: id });
            showSuccess('Item dibookmark');
        }
        await loadBookmarkState();
        loadBookmarks();
    } catch (e) {
        showFailedAlert(e.message);
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
    openSr();
}

function openSr() {
    els.srModal.classList.remove('hidden');
    els.srFind.focus();
    els.srFind.select();
}

function closeSr() {
    els.srModal.classList.add('hidden');
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
    selectedId = null;
    editing = false;
    multi.clear();
    refreshHighlights();
    updateNodeToolbar();
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
    try {
        const data = await api.post(`/documents/${docId}/items/${id}/restore`);
        await loadTrash();
        closeTrash();
        await loadItems();
        if (flat.some((f) => f.node.id === id)) selectItem(id);
        showSuccess(data.message || 'Item dipulihkan', 'Dipulihkan');
    } catch (e) {
        showFailedAlert(e.message);
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
        await loadItems();
    } catch (e) {
        showSr(e.message);
    }
}

// ---- Wiring ----
function setShowCompleted(v) {
    showCompleted = v;
    savePrefs();
    render();
}

function setShowNotes(v) {
    showNotes = v;
    savePrefs();
    render();
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

function renderViewOptions() {
    const pop = document.getElementById('view-options');
    if (!pop) return;
    pop.querySelectorAll('.view-opt').forEach((b) => {
        const group = b.dataset.view;
        const val = b.dataset.val;
        let active = false;
        if (group === 'completed') active = (val === 'show') === showCompleted;
        else if (group === 'notes') active = (val === 'show') === showNotes;
        else if (group === 'theme') active = theme === val;
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

function hideNodeToolbar() {
    clearTimeout(ntHideTimer);
    if (editing) return;
    const nt = document.getElementById('node-toolbar');
    if (nt) nt.classList.add('hidden');
}

function updateNodeToolbar() {
    const nt = document.getElementById('node-toolbar');
    if (!nt) return;
    const rec = selectedId && rows.get(selectedId);
    if (!docId || multi.size || !rec || !rec.row.isConnected || !editing) {
        nt.classList.add('hidden');
        return;
    }
    nt.classList.remove('hidden');
    const r = rec.row.getBoundingClientRect();
    const m = nt.getBoundingClientRect();
    let left = r.left;
    if (left + m.width > window.innerWidth - 8) left = window.innerWidth - m.width - 8;
    let top = r.top - m.height - 6;
    if (top < 8) top = r.bottom + 6;
    nt.style.left = `${Math.max(8, left)}px`;
    nt.style.top = `${top}px`;
}

function wireToolbar() {
    els.bookmarkBtn.addEventListener('click', toggleBookmark);

    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);
    updateUndoButtons();

    const nt = document.getElementById('node-toolbar');
    if (nt) {
        nt.addEventListener('mouseenter', () => {
            clearTimeout(ntHideTimer);
            hoveredRowId = selectedId;
            updateNodeToolbar();
        });
        nt.addEventListener('mouseleave', () => {
            if (hoveredRowId === null) return;
            hoveredRowId = null;
            clearTimeout(ntHideTimer);
            ntHideTimer = setTimeout(hideNodeToolbar, 200);
        });
    }

    document.querySelectorAll('#doc-toolbar [data-act], #node-toolbar [data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const act = btn.dataset.act;
            if (act === 'add') addItem();
            else if (act === 'search') openSr();
            else if (act === 'view-options') toggleViewOptions(btn);
            else if (act === 'zoom-in') zoomInto(selectedId);
            else if (act === 'note') openNoteEditor(selectedId);
            else if (act === 'bold') applyFormat(selectedId, '**', '**');
            else if (act === 'italic') applyFormat(selectedId, '*', '*');
            else if (act === 'code') applyFormat(selectedId, '`', '`');
            else if (act === 'heading') toggleHeading(selectedId);
            else if (act === 'color') cycleColor(selectedId);
            else if (act === 'indent') indent(selectedId);
            else if (act === 'unindent') unindent(selectedId);
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
            else if (act === 'toggle-show-notes') setShowNotes(!showNotes);
            else if (act === 'toggle-theme') cycleTheme();
        });
    });

    const pop = document.getElementById('view-options');
    pop.querySelectorAll('.view-opt').forEach((b) => {
        b.addEventListener('click', () => {
            const group = b.dataset.view;
            const val = b.dataset.val;
            if (group === 'completed') setShowCompleted(val === 'show');
            else if (group === 'notes') setShowNotes(val === 'show');
            else if (group === 'theme') setTheme(val);
            else if (group === 'bullet') setDefaultBullet(val);
            closeViewOptions();
        });
    });

    document.addEventListener('click', (e) => {
        const pop = document.getElementById('view-options');
        if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && !e.target.closest('[data-act="view-options"]')) {
            pop.classList.add('hidden');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeViewOptions();
    });
    window.addEventListener('resize', () => {
        closeViewOptions();
        updateNodeToolbar();
    });
    if (els.view) els.view.addEventListener('scroll', updateNodeToolbar, { passive: true });
}

function wireOutline() {
    els.outline.addEventListener('paste', async (e) => {
        if (e.target.closest('.item-text')) return;
        const imgItem = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
        if (imgItem) {
            e.preventDefault();
            const file = imgItem.getAsFile();
            if (!file) return;
            const url = await uploadImage(file);
            if (!url) return;
            const parentId = selectedId || null;
            recordUndo();
            try {
                const data = await api.post(`/documents/${docId}/items`, { parent_id: parentId, content: `![](${url})` });
                await loadItems();
                selectItem(data.data.id);
                startEdit(data.data.id);
                placeCaretAfterImage(data.data.id);
            } catch (err) {
                showFailedAlert(err.message);
            }
            return;
        }
        const t = e.clipboardData.getData('text/plain');
        if (!t) return;
        e.preventDefault();
        let lines = t.split(/\r?\n/);
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        if (!lines.length) return;
        const selRec = selectedId ? rows.get(selectedId) : null;
        const parentId = selRec ? (selRec.node.parent_id || null) : null;
        const basePos = selRec ? siblingPosition(selRec.node) + 1 : 0;
        recordUndo();
        try {
            let position = basePos;
            let firstId = null;
            for (const line of lines) {
                const data = await api.post(`/documents/${docId}/items`, { parent_id: parentId, position, content: line });
                if (!firstId) firstId = data.data.id;
                position++;
            }
            await loadItems();
            if (firstId) selectItem(firstId);
        } catch (err) {
            showFailedAlert(err.message);
        }
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
                updateNodeToolbar();
            } else if (key === 'a') {
                e.preventDefault();
                selectUpward();
            } else if (key === 'enter' && e.shiftKey) {
                e.preventDefault();
                addSiblingAbove();
            } else if (key === 'enter') {
                e.preventDefault();
                toggleCheck(selectedId);
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
                if (selectedId) applyFormat(selectedId, '*', '*');
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
                zoomInto(selectedId);
            } else if (e.code === 'BracketLeft') {
                e.preventDefault();
                zoomOutLevel();
            } else if (e.shiftKey && key === 'h') {
                e.preventDefault();
                toggleHeading(selectedId);
            } else if (e.shiftKey && key === 'l') {
                e.preventDefault();
                cycleColor(selectedId);
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
                e.preventDefault();
                if (itemClipboard) pasteAsSibling(selectedId);
            } else if (key === 'v' && !e.shiftKey) {
                e.preventDefault();
                if (itemClipboard) pasteAsChild(selectedId);
            } else if (key === 'd' && e.shiftKey) {
                e.preventDefault();
                duplicateItem(selectedId);
            } else if (key === 'n' && e.altKey && !e.shiftKey) {
                e.preventDefault();
                if (selectedId) toggleItemBookmark(selectedId);
            } else if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                redo();
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
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addSiblingBelow();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) unindent(selectedId);
            else indent(selectedId);
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
                // bukan checklist = tidak ada efek (persis Dynalist)
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (multi.size) clearMulti();
        }
    });
}

function wireTitle() {
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
    els.zoomBar = createZoomBar();
    els.container.insertBefore(els.zoomBar, els.outline);
    updateZoomBar();
    wireToolbar();
    wireTrash();
    wireOutline();
    wireTitle();
    wireSr();

    document.addEventListener('dyn:select', () => {
        const node = store.selectedNode;
        if (!node) return;
        if (node.type === 'folder') showFolder(node);
        else openDocument(node.id);
    });
}

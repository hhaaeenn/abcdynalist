import { api } from './api';
import { selectDocument, highlightDocument } from './sidebar';
import { store } from './store';

let modal;
let input;
let resultsEl;
let emptyEl;
let items = [];
let activeIndex = -1;
let debounceTimer;
let currentMode = 'document';
let pickCallback = null;

const ICONS = {
    document: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    item: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="3"/></svg>',
};

function render() {
    resultsEl.querySelectorAll('.qf-row').forEach((n) => n.remove());
    emptyEl.textContent = '';
    emptyEl.classList.remove('hidden');

    if (items.length === 0) {
        emptyEl.textContent = 'Tidak ada hasil.';
        return;
    }

    emptyEl.classList.add('hidden');
    items.forEach((it, i) => {
        if (currentMode === 'move' && it.type !== 'document') return;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'qf-row w-full flex items-center gap-3 px-4 py-2 text-left text-[14px]';
        if (i === activeIndex) row.classList.add('qf-active');

        const ico = document.createElement('span');
        ico.className = it.type === 'folder' ? 'text-[#c07a12]' : 'text-[#8a857e]';
        ico.innerHTML = ICONS[it.type] || ICONS.item;

        const label = document.createElement('span');
        label.className = 'truncate';
        label.textContent = it.name || it.content || '(tanpa nama)';

        const hint = document.createElement('span');
        hint.className = 'ml-auto text-[11px] text-[#b5b0a9] shrink-0';
        if (it.type === 'item') hint.textContent = it.document_name || 'Item';
        else hint.textContent = currentMode === 'document' || currentMode === 'move'
            ? (it.type === 'folder' ? 'Folder' : 'Dokumen')
            : (it.document_name || '');

        row.append(ico, label, hint);
        row.addEventListener('click', () => jump(it));
        row.addEventListener('mousemove', () => setActive(i));
        resultsEl.append(row);
    });
}

function setActive(i) {
    activeIndex = i;
    render();
}

function scrollToActive() {
    const row = resultsEl.querySelectorAll('.qf-row')[activeIndex];
    if (row) row.scrollIntoView({ block: 'nearest' });
}

function jump(it) {
    if (currentMode === 'link') {
        window.dispatchEvent(new CustomEvent('dyn:link-picked', { detail: it }));
        close();
        return;
    }
    if (currentMode === 'move') {
        const cb = pickCallback;
        close();
        if (cb) cb(it);
        return;
    }
    if (currentMode === 'item') {
        import('./document').then(({ openDocument, zoomToItem }) => {
            const node = highlightDocument(it.document_id);
            if (!node) store.select(it.document_id, { id: it.document_id, type: 'document', name: it.document_name });
            openDocument(it.document_id).then(() => zoomToItem(it.id));
        });
        close();
        return;
    }
    if (it.type === 'item') {
        import('./document').then(({ openDocument, zoomToItem }) => {
            const node = highlightDocument(it.document_id);
            if (!node) store.select(it.document_id, { type: 'document', name: it.name, id: it.document_id });
            openDocument(it.document_id).then(() => zoomToItem(it.id));
        });
    } else {
        selectDocument({ type: it.type, id: it.id, name: it.name, parent_id: it.parent_id });
    }
    close();
}

async function runSearch(q) {
    if (!q.trim()) {
        items = [];
        activeIndex = -1;
        render();
        emptyEl.textContent = currentMode === 'document' || currentMode === 'move'
            ? 'Mulai mengetik untuk mencari dokumen Anda.'
            : 'Mulai mengetik untuk mencari item.';
        return;
    }
    const endpoint = currentMode === 'document'
        ? `/search?q=${encodeURIComponent(q.trim())}&include_items=true`
        : `/finder/items?q=${encodeURIComponent(q.trim())}`;
    try {
        const data = await api.get(endpoint);
        items = data.data || [];
        activeIndex = items.length ? 0 : -1;
        render();
    } catch {
        items = [];
        activeIndex = -1;
        render();
        emptyEl.textContent = 'Gagal mencari. Coba lagi.';
    }
}

export function open(mode = 'document', onPick = null) {
    currentMode = mode;
    pickCallback = onPick;
    modal.classList.remove('hidden');
    items = [];
    activeIndex = -1;
    input.value = '';
    input.placeholder = mode === 'link'
        ? 'Cari item untuk tautan internal…'
        : mode === 'item'
            ? 'Cari item…'
            : mode === 'move'
                ? 'Pilih dokumen tujuan…'
                : 'Cari dokumen, item, atau bookmark…';
    render();
    emptyEl.textContent = mode === 'document' || mode === 'move'
        ? 'Mulai mengetik untuk mencari dokumen Anda.'
        : 'Mulai mengetik untuk mencari item.';
    input.focus();
}

function close() {
    modal.classList.add('hidden');
    input.blur();
}

export function init() {
    modal = document.getElementById('quick-finder');
    input = document.getElementById('qf-input');
    resultsEl = document.getElementById('qf-results');
    emptyEl = document.getElementById('qf-empty');

    document.getElementById('quick-finder-btn').addEventListener('click', open);

    modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(input.value), 200);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length) setActive((activeIndex + 1) % items.length);
            scrollToActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length) setActive((activeIndex - 1 + items.length) % items.length);
            scrollToActive();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const it = items[activeIndex];
            if (it) jump(it);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    });
}

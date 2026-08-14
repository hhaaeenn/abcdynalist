import { api } from './api';
import { esc } from './alerts';
import { highlightDocument } from './sidebar';
import { store } from './store';

let panel;
let listEl;
let currentId = null;
let debounce;

export function open() {
    panel.classList.remove('hidden');
    if (currentId) load(currentId);
    else showEmpty();
}

export function close() {
    panel.classList.add('hidden');
}

export async function showForItem(id) {
    currentId = id;
    panel.classList.remove('hidden');
    load(id);
}

function showEmpty() {
    listEl.innerHTML = '<p class="px-3 py-6 text-center text-[13px] text-[#8a857e]">Pilih item untuk melihat referensinya.</p>';
}

async function load(id) {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
        if (currentId !== id) return;
        listEl.innerHTML = '<p class="px-3 py-6 text-center text-[13px] text-[#8a857e]">Memuat…</p>';
        try {
            const res = await api.get(`/items/${id}/backlinks`);
            if (currentId !== id) return;
            const data = res.data || [];
            if (!data.length) {
                listEl.innerHTML = '<p class="px-3 py-6 text-center text-[13px] text-[#8a857e]">Tidak ada item lain yang menautkan ke item ini.</p>';
                return;
            }
            listEl.innerHTML = '';
            data.forEach((b) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'w-full flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-black/5';
                const label = document.createElement('span');
                label.className = 'truncate font-medium text-[#5a5650]';
                label.textContent = b.label || b.content || '(tanpa label)';
                const sub = document.createElement('span');
                sub.className = 'truncate text-[11px] text-[#b5b0a9]';
                sub.textContent = b.document_name;
                btn.append(label, sub);
                btn.addEventListener('click', async () => {
                    const node = highlightDocument(b.document_id);
                    if (!node) store.select(b.document_id, { id: b.document_id, type: 'document', name: b.document_name });
                    const { openDocument, zoomToItem } = await import('./document');
                    await openDocument(b.document_id);
                    zoomToItem(b.id);
                });
                listEl.append(btn);
            });
        } catch (e) {
            listEl.innerHTML = `<p class="px-3 py-6 text-center text-[13px] text-red-600">${esc(e.message)}</p>`;
        }
    }, 80);
}

export function init() {
    panel = document.getElementById('backlinks-panel');
    listEl = document.getElementById('backlinks-list');
    document.getElementById('backlinks-close').addEventListener('click', close);
    document.getElementById('rail-toggle-backlinks').addEventListener('click', () => {
        if (panel.classList.contains('hidden')) open();
        else close();
    });
    document.addEventListener('dyn:item-selected', (e) => {
        if (panel.classList.contains('hidden')) {
            currentId = e.detail;
            return;
        }
        showForItem(e.detail);
    });
}

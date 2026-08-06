import { api } from './api';
import { selectDocument } from './sidebar';

const ICONS = {
    document: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    item: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="3"/></svg>',
};

let panel;
let listEl;

export async function loadBookmarks() {
    listEl.innerHTML = '<p class="px-1 py-4 text-center text-[13px] text-[#8a857e]">Memuat…</p>';
    try {
        const data = await api.get('/bookmarks');
        const items = data.data || [];
        listEl.innerHTML = '';

        if (items.length === 0) {
            listEl.innerHTML = '<p class="px-1 py-4 text-center text-[13px] text-[#8a857e]">Belum ada bookmark.</p>';
            return;
        }

        items.forEach((bm) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'bookmark-row w-full flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-[13px] text-left';

            const line = document.createElement('span');
            line.className = 'flex items-center gap-2.5 w-full';

            const ico = document.createElement('span');
            ico.className = bm.type === 'folder' ? 'text-[#c07a12]' : 'text-[#8a857e]';
            ico.innerHTML = ICONS[bm.type] || ICONS.item;

            const label = document.createElement('span');
            label.className = 'truncate flex-1';
            if (bm.type === 'item') label.textContent = bm.content || '(tanpa nama)';
            else label.textContent = bm.is_inbox ? 'Inbox' : bm.name || '(tanpa nama)';

            line.append(ico, label);
            row.append(line);

            if (bm.type === 'item') {
                const sub = document.createElement('span');
                sub.className = 'text-[11px] text-[#b5b0a9] truncate pl-6';
                sub.textContent = bm.document_name || '';
                row.append(sub);
            }

            row.addEventListener('click', () => {
                if (bm.type === 'item') {
                    import('./document').then(({ openDocument, zoomToItem }) => {
                        openDocument(bm.document_id).then(() => zoomToItem(bm.target_id));
                    });
                } else {
                    selectDocument({ type: bm.type, id: bm.target_id, name: bm.name });
                }
                close();
            });
            listEl.append(row);
        });
    } catch {
        listEl.innerHTML = '<p class="px-1 py-4 text-center text-[13px] text-red-600">Gagal memuat bookmark.</p>';
    }
}

export function open() {
    panel.classList.remove('hidden');
    loadBookmarks();
}

export function close() {
    panel.classList.add('hidden');
}

export function init() {
    panel = document.getElementById('bookmarks-panel');
    listEl = document.getElementById('bookmarks-list');

    document.getElementById('rail-toggle-bookmarks').addEventListener('click', () => {
        if (panel.classList.contains('hidden')) open();
        else close();
    });
    document.getElementById('bookmarks-close').addEventListener('click', close);
}

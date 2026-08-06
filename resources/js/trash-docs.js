import { api } from './api';
import { toast } from './ui';
import { loadTree } from './sidebar';

let panel;
let listEl;

const ICON_DOC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const ICON_FOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
const ICON_RESTORE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>';
const ICON_FOREVER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

export async function loadTrashDocs() {
    listEl.innerHTML = '<p class="px-1 py-4 text-center text-[13px] text-[#8a857e]">Memuat…</p>';
    try {
        const data = await api.get('/documents/trashed');
        const docs = data.data || [];
        listEl.innerHTML = '';

        if (docs.length === 0) {
            listEl.innerHTML = '<p class="px-1 py-4 text-center text-[13px] text-[#8a857e]">Trash kosong.</p>';
            return;
        }

        docs.forEach((doc) => {
            const row = document.createElement('div');
            row.className = 'trash-doc-row flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-left';

            const ico = document.createElement('span');
            ico.className = doc.type === 'folder' ? 'text-[#c07a12]' : 'text-[#8a857e]';
            ico.innerHTML = doc.type === 'folder' ? ICON_FOLDER : ICON_DOC;

            const label = document.createElement('span');
            label.className = 'truncate flex-1';
            label.textContent = doc.name || '(tanpa nama)';

            const restore = document.createElement('button');
            restore.type = 'button';
            restore.title = 'Pulihkan';
            restore.className = 'w-6 h-6 flex items-center justify-center rounded text-[#5a5650] hover:bg-black/10 hover:text-[#c07a12] transition';
            restore.innerHTML = ICON_RESTORE;
            restore.addEventListener('click', () => restoreDoc(doc));

            const forever = document.createElement('button');
            forever.type = 'button';
            forever.title = 'Hapus permanen';
            forever.className = 'w-6 h-6 flex items-center justify-center rounded text-[#5a5650] hover:bg-black/10 hover:text-red-600 transition';
            forever.innerHTML = ICON_FOREVER;
            forever.addEventListener('click', () => deleteForever(doc));

            row.append(ico, label, restore, forever);
            listEl.append(row);
        });
    } catch {
        listEl.innerHTML = '<p class="px-1 py-4 text-center text-[13px] text-red-600">Gagal memuat trash.</p>';
    }
}

async function restoreDoc(doc) {
    try {
        await api.post(`/documents/${doc.id}/restore`);
        toast('Dokumen dipulihkan.');
        await Promise.all([loadTree(), loadTrashDocs()]);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteForever(doc) {
    if (!window.confirm(`Hapus permanen "${doc.name || '(tanpa nama)'}"?`)) return;
    try {
        await api.delete(`/documents/${doc.id}/force`);
        toast('Dokumen dihapus permanen.');
        await loadTrashDocs();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function emptyTrash() {
    const docs = (await api.get('/documents/trashed')).data || [];
    if (!docs.length) return;
    if (!window.confirm('Kosongkan Trash? Semua dokumen terhapus permanen.')) return;
    try {
        for (const doc of docs) {
            await api.delete(`/documents/${doc.id}/force`);
        }
        toast('Trash dikosongkan.');
        await loadTrashDocs();
    } catch (err) {
        toast(err.message, 'error');
    }
}

export function open() {
    panel.classList.remove('hidden');
    loadTrashDocs();
}

export function close() {
    panel.classList.add('hidden');
}

export function init() {
    panel = document.getElementById('trash-panel');
    listEl = document.getElementById('trash-docs-list');

    document.getElementById('rail-toggle-trash').addEventListener('click', () => {
        if (panel.classList.contains('hidden')) open();
        else close();
    });
    document.getElementById('trash-docs-close').addEventListener('click', close);
    document.getElementById('trash-docs-empty').addEventListener('click', emptyTrash);
}

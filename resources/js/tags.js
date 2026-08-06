import { api } from './api';
import { esc, showFailedAlert } from './alerts';
import { openDocument, zoomToItem } from './document';
import { highlightDocument } from './sidebar';

const CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-green-600"><path d="M20 6 9 17l-5-5"/></svg>';

let listEl;
let resultsEl;
let resultsTitle;
let resultsList;

export async function loadTags() {
    if (!listEl) return;
    try {
        const data = await api.get('/tags');
        listEl.innerHTML = '';
        const tags = data.data || [];
        if (!tags.length) {
            const p = document.createElement('p');
            p.className = 'px-1 py-1 text-[13px] text-[#8a857e]';
            p.textContent = 'Belum ada tag.';
            listEl.append(p);
            return;
        }
        tags.forEach(({ tag, count }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-row w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-[13px] text-[#8a857e]';
            btn.innerHTML = `<span class="flex items-center gap-1.5 min-w-0"><span class="text-[#c07a12] shrink-0">#</span><span class="truncate">${esc(tag)}</span></span><span class="tag-count shrink-0">${count}</span>`;
            btn.addEventListener('click', () => showTag(tag));
            listEl.append(btn);
        });
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function showTag(tag) {
    try {
        const data = await api.get(`/tags/${encodeURIComponent(tag)}`);
        const items = data.data || [];
        resultsTitle.textContent = tag;
        resultsList.innerHTML = '';
        if (!items.length) {
            resultsList.innerHTML = '<p class="py-6 text-center text-sm text-[#b5b0a9]">Tidak ada item.</p>';
        } else {
            items.forEach((it) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tag-item w-full flex items-start gap-2.5 text-left px-2 py-2 rounded-lg';
                const bullet = it.checked
                    ? CHECK
                    : '<span class="inline-block w-[7px] h-[7px] rounded-full bg-current mt-[6px]"></span>';
                btn.innerHTML = `
                    <span class="shrink-0 mt-[3px] text-[#8a857e]">${bullet}</span>
                    <span class="flex-1 min-w-0">
                        <span class="block text-[14px] ${it.checked ? 'line-through text-[#b5b0a9]' : 'text-[#24221f]'} break-words">${esc(it.content)}</span>
                        <span class="block text-[11px] text-[#8a857e]">${esc(it.document_name)}</span>
                    </span>`;
                btn.addEventListener('click', () => openItem(it.document_id, it.id));
                resultsList.append(btn);
            });
        }
        document.getElementById('doc-container').classList.add('hidden');
        document.getElementById('main-empty').classList.add('hidden');
        document.getElementById('doc-toolbar').classList.add('hidden');
        resultsEl.classList.remove('hidden');
    } catch (e) {
        showFailedAlert(e.message);
    }
}

async function openItem(documentId, itemId) {
    resultsEl.classList.add('hidden');
    highlightDocument(documentId);
    await openDocument(documentId);
    await zoomToItem(itemId);
}

export function init() {
    listEl = document.getElementById('tags-list');
    resultsEl = document.getElementById('tag-results');
    resultsTitle = document.getElementById('tag-results-title');
    resultsList = document.getElementById('tag-results-list');
    document.getElementById('tag-results-close').addEventListener('click', () => resultsEl.classList.add('hidden'));
    document.addEventListener('dyn:select', () => {
        resultsEl.classList.add('hidden');
        loadTags();
    });
    document.addEventListener('dyn:tag-click', (e) => {
        if (e.detail && e.detail.tag) showTag(e.detail.tag);
    });
    loadTags();
}

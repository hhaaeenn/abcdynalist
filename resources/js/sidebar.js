import { api, clearAuth } from './api';
import { toast } from './ui';
import { showFailedAlert } from './alerts';
import { store } from './store';
import { moveItemsToDocument, resetView } from './document';
import { pushDocUndo, popDocUndo, docUndoIsNewest } from './ops';

const ICONS = {
    document: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="m9 18 6-6-6-6"/></svg>',
    chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="m6 9 6 6 6-6"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="w-3 h-3"><path d="M5 12h14M12 5v14"/></svg>',
};

let treeEl;
let selectedRow = null;
const nodeMap = new Map();
let dragDocId = null;
let treeDrop = null;

export function findNode(id) {
    return nodeMap.get(id);
}

export function findInbox() {
    for (const node of nodeMap.values()) {
        if (node.type === 'document' && node.is_inbox) return node;
    }
    return null;
}

function icon(name, color = 'text-[#8a857e]') {
    const span = document.createElement('span');
    span.className = `shrink-0 ${color}`;
    span.innerHTML = ICONS[name];
    return span;
}

function buildRow(node, depth) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isFolder = node.type === 'folder';
    const isCollapsed = store.collapsed.has(node.id);

    const row = document.createElement('div');
    row.className = 'tree-row group flex items-center gap-1 rounded-lg py-[3px] px-1 cursor-pointer select-none transition-colors duration-100';
    row.tabIndex = -1;
    row.dataset.id = node.id;
    nodeMap.set(node.id, node);
    if (store.selectedId === node.id) row.classList.add('tree-selected');

    const spacer = document.createElement('span');
    spacer.className = 'shrink-0';
    spacer.style.width = `${depth * 14}px`;

    const chevron = document.createElement('button');
    chevron.className = 'chev w-3.5 h-3.5 flex items-center justify-center text-[#b5b0a9] hover:text-[#5a5650] rounded-sm';
    if (hasChildren) {
        chevron.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;
    } else {
        chevron.style.visibility = 'hidden';
    }

    const label = document.createElement('span');
    label.className = 'tree-label text-[13px] truncate flex-1';
    if (node.is_inbox) label.textContent = 'Inbox';
    else label.textContent = node.name || '(tanpa nama)';

    const addBtn = document.createElement('button');
    addBtn.className = 'row-add opacity-0 group-hover:opacity-100 shrink-0 w-4 h-4 flex items-center justify-center rounded text-[#b5b0a9] hover:text-[#c07a12] transition';
    addBtn.innerHTML = ICONS.plus;
    addBtn.title = 'Tambah item di folder ini';
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddMenu(e.clientX, e.clientY, node.id);
    });

    row.append(spacer, chevron, icon(isFolder ? 'folder' : 'document', isFolder ? 'text-[#c07a12]' : 'text-[#8a857e]'));
    if (node.type === 'document' && node.color) {
        const dot = document.createElement('span');
        dot.className = 'shrink-0 w-2 h-2 rounded-full border border-black/20';
        dot.style.background = node.color;
        dot.title = 'Dokumen berlabel warna';
        row.append(dot);
    }
    row.append(label);
    if (isFolder) row.append(addBtn);

    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
        if (e.target.closest('.chev') || e.target.closest('.row-add')) {
            e.preventDefault();
            return;
        }
        if (node.is_inbox) {
            e.preventDefault();
            return;
        }
        dragDocId = node.id;
        row.classList.add('opacity-40');
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
        dragDocId = null;
        treeDrop = null;
        clearTreeDrop();
        row.classList.remove('opacity-40');
    });
    row.addEventListener('dragover', (e) => {
        const itemDrag = window.__abclistItemDrag;
        if (itemDrag && node.type === 'document') {
            if (itemDrag.docId === node.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            clearTreeDrop();
            row.classList.add('tree-drop-child');
            treeDrop = { type: 'child', target: node };
            return;
        }
        if (!dragDocId || dragDocId === node.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const y = e.clientY - rect.top;
        clearTreeDrop();
        if (y < rect.height * 0.3) {
            row.classList.add('tree-drop-before');
            treeDrop = { type: 'before', target: node };
        } else if (y > rect.height * 0.7) {
            row.classList.add('tree-drop-after');
            treeDrop = { type: 'after', target: node };
        } else if (node.type === 'folder') {
            row.classList.add('tree-drop-child');
            treeDrop = { type: 'child', target: node };
        }
    });
    row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const a = treeDrop;
        clearTreeDrop();
        const itemDrag = window.__abclistItemDrag;
        if (itemDrag && a && a.target.type === 'document' && itemDrag.docId !== a.target.id) {
            moveItemsToDocument(itemDrag.ids, a.target.id);
            return;
        }
        if (a && dragDocId) moveDoc(dragDocId, a);
    });

    const children = document.createElement('div');
    children.className = 'tree-children';
    if (hasChildren) {
        children.append(...node.children.map((c) => buildRow(c, depth + 1)));
        if (isCollapsed) children.classList.add('hidden');
    }

    row.addEventListener('click', (e) => {
        if (e.target.closest('.chev') || e.target.closest('.row-add')) return;
        selectDocument(node);
        row.focus({ preventScroll: true });
    });

    chevron.addEventListener('click', () => {
        toggleFolder(node.id, children, chevron);
    });

    const wrap = document.createElement('div');
    wrap.append(row, children);
    return wrap;
}

function toggleFolder(id, childrenEl, chevronEl) {
    if (store.collapsed.has(id)) {
        store.collapsed.delete(id);
        childrenEl.classList.remove('hidden');
        chevronEl.innerHTML = ICONS.chevronDown;
    } else {
        store.collapsed.add(id);
        childrenEl.classList.add('hidden');
        chevronEl.innerHTML = ICONS.chevronRight;
    }
}

function clearTreeDrop() {
    document.querySelectorAll('.tree-row.tree-drop-before, .tree-row.tree-drop-after, .tree-row.tree-drop-child')
        .forEach((r) => r.classList.remove('tree-drop-before', 'tree-drop-after', 'tree-drop-child'));
}

function docSiblings(node) {
    const parentId = node.parent_id || null;
    if (!parentId) {
        return (store.tree || []).filter((d) => (d.parent_id || null) === null);
    }
    const parent = nodeMap.get(parentId);
    return parent && Array.isArray(parent.children) ? parent.children : [];
}

async function moveDoc(id, action) {
    const node = nodeMap.get(id);
    if (!node) return;
    const target = action.target;
    let parentId = null;
    let position = 0;

    if (action.type === 'child') {
        if (!Array.isArray(target.children)) return;
        parentId = target.id;
        position = target.children.length;
    } else {
        parentId = target.parent_id || null;
        const sibs = docSiblings(target);
        const i = sibs.findIndex((s) => s.id === target.id);
        position = Math.max(0, i + (action.type === 'after' ? 1 : 0));
    }

    if (parentId === (node.parent_id || null) && action.type !== 'child') {
        const cur = docSiblings(node).findIndex((s) => s.id === node.id);
        if (cur < position) position -= 1;
    }

    try {
        await api.post(`/documents/${id}/move`, { parent_id: parentId, position });
        await loadTree();
    } catch (e) {
        showFailedAlert(e.message);
    }
}

export function highlightDocument(id) {
    const node = nodeMap.get(id);
    if (!node) return null;
    store.selectedId = id;
    store.selectedNode = node;
    document.querySelectorAll('.tree-row').forEach((r) => {
        r.classList.toggle('tree-selected', r.dataset.id === id);
    });
    return node;
}

export function renderTree(nodes) {
    nodeMap.clear();
    treeEl.innerHTML = '';
    treeEl.append(...nodes.map((n) => buildRow(n, 0)));
}

export async function loadTree() {
    try {
        const data = await api.get('/documents');
        store.tree = data.data || [];
        renderTree(store.tree);
    } catch (err) {
        toast(err.message, 'error');
    }
}

export function selectDocument(node) {
    store.select(node.id, node);
    document.querySelectorAll('.tree-row').forEach((r) => {
        r.classList.toggle('tree-selected', r.dataset.id === node.id);
    });
    const row = document.querySelector(`.tree-row[data-id="${node.id}"]`);
    if (row) row.focus({ preventScroll: true });
}

let rowAddMenu = null;

function showAddMenu(x, y, parentId) {
    hideRowAddMenu();
    const menu = document.createElement('div');
    menu.className = 'fixed z-50 row-add-menu rounded-lg shadow-lg border border-[#e5e2dd] py-1 min-w-[140px]';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.innerHTML = `
        <button data-action="document" class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#24221f] hover:bg-[#f5f3ef]">
            <span class="shrink-0 text-[#8a857e]">${ICONS.document}</span> New Document
        </button>
        <button data-action="folder" class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#24221f] hover:bg-[#f5f3ef]">
            <span class="shrink-0 text-[#c07a12]">${ICONS.folder}</span> New Folder
        </button>
    `;
    menu.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            hideRowAddMenu();
            startCreate(btn.dataset.action, parentId);
        });
    });
    document.body.appendChild(menu);
    rowAddMenu = menu;

    const close = (ev) => {
        if (!menu.contains(ev.target)) {
            hideRowAddMenu();
            document.removeEventListener('click', close);
        }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
}

function hideRowAddMenu() {
    if (rowAddMenu) { rowAddMenu.remove(); rowAddMenu = null; }
}

export function startCreate(type, parentId) {
    addMenu.classList.add('hidden');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = type === 'folder' ? 'Nama folder…' : 'Nama dokumen…';
    input.value = type === 'folder' ? 'New folder' : 'New document';
    input.className = 'tree-rename-input w-full rounded-md border border-[#d9a441] bg-white px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#d9a441]/30 mb-1';
    treeEl.prepend(input);
    input.focus();
    input.select();

    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        input.remove();
    };

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            finish();
            const name = input.value.trim() || (type === 'folder' ? 'New folder' : 'New document');
            try {
                const forced = parentId !== undefined;
                const pid = forced ? parentId : null;
                const data = await api.post('/documents', { type, name, parent_id: pid });
                if (pid) store.collapsed.delete(pid);
                if (data.data) pushDocUndo(data.data.id);
                await loadTree();
                if (type === 'document' && data.data) selectDocument(data.data);
                else if (type === 'folder') toast(`Folder "${name}" dibuat`);
            } catch (err) {
                toast(err.message, 'error');
            }
        } else if (e.key === 'Escape') {
            finish();
        }
    });
    input.addEventListener('blur', finish);
}

export async function undoLastDocCreation() {
    const op = popDocUndo();
    if (!op) return;
    try {
        await api.delete(`/documents/${op.id}`);
        localStorage.removeItem(`abclist_ui_${op.id}`);
        if (store.selectedId === op.id) {
            store.selectedId = null;
            store.selectedNode = null;
            resetView();
        }
        await loadTree();
        toast('Pembuatan dokumen dibatalkan');
    } catch (err) {
        pushDocUndo(op.id);
        toast(err.message, 'error');
    }
}

let addMenu;

export function init() {
    treeEl = document.getElementById('doc-tree');
    addMenu = document.getElementById('add-menu');
    const addBtn = document.getElementById('add-btn');
    const opmlInput = document.getElementById('opml-input');

    treeEl.addEventListener('dragover', (e) => {
        if (!dragDocId && !window.__abclistItemDrag) return;
        const r = treeEl.getBoundingClientRect();
        const edge = 48;
        if (e.clientY < r.top + edge) treeEl.scrollTop = Math.max(0, treeEl.scrollTop - 14);
        else if (e.clientY > r.bottom - edge) treeEl.scrollTop += 14;
    });

    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMenu.classList.toggle('hidden');
    });

    addMenu.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'document' || action === 'folder') {
                startCreate(action);
            } else if (action === 'opml') {
                opmlInput.click();
            }
        });
    });

    opmlInput.addEventListener('change', () => {
        const file = opmlInput.files[0];
        opmlInput.value = '';
        if (!file) return;
        importOpml(file);
    });

    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        const mod = e.ctrlKey || e.metaKey;
        if (!mod || e.shiftKey || e.altKey) return;
        if (e.key.toLowerCase() !== 'z') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName || ''))) return;
        if (docUndoIsNewest()) {
            e.preventDefault();
            undoLastDocCreation();
        }
    });

    document.addEventListener('click', (e) => {
        if (!addMenu.classList.contains('hidden') && !addMenu.contains(e.target) && e.target !== addBtn) {
            addMenu.classList.add('hidden');
        }
    });

    document.getElementById('collapse-pane').addEventListener('click', togglePane);
    document.getElementById('rail-toggle-pane').addEventListener('click', togglePane);

    const sortBtn = document.getElementById('sort-docs-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', async () => {
            try {
                await api.post('/documents/sort-all');
                toast('Dokumen diurutkan berdasarkan abjad.');
                await loadTree();
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }

    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await api.post('/auth/logout');
        } catch {
            // ignore, tetap logout lokal
        }
        clearAuth();
        window.location.href = '/login';
    });

    wireTreeKeyboard();

    loadTree();
}

function visibleTreeRows() {
    return [...treeEl.querySelectorAll('.tree-row')].filter((r) => {
        const ch = r.closest('.tree-children');
        return !ch || !ch.classList.contains('hidden');
    });
}

function navHighlightRow(rows, i) {
    const r = rows[Math.max(0, Math.min(i, rows.length - 1))];
    if (!r) return;
    const node = nodeMap.get(r.dataset.id);
    if (!node) return;
    if (highlightDocument(node.id)) {
        r.focus({ preventScroll: true });
        r.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
}

function toggleRowFolder(row, node) {
    const children = row.nextElementSibling;
    const chevron = row.querySelector('.chev');
    if (children && chevron) toggleFolder(node.id, children, chevron);
}

function wireTreeKeyboard() {
    treeEl.addEventListener('keydown', (e) => {
        if (e.target.closest('input, textarea')) return;
        const rows = visibleTreeRows();
        if (!rows.length) return;

        const activeRow = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.tree-row') : null;
        let base = rows.findIndex((r) => r === activeRow);
        if (base < 0) base = rows.findIndex((r) => r.dataset.id === store.selectedId);
        if (base < 0) base = 0;

        const node = nodeMap.get(rows[base].dataset.id);
        if (!node) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (base < rows.length - 1) navHighlightRow(rows, base + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (base > 0) navHighlightRow(rows, base - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (node.type === 'folder' && store.collapsed.has(node.id)) toggleRowFolder(rows[base], node);
            selectDocument(node);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (node.type === 'folder') {
                if (store.collapsed.has(node.id)) {
                    toggleRowFolder(rows[base], node);
                    if (base < rows.length - 1) navHighlightRow(rows, base + 1);
                } else if (base < rows.length - 1) {
                    navHighlightRow(rows, base + 1);
                }
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (node.type === 'folder' && !store.collapsed.has(node.id) && rows[base].nextElementSibling?.querySelector('.tree-row')) {
                toggleRowFolder(rows[base], node);
            } else {
                const parent = rows.slice(0, base).reverse().find((r) => r.dataset.id === (node.parent_id || null));
                if (parent) navHighlightRow(rows, rows.indexOf(parent));
            }
        } else if (e.key === 'Home') {
            e.preventDefault();
            navHighlightRow(rows, 0);
        } else if (e.key === 'End') {
            e.preventDefault();
            navHighlightRow(rows, rows.length - 1);
        }
    });
}

export function togglePane() {
    document.getElementById('file-pane').classList.toggle('hidden');
}

function parseOutline(o) {
    return {
        text: o.getAttribute('text') || o.getAttribute('title') || '',
        note: o.getAttribute('_note') || '',
        checked: o.getAttribute('_done') === 'true' || o.getAttribute('checked') === 'true',
        children: [...o.children].filter((c) => c.tagName === 'outline').map(parseOutline),
    };
}

async function createItemTree(documentId, roots) {
    const queue = roots.map((node) => ({ node, parentId: null }));
    let count = 0;
    while (queue.length) {
        const level = queue.splice(0);
        const created = await Promise.all(level.map(async ({ node, parentId }) => {
            const res = await api.post(`/documents/${documentId}/items`, {
                parent_id: parentId,
                content: node.text,
                note: node.note || '',
                checked: node.checked,
            });
            return { node, id: res.data.id };
        }));
        count += created.length;
        created.forEach(({ node, id }) => {
            node.children.forEach((child) => queue.push({ node: child, parentId: id }));
        });
    }
    return count;
}

async function importOpml(file) {
    let text;
    try {
        text = await file.text();
    } catch {
        toast('Gagal membaca file OPML.', 'error');
        return;
    }

    const parsed = new DOMParser().parseFromString(text, 'text/xml');
    if (parsed.querySelector('parsererror')) {
        toast('File OPML tidak valid.', 'error');
        return;
    }

    const roots = [...parsed.querySelectorAll('outline')]
        .filter((o) => o.parentElement.tagName === 'body')
        .map(parseOutline);

    if (!roots.length) {
        toast('Tidak ada outline di file OPML.', 'error');
        return;
    }

    const baseName = (file.name || 'Imported').replace(/\.opml$/i, '') || 'Imported';
    const docName = roots[0].text || baseName;

    let documentId;
    try {
        const res = await api.post('/documents', { type: 'document', name: docName });
        documentId = res.data.id;
        const count = await createItemTree(documentId, roots);
        toast(`Impor OPML selesai: ${count} item.`);
    } catch (e) {
        showFailedAlert(e.message);
        return;
    }

    loadTree();
    const { openDocument } = await import('./document');
    await openDocument(documentId);
}

import { api } from './api';
import { toast } from './ui';
import { store } from './store';
import { esc, showPopupWithAction } from './alerts';
import { selectDocument, loadTree, startCreate, findNode } from './sidebar';
import { resetView, getHiddenIds } from './document';
import Swal from 'sweetalert2';

const ICONS = {
    document: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    share: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>',
    rename: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
    trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

const DOC_COLORS = [
    ['Red', '#dc2626'],
    ['Orange', '#ea580c'],
    ['Yellow', '#d97706'],
    ['Green', '#16a34a'],
    ['Blue', '#2563eb'],
    ['Purple', '#7c3aed'],
    ['Gray', '#6b7280'],
];

let menuEl;

function close() {
    menuEl.classList.add('hidden');
    menuEl.innerHTML = '';
}

function openMenu(x, y, items) {
    menuEl.innerHTML = '';

    for (const item of items) {
        if (item === 'sep') {
            const sep = document.createElement('div');
            sep.className = 'h-px bg-black/10 my-1';
            menuEl.append(sep);
            continue;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ctx-item w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-[13px] ${
            item.danger ? 'danger text-red-600' : 'text-[#24221f]'
        }`;

        if (item.icon) {
            const ico = document.createElement('span');
            ico.className = `ctx-ico ${item.iconColor || 'text-[#8a857e]'}`;
            ico.innerHTML = ICONS[item.icon];
            btn.append(ico);
        }

        if (item.swatch !== undefined) {
            const dot = document.createElement('span');
            dot.className = 'inline-block w-3 h-3 rounded-full border border-black/20 shrink-0';
            dot.style.background = item.swatch || 'transparent';
            btn.append(dot);
        }

        const label = document.createElement('span');
        label.className = 'flex-1';
        label.textContent = item.label;
        btn.append(label);

        if (item.children && item.children.length) {
            const arrow = document.createElement('span');
            arrow.className = 'text-[#b5b0a9] text-[11px]';
            arrow.textContent = '›';
            btn.append(arrow);
            btn.addEventListener('click', () => {
                const rect = menuEl.getBoundingClientRect();
                openMenu(rect.left + rect.width - 6, rect.top, item.children);
            });
        } else {
            btn.addEventListener('click', () => {
                close();
                item.action();
            });
        }
        menuEl.append(btn);
    }

    menuEl.classList.remove('hidden');

    const rect = menuEl.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menuEl.style.left = `${Math.min(x, Math.max(8, maxX))}px`;
    menuEl.style.top = `${Math.min(y, Math.max(8, maxY))}px`;
}

function baseItems() {
    return [
        { label: 'New document', icon: 'document', action: () => startCreate('document', null) },
        { label: 'New folder', icon: 'folder', action: () => startCreate('folder', null) },
        { label: 'Import…', icon: 'document', action: () => importDocument() },
    ];
}

function itemsForNode(node) {
    const parentId = node.type === 'folder' ? node.id : node.parent_id || null;

    return [
        { label: 'New document', icon: 'document', action: () => startCreate('document', parentId) },
        { label: 'New folder', icon: 'folder', action: () => startCreate('folder', parentId) },
        'sep',
        ...(node.type === 'folder'
            ? [{
                label: 'Sort children',
                children: [
                    { label: 'Name (A to Z)', action: () => sortFolderChildren(node, 'name_asc') },
                    { label: 'Name (Z to A)', action: () => sortFolderChildren(node, 'name_desc') },
                    { label: 'Created (new to old)', action: () => sortFolderChildren(node, 'created_desc') },
                    { label: 'Created (old to new)', action: () => sortFolderChildren(node, 'created_asc') },
                ],
            }]
            : []),
        ...(node.type === 'document'
            ? [{ label: node.is_inbox ? 'Remove as inbox' : 'Set as inbox', action: () => setInbox(node) }]
            : []),
        ...(node.type === 'document'
            ? [{
                label: 'Color label',
                children: [
                    { label: (node.color || null) === null ? '✓ Clear color' : 'Clear color', action: () => setDocColor(node, null) },
                    ...DOC_COLORS.map(([label, c]) => ({
                        label: (node.color || null) === c ? `✓ ${label}` : label,
                        swatch: c,
                        action: () => setDocColor(node, c),
                    })),
                ],
            }]
            : []),
        { label: 'Share…', icon: 'share', action: () => openShareDialog(node) },
        ...(node.type === 'document'
            ? [
                { label: 'Publish…', icon: 'share', action: () => openPublishDialog(node) },
                { label: 'Export…', icon: 'share', action: () => openExportDialog(node) },
                { label: 'Print…', icon: 'share', action: () => window.print() },
            ]
            : []),
        'sep',
        { label: 'Rename', icon: 'rename', action: () => renameNode(node) },
        ...(node.type === 'document'
            ? [{ label: 'Make a copy', icon: 'document', action: () => copyNode(node) }]
            : []),
        { label: 'Delete', icon: 'trash', action: () => deleteNode(node), danger: true },
    ];
}

async function copyNode(node) {
    try {
        const res = await api.post(`/documents/${node.id}/copy`);
        toast(`Salinan "${node.name || '(tanpa nama)'}" dibuat.`);
        await loadTree();
        const copy = findNode(res.data.id);
        if (copy) selectDocument(copy);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function sortFolderChildren(node, order) {
    try {
        await api.post(`/documents/${node.id}/sort`, { order });
        toast('Folder diurutkan.');
        await loadTree();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function setInbox(node) {
    const isInbox = !node.is_inbox;
    try {
        await api.post(`/documents/${node.id}/set-inbox`, { is_inbox });
        node.is_inbox = isInbox;
        toast(isInbox ? 'Dokumen dijadikan Inbox' : 'Inbox dihapus dari dokumen');
        await loadTree();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function setDocColor(node, color) {
    try {
        await api.patch(`/documents/${node.id}`, { color });
        node.color = color;
        await loadTree();
        toast(color ? 'Warna label dokumen diperbarui.' : 'Warna label dokumen dihapus.');
    } catch (err) {
        toast(err.message, 'error');
    }
}

let shareNode = null;

function shareHtml(d) {
    if (d.enabled) {
        return `
            <p class="mb-2 text-[13px]">Siapa pun yang memiliki tautan ini dapat melihat dokumen Anda (mode baca saja).</p>
            <div class="flex items-center gap-2">
                <input type="text" readonly value="${esc(d.share_url)}" class="flex-1 min-w-0 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[12.5px] bg-[#faf9f8]">
                <button type="button" id="share-copy" class="shrink-0 rounded-md bg-[#c07a12] text-white px-3 py-1.5 text-[12.5px]">Salin</button>
            </div>
            <p class="mt-3 text-[12.5px] text-[#8a857e]">Tautan aktif. Mematikan berbagi akan membuat tautan ini tidak lagi bisa diakses.</p>
            <button type="button" id="share-off" class="mt-2 w-full rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-[12.5px] hover:bg-red-50">Matikan berbagi</button>`;
    }
    return `
        <p class="mb-2 text-[13px]">Bagikan tautan baca-saja untuk dokumen <b>${esc(shareNode.name || '(tanpa nama)')}</b>.</p>
        <button type="button" id="share-on" class="w-full rounded-md bg-[#c07a12] text-white px-3 py-1.5 text-[12.5px]">Aktifkan berbagi</button>`;
}

async function renderShareBody() {
    const body = document.getElementById('share-body');
    if (!body) return;
    try {
        const d = (await api.get(`/documents/${shareNode.id}/share`)).data;
        body.innerHTML = shareHtml(d);
        wireShareButtons();
    } catch (e) {
        body.innerHTML = `<p class="text-[13px] text-red-600">${esc(e.message)}</p>`;
    }
}

function wireShareButtons() {
    const on = document.getElementById('share-on');
    const off = document.getElementById('share-off');
    const copy = document.getElementById('share-copy');
    if (on) {
        on.addEventListener('click', async () => {
            try {
                const res = await api.post(`/documents/${shareNode.id}/share`, { enabled: true });
                shareNode.share_url = res.data.share_url;
                renderShareBody();
                toast('Tautan berbagi diaktifkan.');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }
    if (off) {
        off.addEventListener('click', async () => {
            try {
                await api.post(`/documents/${shareNode.id}/share`, { enabled: false });
                renderShareBody();
                toast('Berbagi dimatikan.');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }
    if (copy) {
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(document.getElementById('share-copy').previousElementSibling.value);
                toast('Tautan disalin ke clipboard.');
            } catch {
                toast('Gagal menyalin tautan.', 'error');
            }
        });
    }
}

export function openShareDialog(node) {
    shareNode = node;
    Swal.fire({
        title: 'Bagikan dokumen',
        html: '<div id="share-body" class="text-left">Memuat…</div>',
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: renderShareBody,
    });
}

let publishNode = null;

function publishHtml(d) {
    if (d.enabled) {
        return `
            <p class="mb-2 text-[13px]">Publikasikan dokumen <b>${esc(publishNode.name || '(tanpa nama)')}</b> ke halaman publik.</p>
            <div class="flex items-center gap-2">
                <input type="text" readonly value="${esc(d.publish_url)}" class="flex-1 min-w-0 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[12.5px] bg-[#faf9f8]">
                <button type="button" id="pub-copy" class="shrink-0 rounded-md bg-[#c07a12] text-white px-3 py-1.5 text-[12.5px]">Salin</button>
            </div>
            <p class="mt-2 text-[12.5px] text-[#8a857e]">${d.password ? 'Saat ini dilindungi kata sandi.' : 'Saat ini tanpa kata sandi.'}</p>
            <div class="flex items-center gap-2 mt-2">
                <input type="text" id="pub-pass" placeholder="Kata sandi baru (kosongkan = tanpa sandi)" class="flex-1 min-w-0 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[12.5px]">
                <button type="button" id="pub-save-pass" class="shrink-0 rounded-md border border-[#c07a12] text-[#c07a12] px-3 py-1.5 text-[12.5px] hover:bg-[#c07a12]/10">Simpan</button>
            </div>
            <button type="button" id="pub-off" class="mt-3 w-full rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-[12.5px] hover:bg-red-50">Matikan publikasi</button>`;
    }
    return `
        <p class="mb-2 text-[13px]">Publikasikan dokumen <b>${esc(publishNode.name || '(tanpa nama)')}</b> sebagai halaman web publik.</p>
        <input type="text" id="pub-pass" placeholder="Kata sandi (opsional)" class="w-full rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[12.5px] mb-2">
        <button type="button" id="pub-on" class="w-full rounded-md bg-[#c07a12] text-white px-3 py-1.5 text-[12.5px]">Aktifkan publikasi</button>`;
}

async function renderPublishBody() {
    const body = document.getElementById('pub-body');
    if (!body) return;
    try {
        const d = (await api.get(`/documents/${publishNode.id}/publish`)).data;
        body.innerHTML = publishHtml(d);
        wirePublishButtons();
    } catch (e) {
        body.innerHTML = `<p class="text-[13px] text-red-600">${esc(e.message)}</p>`;
    }
}

function wirePublishButtons() {
    const on = document.getElementById('pub-on');
    const off = document.getElementById('pub-off');
    const savePass = document.getElementById('pub-save-pass');
    const copy = document.getElementById('pub-copy');
    const passVal = () => document.getElementById('pub-pass')?.value ?? '';

    if (on) {
        on.addEventListener('click', async () => {
            try {
                await api.post(`/documents/${publishNode.id}/publish`, { enabled: true, password: passVal() });
                renderPublishBody();
                toast('Dokumen dipublikasikan.');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }
    if (off) {
        off.addEventListener('click', async () => {
            try {
                await api.post(`/documents/${publishNode.id}/publish`, { enabled: false });
                renderPublishBody();
                toast('Publikasi dimatikan.');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }
    if (savePass) {
        savePass.addEventListener('click', async () => {
            try {
                await api.post(`/documents/${publishNode.id}/publish`, { enabled: true, password: passVal() });
                renderPublishBody();
                toast('Kata sandi publikasi disimpan.');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }
    if (copy) {
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(document.getElementById('pub-copy').previousElementSibling.value);
                toast('Tautan disalin ke clipboard.');
            } catch {
                toast('Gagal menyalin tautan.', 'error');
            }
        });
    }
}

function openPublishDialog(node) {
    publishNode = node;
    Swal.fire({
        title: 'Publikasikan',
        html: '<div id="pub-body" class="text-left">Memuat…</div>',
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: renderPublishBody,
    });
}

function openExportDialog(node) {
    Swal.fire({
        title: 'Export dokumen',
        html: `<div class="text-left">
            <p class="mb-2 text-[13px]">Export <b>${esc(node.name || '(tanpa nama)')}</b> — salin konten di bawah atau unduh sebagai file.</p>
            <div class="flex items-center gap-2">
                <select id="export-format" class="flex-1 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[13px] bg-white">
                    <option value="markdown">Markdown (.md)</option>
                    <option value="opml">OPML (.opml)</option>
                    <option value="json">JSON (.json)</option>
                </select>
                <select id="export-indent" class="flex-1 rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[13px] bg-white">
                    <option value="spaces">Indent: 2 spasi</option>
                    <option value="asterisks">Bullet: tanda bintang</option>
                    <option value="dashes">Bullet: tanda strip</option>
                    <option value="none">Tanpa indent</option>
                </select>
            </div>
            <label class="flex items-center gap-2 mt-2 text-[13px] text-[#3b3936]">
                <input id="export-visible" type="checkbox" class="rounded accent-[#d9a441]">
                Export hanya item yang terlihat (dari tampilan saat ini)
            </label>
            <textarea id="export-body" readonly class="mt-2 w-full h-52 resize-y rounded-md border border-[#e0dcd5] px-2 py-1.5 text-[12px] font-mono bg-[#faf9f8] text-[#3b3936]"></textarea>
            <div class="flex items-center gap-2 mt-2">
                <button id="export-copy" type="button" class="rounded-lg bg-[#7b61ff] px-3 py-1.5 text-[13px] text-white hover:bg-[#6a4fef]">Salin ke clipboard</button>
                <button id="export-download" type="button" class="rounded-lg border border-[#e0dcd5] px-3 py-1.5 text-[13px] text-[#3b3936] hover:bg-[#f4f2ee]">Unduh file</button>
            </div>
        </div>`,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: async () => {
            const fmt = document.getElementById('export-format');
            const indent = document.getElementById('export-indent');
            const visible = document.getElementById('export-visible');
            const body = document.getElementById('export-body');
            const load = async () => {
                try {
                    const params = new URLSearchParams({ format: fmt.value, indent: indent.value });
                    if (visible.checked) params.set('hidden', JSON.stringify(getHiddenIds()));
                    const res = await api.get(`/documents/${node.id}/export?${params}`);
                    body.value = res.data.content;
                    body.dataset.filename = res.data.filename;
                    return res.data.filename;
                } catch (e) {
                    body.value = e.message;
                    return null;
                }
            };
            const download = () => {
                const name = body.dataset.filename || `${node.name || 'document'}.${fmt.value}`;
                const blob = new Blob([body.value], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast(`Dokumen diexport sebagai ${name}.`);
            };
            fmt.addEventListener('change', load);
            indent.addEventListener('change', load);
            visible.addEventListener('change', load);
            document.getElementById('export-copy').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(body.value);
                    toast('Konten export disalin ke clipboard.');
                } catch {
                    toast('Gagal menyalin ke clipboard.', 'error');
                }
            });
            document.getElementById('export-download').addEventListener('click', download);
            await load();
        },
    });
}

function importDocument() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,.opml,.xml,.json';
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        let format;
        if (ext === 'json') {
            format = 'json';
        } else if (ext === 'opml' || ext === 'xml') {
            format = 'opml';
        } else {
            format = 'markdown';
        }
        try {
            const content = await file.text();
            const res = await api.post('/documents/import', { format, content });
            toast(`Dokumen "${res.data.name}" berhasil diimpor.`);
            await loadTree();
            const node = findNode(res.data.id);
            if (node) selectDocument(node);
        } catch (e) {
            toast(e.message, 'error');
        }
    });
    input.click();
}

async function deleteNode(node) {
    if (node.is_inbox) return toast('Inbox tidak bisa dihapus');
    showPopupWithAction({
        title: 'Apakah Anda Yakin?',
        subtitle: `Menghapus <b>"${esc(node.name || '(tanpa nama)')}"</b>?<br>Semua isinya akan ikut terhapus.`,
        icon: 'warning',
        method: 'DELETE',
        path: `/documents/${node.id}`,
        onDone: async () => {
            localStorage.removeItem(`abclist_ui_${node.id}`);
            if (store.selectedId === node.id) {
                store.selectedId = null;
                store.selectedNode = null;
                resetView();
            }
            await loadTree();
            toast('Dokumen dihapus. Pulihkan dari Trash dokumen.');
        },
    });
}

function renameNode(node) {
    if (node.is_inbox) return toast('Inbox tidak bisa diubah namanya');
    const row = document.querySelector(`.tree-row[data-id="${node.id}"]`);
    if (!row) return;
    const label = row.querySelector('.tree-label');
    if (!label) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.name || '';
    input.className = 'tree-rename-input tree-label w-full text-[13px] rounded border border-[#d9a441] px-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#d9a441]/30';
    label.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        input.replaceWith(label);
    };

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            finish();
            if (!name || name === (node.name || '')) return;
            try {
                await api.patch(`/documents/${node.id}`, { name });
                node.name = name;
                await loadTree();
            } catch (err) {
                toast(err.message, 'error');
            }
        } else if (e.key === 'Escape') {
            finish();
        }
    });
    input.addEventListener('blur', finish);
}

function onContext(e) {
    e.preventDefault();

    const row = e.target.closest('.tree-row');
    let items;
    if (row) {
        const node = findNode(row.dataset.id);
        if (node) {
            selectDocument(node);
            items = itemsForNode(node);
        } else {
            items = baseItems();
        }
    } else {
        items = baseItems();
    }

    openMenu(e.clientX, e.clientY, items);
}

export function openMenuAt(x, y, items) {
    openMenu(x, y, items);
}

export function openDocMenuAt(x, y, node) {
    openMenu(x, y, node ? itemsForNode(node) : baseItems());
}

export function init() {
    menuEl = document.getElementById('ctx-menu');

    const pane = document.getElementById('file-pane');
    pane.addEventListener('contextmenu', onContext);

    document.addEventListener('click', () => close());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', () => close());
    window.addEventListener('blur', () => close());
}

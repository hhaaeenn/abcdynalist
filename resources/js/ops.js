// Ledger undo bersama: operasi pembuatan dokumen/folder di sidebar vs undo item dokumen.
// Dipakai untuk memutuskan mana yang lebih baru saat Ctrl+Z ditekan.
let docOps = [];
let lastItemOpTs = 0;

export function pushDocUndo(id) {
    docOps.push({ id, ts: Date.now() });
}

export function latestDocUndo() {
    return docOps.length ? docOps[docOps.length - 1] : null;
}

export function popDocUndo() {
    return docOps.pop() || null;
}

export function markItemOp() {
    lastItemOpTs = Date.now();
}

export function docUndoIsNewest() {
    const d = latestDocUndo();
    return !!(d && d.ts >= lastItemOpTs);
}

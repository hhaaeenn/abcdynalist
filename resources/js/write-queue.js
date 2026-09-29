import { api, requestRaw, beaconWrite, getToken, awaitTempId, registerPendingItem, unregisterPendingItem } from './api.js';

/**
 * Coalescing write queue for document items.
 *
 * Why this exists: the editor used to fire one HTTP request per item per event. Typing
 * then deleting raced each other, a multi-select tab fanned out N parallel requests, and
 * a large document exhausted the Mongo connection pool so most writes silently failed.
 *
 * Everything funnels through here instead:
 *   - patches for the same item collapse into a single entry (many keystrokes = 1 request)
 *   - all patches across items ship in one items-batch call
 *   - structural ops (indent/unindent) ship in one call per kind
 *   - deletes are sequenced *after* the patches for the same item, so a late patch can
 *     never race a removal and surface a 404 at the user
 *   - at most one flush is in flight, so there is no request pile-up
 */

const BATCH_LIMIT = 200;
const DEBOUNCE_MS = 400;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/** documentId => queued state */
const queues = new Map();

function emptyState() {
    return {
        patches: new Map(), // itemId => patch object (merged, last write wins)
        deleted: new Set(), // itemIds queued for deletion
        structural: new Map(), // op => Set(itemId)
        moves: new Map(), // itemId => { parent_id, position }
        timer: null,
        inFlight: null,
        dirty: false,
        destroyed: false,
    };
}

function stateFor(documentId) {
    if (!queues.has(documentId)) {
        queues.set(documentId, emptyState());
        attachUnloadFlush();
    }
    return queues.get(documentId);
}

function scheduleFlush(documentId) {
    const s = queues.get(documentId);
    if (!s || s.destroyed) return;

    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
        s.timer = null;
        flush(documentId);
    }, DEBOUNCE_MS);
}

let unloadBound = false;

function attachUnloadFlush() {
    if (unloadBound || typeof window === 'undefined') return;
    unloadBound = true;

    const handler = () => {
        for (const id of queues.keys()) {
            flushOnUnload(id);
        }
    };

    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handler();
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queue a partial update for one item. Repeated calls merge, so only the final field
 * values are ever sent.
 */
export function queuePatch(documentId, itemId, patch) {
    const s = stateFor(documentId);

    // A queued delete always wins over a queued patch for the same item.
    if (s.deleted.has(itemId)) return;

    const existing = s.patches.get(itemId);
    if (existing) {
        Object.assign(existing, patch);
    } else {
        s.patches.set(itemId, { ...patch });
    }

    scheduleFlush(documentId);
}

/**
 * Queue updates for many items at once (bulk complete, bulk bullet change, ...).
 *
 * @param {Iterable<[string, object]>} entries item id => patch
 */
export function queuePatches(documentId, entries) {
    const list = [...entries];
    if (!list.length) return;

    const s = stateFor(documentId);
    for (const [itemId, patch] of list) {
        if (s.deleted.has(itemId)) continue;
        const existing = s.patches.get(itemId);
        if (existing) {
            Object.assign(existing, patch);
        } else {
            s.patches.set(itemId, { ...patch });
        }
    }

    scheduleFlush(documentId);
}

/**
 * Queue a structural operation for many items.
 *
 * @param {'indent'|'unindent'} op
 * @param {Iterable<string>} itemIds
 */
export function queueStructure(documentId, op, itemIds) {
    const ids = [...itemIds];
    if (!ids.length) return;

    const s = stateFor(documentId);
    if (!s.structural.has(op)) {
        s.structural.set(op, new Set());
    }
    const set = s.structural.get(op);
    for (const id of ids) {
        if (s.deleted.has(id)) continue;
        set.add(id);
    }

    scheduleFlush(documentId);
}

/**
 * Queue re-parenting / repositioning for many items in one request.
 *
 * @param {Iterable<{id: string, parent_id: string|null, position?: number|null}>} moves
 */
export function queueMoves(documentId, moves) {
    const list = [...moves];
    if (!list.length) return;

    const s = stateFor(documentId);
    for (const move of list) {
        if (s.deleted.has(move.id)) continue;
        s.moves.set(move.id, {
            parent_id: move.parent_id ?? null,
            position: move.position ?? null,
        });
    }

    scheduleFlush(documentId);
}

/**
 * Queue a deletion. Any pending patch for these ids is dropped immediately and later
 * patches are ignored, so an update is never sent for a removed item.
 */
export function queueDelete(documentId, itemIds) {
    const ids = [...new Set([...(Array.isArray(itemIds) ? itemIds : [itemIds])])];
    if (!ids.length) return;

    const s = stateFor(documentId);

    for (const id of ids) {
        s.patches.delete(id);
        s.moves.delete(id);
        s.deleted.add(id);
        for (const set of s.structural.values()) {
            set.delete(id);
        }
    }

    scheduleFlush(documentId);
}

/**
 * Drop queued work for ids without deleting them (e.g. a discarded optimistic item).
 */
export function dropPending(documentId, itemIds) {
    const s = queues.get(documentId);
    if (!s) return;
    for (const id of Array.isArray(itemIds) ? itemIds : [itemIds]) {
        s.patches.delete(id);
        s.deleted.delete(id);
        s.moves.delete(id);
        for (const set of s.structural.values()) {
            set.delete(id);
        }
    }
}

/** Send everything queued for a document right now. */
export function flushNow(documentId) {
    const s = queues.get(documentId);
    if (!s || s.destroyed) return Promise.resolve();
    if (s.timer) {
        clearTimeout(s.timer);
        s.timer = null;
    }
    return flush(documentId);
}

/** Await any in-flight flush; use before reloading the document from the server. */
export function whenSettled(documentId) {
    return flushNow(documentId);
}

export function hasPending(documentId) {
    const s = queues.get(documentId);
    if (!s) return false;
    return s.patches.size > 0 || s.deleted.size > 0 || s.structural.size > 0 || s.moves.size > 0;
}

/** Forget a document's queue, e.g. after switching documents. */
export function resetQueue(documentId) {
    const s = queues.get(documentId);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    s.patches.clear();
    s.deleted.clear();
    s.structural.clear();
    s.moves.clear();
    s.destroyed = true;
    queues.delete(documentId);
}

// ---------------------------------------------------------------------------
// Flushing
// ---------------------------------------------------------------------------

function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) {
        out.push(list.slice(i, i + size));
    }
    return out;
}

/**
 * Drain the queue into a list of tagged HTTP calls.
 *
 * Ordering is deliberate: patches first, then structural changes, then deletes. For any
 * given item that guarantees its update is applied before its removal, which is what stops
 * the "deleted but shows an error" race.
 */
function takeWork(documentId, s) {
    const patchEntries = [...s.patches.entries()];
    s.patches.clear();

    const deleteIds = [...s.deleted];
    s.deleted.clear();

    const structural = [...s.structural.entries()].map(([op, set]) => [op, [...set]]);
    s.structural.clear();

    const moves = [...s.moves.entries()].map(([id, m]) => ({ id, ...m }));
    s.moves.clear();

    const calls = [];

    for (const part of chunk(patchEntries, BATCH_LIMIT)) {
        calls.push({
            kind: 'patch',
            method: 'PATCH',
            path: `/documents/${documentId}/items-batch`,
            body: { items: part.map(([id, patch]) => ({ id, ...patch })) },
        });
    }

    for (const [op, ids] of structural) {
        for (const part of chunk(ids, BATCH_LIMIT)) {
            calls.push({
                kind: 'structure',
                op,
                method: 'POST',
                path: `/documents/${documentId}/items-${op}-batch`,
                body: { ids: part },
            });
        }
    }

    for (const part of chunk(moves, BATCH_LIMIT)) {
        calls.push({
            kind: 'move',
            method: 'POST',
            path: `/documents/${documentId}/items-move-batch`,
            body: { moves: part },
        });
    }

    for (const part of chunk(deleteIds, BATCH_LIMIT)) {
        calls.push({
            kind: 'delete',
            method: 'POST',
            path: `/documents/${documentId}/items-delete-batch`,
            body: { ids: part },
        });
    }

    return calls;
}

async function flush(documentId) {
    const s = queues.get(documentId);
    if (!s || s.destroyed) return;
    if (!hasPending(documentId)) return;

    // Only one flush may be in flight. Anything queued meanwhile is marked dirty and
    // picked up by the follow-up run, which pins request concurrency at 1.
    if (s.inFlight) {
        s.dirty = true;
        return s.inFlight;
    }

    const calls = takeWork(documentId, s);
    if (!calls.length) return;

    window.dispatchEvent(new CustomEvent('dyn:save-start'));

    s.inFlight = (async () => {
        let failure = null;

        for (const call of calls) {
            try {
                await send(call, 0);
            } catch (e) {
                // Put the work back before moving on, otherwise a single failed request
                // silently discards the user's edits.
                requeue(s, call);
                failure = failure || e;
            }
        }

        window.dispatchEvent(new CustomEvent('dyn:save-end'));
        s.inFlight = null;

        if (failure) {
            window.dispatchEvent(new CustomEvent('dyn:save-failed', { detail: failure }));
        }

        if (s.dirty) {
            s.dirty = false;
            await flush(documentId);
        }
    })();

    return s.inFlight;
}

function requeue(s, call) {
    if (call.kind === 'patch') {
        for (const row of call.body.items) {
            const { id, ...patch } = row;
            const existing = s.patches.get(id);
            if (existing) {
                Object.assign(existing, patch);
            } else {
                s.patches.set(id, patch);
            }
            s.deleted.delete(id);
        }
        return;
    }

    if (call.kind === 'delete') {
        for (const id of call.body.ids) {
            s.deleted.add(id);
        }
        return;
    }

    if (call.kind === 'structure') {
        if (!s.structural.has(call.op)) {
            s.structural.set(call.op, new Set());
        }
        const set = s.structural.get(call.op);
        for (const id of call.body.ids) {
            set.add(id);
        }
        return;
    }

    if (call.kind === 'move') {
        for (const move of call.body.moves) {
            s.moves.set(move.id, { parent_id: move.parent_id ?? null, position: move.position ?? null });
        }
    }
}

async function send(call, attempt) {
    try {
        return await requestRaw(call.path, { method: call.method, body: call.body });
    } catch (e) {
        const status = e && e.status;

        // 410 means the row was already deleted. The delete winning is the intended
        // outcome, so this is a success, not something to show the user.
        if (status === 410) return null;

        // A 4xx (other than 410) is a validation problem and will never pass on retry.
        const retryable = !status || status >= 500;
        if (!retryable || attempt >= MAX_RETRIES) {
            e.__reported = true;
            throw e;
        }

        await sleep(RETRY_BASE_MS * 2 ** attempt);
        return send(call, attempt + 1);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort final flush while the page is closing.
 *
 * A normal fetch is cancelled on unload, so these go out with `keepalive: true`. Only the
 * patch batch is sent this way; anything else is put back on the queue so the regular
 * flush still handles it.
 */
function flushOnUnload(documentId) {
    const s = queues.get(documentId);
    if (!s || s.destroyed) return;
    if (!hasPending(documentId)) return;
    if (!getToken()) return;

    const calls = takeWork(documentId, s);

    for (const call of calls) {
        if (call.kind === 'patch') {
            beaconWrite(call.path, call.body);
        } else {
            requeue(s, call);
        }
    }
}

export const writeQueue = {
    queuePatch,
    queuePatches,
    queueStructure,
    queueMoves,
    queueDelete,
    dropPending,
    flushNow,
    whenSettled,
    hasPending,
    resetQueue,
};

// Re-exported so document.js does not need a second import for temp-id handling.
export { api, awaitTempId, registerPendingItem, unregisterPendingItem };

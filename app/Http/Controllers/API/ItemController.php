<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Bookmark;
use App\Models\Document;
use App\Models\Item;
use App\Models\ItemRevision;
use App\Support\ImageStorage;
use App\Support\TreeBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use MongoDB\BSON\ObjectId;
use MongoDB\BSON\Regex;
use MongoDB\Collection;

class ItemController extends Controller
{
    /**
     * Resolve the document and 404 when it does not belong to the current user.
     */
    private function ownedDocument(Request $request, $documentId): ?Document
    {
        return Document::where('user_id', $request->user()->id)->find($documentId);
    }

    /**
     * Raw MongoDB collection used for bulkWrite(). Eloquent is still used to read so that
     * the soft-delete and user scopes keep applying; only the write path is batched.
     */
    private function itemsCollection(): Collection
    {
        return DB::connection('mongodb')->getDatabase()->selectCollection('items');
    }

    public function index(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $items = Item::where('document_id', $documentId)
            ->orderBy('sort_order')
            ->get();

        $tree = TreeBuilder::build($items);

        return response()->json([
            'status' => 'success',
            'data' => $tree,
        ]);
    }

    public function store(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'parent_id' => ['nullable', 'string'],
            'content' => ['sometimes', 'nullable', 'string'],
            'note' => ['nullable', 'string'],
            'checked' => ['sometimes', 'boolean'],
            'heading' => ['sometimes', 'integer', 'between:0,3'],
            'color' => ['nullable', 'string', 'max:50'],
            'bullet' => ['sometimes', 'string', 'in:bullet,checklist,numbered'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string'],
            'position' => ['sometimes', 'integer', 'min:0'],
        ]);

        $parentId = $data['parent_id'] ?? null;

        if (! empty($parentId)) {
            $parent = Item::where('document_id', $documentId)->find($parentId);

            if (! $parent) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Parent item not found',
                ], 404);
            }
        }

        $item = Item::create([
            'user_id' => $user->id,
            'document_id' => $documentId,
            'parent_id' => $parentId ?: null,
            'content' => (string) ($data['content'] ?? ''),
            'note' => (string) ($data['note'] ?? ''),
            'checked' => $data['checked'] ?? false,
            'heading' => $data['heading'] ?? 0,
            'color' => $data['color'] ?? null,
            'bullet' => $data['bullet'] ?? 'bullet',
            'tags' => $data['tags'] ?? [],
            'sort_order' => Item::where('document_id', $documentId)
                ->where('parent_id', $parentId ?: null)
                ->count(),
        ]);

        if (isset($data['position'])) {
            $this->applyPosition($documentId, $item, $parentId ?: null, $data['position']);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Item created',
            'data' => $item->fresh(),
        ], 201);
    }

    /**
     * Create many items in one request, including newly created parents referenced by
     * their children in the same payload via a client-generated `tmp_id`.
     *
     * This is what the client's hierarchical paste targets: pasting N lines used to cost N
     * sequential POST /items round trips, each child awaiting its parent's real id before it
     * could even be sent. Here every id is minted up front so parent-child links resolve in
     * memory, and the whole subtree lands in a single insertOne bulkWrite.
     */
    public function createBatch(Request $request, $documentId)
    {
        $user = $request->user();

        if (! $this->ownedDocument($request, $documentId)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:'.self::BATCH_LIMIT],
            'items.*.tmp_id' => ['required', 'string'],
            'items.*.parent_id' => ['nullable', 'string'],
            'items.*.position' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'items.*.content' => ['sometimes', 'nullable', 'string'],
            'items.*.note' => ['sometimes', 'nullable', 'string'],
            'items.*.checked' => ['sometimes', 'boolean'],
            'items.*.heading' => ['sometimes', 'integer', 'between:0,3'],
            'items.*.color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'items.*.bullet' => ['sometimes', 'string', 'in:bullet,checklist,numbered'],
        ]);

        $entries = $data['items'];

        $tmpIds = array_column($entries, 'tmp_id');
        if (count($tmpIds) !== count(array_unique($tmpIds))) {
            return response()->json([
                'status' => 'error',
                'message' => 'Duplicate tmp_id in batch',
            ], 422);
        }
        $tmpIdSet = array_flip($tmpIds);

        // Mint every item's real id up front so a child can reference its not-yet-inserted
        // parent by that parent's future id, within the same request.
        $realIds = [];
        foreach ($tmpIds as $tmpId) {
            $realIds[$tmpId] = (string) new ObjectId();
        }

        $original = $this->loadOutline($documentId, $user->id);
        $rows = $original;
        $groups = $this->groupOutline($rows);

        $newPayload = [];

        foreach ($entries as $entry) {
            $tmpId = $entry['tmp_id'];
            $rawParent = $entry['parent_id'] ?? null;

            if ($rawParent !== null && isset($tmpIdSet[$rawParent])) {
                $parentId = $realIds[$rawParent];
            } elseif ($rawParent !== null) {
                if (! isset($rows[$rawParent])) {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'Parent item not found',
                    ], 422);
                }
                $parentId = $rawParent;
            } else {
                $parentId = null;
            }

            $realId = $realIds[$tmpId];
            $rows[$realId] = ['id' => $realId, 'parent_id' => $parentId, 'sort_order' => 0];

            $position = array_key_exists('position', $entry) ? $entry['position'] : null;
            $this->insertIntoGroup($groups, $this->groupKey($parentId), $realId, $position === null ? PHP_INT_MAX : $position);

            $newPayload[$realId] = [
                'user_id' => $user->id,
                'document_id' => $documentId,
                'content' => (string) ($entry['content'] ?? ''),
                'note' => (string) ($entry['note'] ?? ''),
                'checked' => $entry['checked'] ?? false,
                'heading' => $entry['heading'] ?? 0,
                'color' => $entry['color'] ?? null,
                'bullet' => $entry['bullet'] ?? 'bullet',
                'tags' => [],
            ];
        }

        $ops = $this->outlineWriteOpsWithInserts($rows, $groups, $original, $newPayload);

        if (! empty($ops)) {
            $this->itemsCollection()->bulkWrite($ops, ['ordered' => false]);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Items created',
            'created' => count($newPayload),
            'map' => $realIds,
        ], 201);
    }

    /**
     * Same walk as outlineWriteOps(), but ids present in $newPayload are inserted rather
     * than diffed against $original, since a brand-new item has no prior state to diff.
     */
    private function outlineWriteOpsWithInserts(array &$rows, array $groups, array $original, array $newPayload): array
    {
        $now = now();
        $ops = [];

        foreach ($groups as $ids) {
            foreach (array_values($ids) as $index => $id) {
                $sortOrder = $index;
                $parentId = $rows[$id]['parent_id'];
                $rows[$id]['sort_order'] = $sortOrder;

                if (isset($newPayload[$id])) {
                    $ops[] = [
                        'insertOne' => [
                            $newPayload[$id] + [
                                '_id' => new ObjectId($id),
                                'parent_id' => $parentId,
                                'sort_order' => $sortOrder,
                                'created_at' => $now,
                                'updated_at' => $now,
                            ],
                        ],
                    ];
                    continue;
                }

                $unchanged = isset($original[$id])
                    && $original[$id]['sort_order'] === $sortOrder
                    && $original[$id]['parent_id'] === $parentId;

                if ($unchanged) {
                    continue;
                }

                $ops[] = [
                    'updateOne' => [
                        ['_id' => new ObjectId($id)],
                        [
                            '$set' => [
                                'parent_id' => $parentId,
                                'sort_order' => $sortOrder,
                                'updated_at' => $now,
                            ],
                        ],
                    ],
                ];
            }
        }

        return $ops;
    }

    public function uploadImage(Request $request, $documentId)
    {
        $user = $request->user();
        $file = $request->file('image');

        if (! $file) {
            return response()->json(['status' => 'error', 'message' => 'No file received'], 422);
        }

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $storage = app(ImageStorage::class);

        try {
            $filename = Str::random(20).'.'.$file->getClientOriginalExtension();
            $url = $storage->put($filename, $file->getContent());
        } catch (\Throwable $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Image uploaded',
            'data' => [
                'url' => $url,
                'path' => $url,
            ],
        ]);
    }

    public function deleteImage(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'path' => ['required', 'string', 'max:500'],
        ]);

        $path = $data['path'];

        // Hanya hapus jika file tersebut dirujuk oleh item di dokumen milik user
        // (mencegah penghapusan file sembarang dari storage).
        $referenced = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->where('content', new Regex(preg_quote($path), 'i'))
            ->exists();

        if (! $referenced) {
            return response()->json([
                'status' => 'error',
                'message' => 'Image not found',
            ], 404);
        }

        // imgbb doesn't support delete via simple API

        return response()->json([
            'status' => 'success',
            'message' => 'Image deleted',
        ]);
    }

    public function show(Request $request, $documentId, $id)
    {        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => $item,
        ]);
    }

    public function update(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            // A patch can still be in flight when the user deletes the item. Report that
            // specific case (410) so the client can drop it quietly instead of surfacing
            // a scary "not found" error and reloading the document.
            $trashed = Item::onlyTrashed()
                ->where('document_id', $documentId)
                ->where('user_id', $user->id)
                ->find($id);

            if ($trashed) {
                return response()->json([
                    'status' => 'gone',
                    'deleted' => true,
                    'message' => 'Item was deleted',
                ], 410);
            }

            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $data = $this->validatePatch($request);

        if (array_key_exists('content', $data)) {
            $data['content'] = (string) ($data['content'] ?? '');
        }

        if (array_key_exists('parent_id', $data)) {
            if (! empty($data['parent_id'])) {
                $parent = Item::where('document_id', $documentId)->find($data['parent_id']);

                if (! $parent || (string) $parent->id === $id || $this->isDescendant($documentId, $data['parent_id'], $id)) {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'Invalid parent item',
                    ], 422);
                }
            }
            $data['parent_id'] = $data['parent_id'] ?: null;
        }

        $this->recordRevision($item, $data);

        $item->update($data);

        return response()->json([
            'status' => 'success',
            'message' => 'Item updated',
            'data' => $item->fresh(),
        ]);
    }

    /**
     * The mutable fields shared by the single and batched item endpoints.
     */
    private function patchRules(): array
    {
        return [
            'content' => ['sometimes', 'nullable', 'string'],
            'note' => ['sometimes', 'nullable', 'string'],
            'checked' => ['sometimes', 'boolean'],
            'heading' => ['sometimes', 'integer', 'between:0,3'],
            'color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'bullet' => ['sometimes', 'string', 'in:bullet,checklist,numbered'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string'],
            'parent_id' => ['sometimes', 'nullable', 'string'],
        ];
    }

    private function validatePatch(Request $request): array
    {
        return $request->validate($this->patchRules());
    }

    /**
     * Re-apply the single-item patch rules to every entry of a batch body.
     *
     * The rules are keyed by bare field name, so they cannot simply be unioned into the
     * top level of the request: `content` would validate the request body instead of
     * `items.0.content` and a bad `bullet` would sail straight through to the database.
     */
    private function batchPatchRules(): array
    {
        $rules = [
            'items' => ['required', 'array', 'max:'.self::BATCH_LIMIT],
            'items.*.id' => ['required', 'string'],
        ];

        foreach ($this->patchRules() as $field => $fieldRules) {
            // A relative wildcard like `tags.*` prefixes cleanly too: `items.*.tags.*`.
            $rules['items.*.'.$field] = $fieldRules;
        }

        return $rules;
    }

    /**
     * Apply many item patches with a single request.
     *
     * This is the endpoint the client write queue targets: N per-item PATCHes collapse into
     * one HTTP call, one read, one bulkWrite and one revision aggregation.
     */
    public function updateBatch(Request $request, $documentId)
    {
        $user = $request->user();

        if (! $this->ownedDocument($request, $documentId)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate($this->batchPatchRules());

        $ids = array_values(array_unique(array_column($data['items'], 'id')));

        if (empty($ids)) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to update',
                'updated' => 0,
                'gone' => [],
            ]);
        }

        // Ids are cast to ObjectId on the way to the driver, so a malformed one would blow
        // up as a 500 for the entire batch. Treat it as "gone" instead and keep going.
        $ids = array_values(array_filter($ids, fn ($id) => (bool) preg_match('/^[a-f0-9]{24}$/i', (string) $id)));
        $malformed = array_values(array_diff(array_unique(array_column($data['items'], 'id')), $ids));

        if (empty($ids)) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to update',
                'updated' => 0,
                'gone' => $malformed,
            ]);
        }

        // One read for the whole batch. Soft-deleted rows are excluded, so a delete that
        // landed first simply drops out instead of erroring.
        $items = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->whereIn('id', $ids)
            ->get()
            ->keyBy(fn ($item) => (string) $item->id);

        $patches = [];
        $gone = $malformed;

        foreach ($data['items'] as $entry) {
            $id = (string) $entry['id'];

            if (! $items->has($id)) {
                $gone[] = $id;
                continue;
            }

            $patch = array_diff_key($entry, ['id' => true]);
            if (empty($patch)) {
                continue;
            }

            if (array_key_exists('content', $patch)) {
                $patch['content'] = (string) ($patch['content'] ?? '');
            }

            // Re-parenting goes through the dedicated endpoints; the queue never needs it
            // and keeping it out avoids N ancestor walks per batch.
            unset($patch['parent_id']);

            if (! empty($patch)) {
                $patches[$id] = $patch;
            }
        }

        if (empty($patches)) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to update',
                'updated' => 0,
                'gone' => $gone,
            ]);
        }

        $this->recordRevisionsBatch($items->only(array_keys($patches)), $patches);

        $now = now();
        $ops = [];
        $updated = 0;

        foreach ($patches as $id => $patch) {
            $patch['updated_at'] = $now;
            $ops[] = [
                'updateOne' => [
                    ['_id' => new ObjectId($id)],
                    ['$set' => $patch],
                ],
            ];
            $updated++;
        }

        $this->itemsCollection()->bulkWrite($ops, ['ordered' => false]);

        return response()->json([
            'status' => 'success',
            'message' => 'Items updated',
            'updated' => $updated,
            'gone' => $gone,
        ]);
    }

    protected const REVISION_LIMIT = 50;

    /**
     * Max item rows accepted by a single batch endpoint call. The client splits larger
     * queues into chunks of this size.
     */
    protected const BATCH_LIMIT = 200;

    protected const TRACKED_REVISION_FIELDS = ['content', 'note', 'checked', 'heading', 'color', 'bullet'];

    protected function hasTrackedChange(Item $item, array $data): bool
    {
        foreach (self::TRACKED_REVISION_FIELDS as $key) {
            if (array_key_exists($key, $data) && (string) ($data[$key] ?? '') !== (string) ($item->{$key} ?? '')) {
                return true;
            }
        }

        return false;
    }

    protected function revisionPayload(Item $item): array
    {
        return [
            'user_id' => $item->user_id,
            'item_id' => (string) $item->id,
            'document_id' => (string) $item->document_id,
            'content' => (string) ($item->content ?? ''),
            'note' => (string) ($item->note ?? ''),
            'checked' => (bool) $item->checked,
            'heading' => (int) ($item->heading ?? 0),
            'color' => $item->color ?? null,
            'bullet' => $item->bullet ?? 'bullet',
        ];
    }

    protected function recordRevision(Item $item, array $data)
    {
        if (! $this->hasTrackedChange($item, $data)) {
            return;
        }

        $this->recordRevisionsBatch([$item], [$item->id => $data]);
    }

    /**
     * Snapshot every changed item's previous state in one pass.
     *
     * The single-item path used to cost a count() + delete() + create() per item, so editing
     * N items cost 3N queries. Here the counts come from one aggregation and all revision
     * documents are written with a single insertMany(), giving 2 queries total.
     *
     * @param  iterable  $items  Models whose current state should be snapshotted
     * @param  array  $dataById  item id => the patch that is about to be applied
     * @return int Number of revisions written
     */
    protected function recordRevisionsBatch(iterable $items, array $dataById): int
    {
        $changed = [];

        foreach ($items as $item) {
            $key = (string) $item->id;
            if (array_key_exists($key, $dataById) && $this->hasTrackedChange($item, $dataById[$key])) {
                $changed[$key] = $item;
            }
        }

        if (empty($changed)) {
            return 0;
        }

        $userId = reset($changed)->user_id;
        $counts = $this->revisionCountsFor($userId, array_keys($changed));

        $idsToTrim = [];
        foreach ($changed as $id => $item) {
            $stat = $counts[$id] ?? null;
            if ($stat && $stat['total'] >= self::REVISION_LIMIT && $stat['oldest'] !== null) {
                $idsToTrim[] = $id;
            }
        }

        if ($idsToTrim) {
            ItemRevision::where('user_id', $userId)
                ->whereIn('item_id', $idsToTrim)
                ->where(function ($query) use ($counts, $idsToTrim) {
                    foreach ($idsToTrim as $id) {
                        $stat = $counts[$id];
                        $query->orWhere(function ($q) use ($id, $stat) {
                            $q->where('item_id', $id)
                              ->where('created_at', $stat['oldest']);
                        });
                    }
                })
                ->delete();
        }

        $now = now();
        $rows = [];
        $collection = null;

        foreach ($changed as $id => $item) {
            $collection = $collection ?: ItemRevision::where('user_id', $userId)->raw();
            $rows[] = $this->revisionPayload($item) + ['created_at' => $now, 'updated_at' => $now];
        }

        if (empty($rows)) {
            return 0;
        }

        $collection->insertMany($rows);

        return count($rows);
    }

    /**
     * Revision totals plus each item's oldest revision timestamp, in one aggregation.
     *
     * @return array<string, array{total: int, oldest: mixed}>
     */
    private function revisionCountsFor($userId, array $itemIds): array
    {
        if (empty($itemIds)) {
            return [];
        }

        $collection = ItemRevision::where('user_id', $userId)->raw();

        $cursor = $collection->aggregate([
            ['$match' => [
                'user_id' => $userId,
                'item_id' => ['$in' => array_values($itemIds)],
            ]],
            ['$group' => [
                '_id' => '$item_id',
                'total' => ['$sum' => 1],
                'oldest' => ['$min' => '$created_at'],
            ]],
        ]);

        $counts = [];

        foreach ($cursor as $row) {
            $row = is_array($row) ? $row : (array) $row;
            $id = $row['_id'] ?? null;
            if ($id === null) {
                continue;
            }
            $counts[(string) $id] = [
                'total' => (int) ($row['total'] ?? 0),
                'oldest' => $row['oldest'] ?? null,
            ];
        }

        return $counts;
    }

    public function destroy(Request $request, $documentId, $id)
    {
        $item = Item::where('document_id', $documentId)
            ->where('user_id', $request->user()->id)
            ->find($id);

        if (! $item) {
            // Deleting twice is a no-op, not an error: the client optimistically removes the
            // row and a retried request should not raise a scary alert.
            // `exists()` takes no arguments -- passing the id would silently ask "does this
            // user have *any* trashed item here" and give a false positive. whereKey is the
            // only way to scope the check to the requested item.
            $alreadyGone = Item::onlyTrashed()
                ->where('document_id', $documentId)
                ->where('user_id', $request->user()->id)
                ->whereKey($id)
                ->exists();

            return response()->json([
                'status' => 'success',
                'deleted' => $alreadyGone ? 0 : null,
                'message' => $alreadyGone ? 'Item already deleted' : 'Item not found',
            ], $alreadyGone ? 200 : 404);
        }

        $ids = $this->collectDescendantIds($documentId, $id);
        $ids[] = $id;

        Item::where('document_id', $documentId)->whereIn('id', $ids)->delete();

        Bookmark::where('target_type', 'item')->whereIn('target_id', $ids)->delete();

        $this->reorderSiblings($documentId, $item->parent_id);

        return response()->json([
            'status' => 'success',
            'deleted' => count($ids),
            'message' => 'Item deleted',
        ]);
    }

    public function move(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $data = $request->validate([
            'parent_id' => ['nullable', 'string'],
            'position' => ['sometimes', 'integer', 'min:0'],
        ]);

        $parentId = $data['parent_id'] ?? null;

        if (! empty($parentId)) {
            $parent = Item::where('document_id', $documentId)->find($parentId);

            if (! $parent || in_array((string) $parent->id, $this->collectDescendantIds($documentId, $id), true)) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Invalid parent item',
                ], 422);
            }
        }

        $oldParentId = $item->parent_id;

        $item->parent_id = $parentId ?: null;
        $item->save();

        $this->reorderSiblings($documentId, $parentId ?: null);
        if ($oldParentId && (string) $oldParentId !== (string) ($parentId ?: null)) {
            $this->reorderSiblings($documentId, $oldParentId);
        }

        if (isset($data['position'])) {
            $this->applyPosition($documentId, $item, $parentId ?: null, $data['position']);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Item moved',
            'data' => $item->fresh(),
        ]);
    }

    public function moveToDocument(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $data = $request->validate([
            'target_document_id' => ['required', 'string'],
        ]);

        $target = Document::where('user_id', $user->id)
            ->where('type', 'document')
            ->find($data['target_document_id']);

        if (! $target) {
            return response()->json([
                'status' => 'error',
                'message' => 'Target document not found',
            ], 404);
        }

        if ((string) $target->id === (string) $documentId) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item already in this document',
            ], 422);
        }

        $oldParentId = $item->parent_id;
        $ids = $this->collectDescendantIds($documentId, $id);
        $ids[] = $id;

        Item::whereIn('id', $ids)->update(['document_id' => (string) $target->id]);

        $item->refresh();
        $item->parent_id = null;
        $item->save();

        $this->reorderSiblings($documentId, $oldParentId);
        $this->reorderSiblings((string) $target->id, null);

        return response()->json([
            'status' => 'success',
            'message' => 'Item moved to document',
            'data' => $item->fresh(),
        ]);
    }

    public function indent(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        // Previous sibling at the item's current level
        $prev = Item::where('document_id', $documentId)
            ->where('parent_id', $item->parent_id)
            ->where('sort_order', '<', $item->sort_order)
            ->orderByDesc('sort_order')
            ->first();

        if (! $prev) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to indent',
                'data' => $item->fresh(),
            ]);
        }

        $oldParentId = $item->parent_id;

        // Move item to become the last child of the previous sibling
        $item->parent_id = (string) $prev->id;
        $item->sort_order = Item::where('document_id', $documentId)
            ->where('parent_id', $item->parent_id)
            ->where('id', '!=', $item->id)
            ->count();
        $item->save();

        $this->reorderSiblings($documentId, $oldParentId);
        $this->reorderSiblings($documentId, $item->parent_id);

        return response()->json([
            'status' => 'success',
            'message' => 'Indented',
            'data' => $item->fresh(),
        ]);
    }

    public function unindent(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        if (! $item->parent_id) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to unindent',
                'data' => $item->fresh(),
            ]);
        }

        $parent = Item::where('document_id', $documentId)->find($item->parent_id);
        $oldParentId = $item->parent_id;
        $newParentId = $parent ? $parent->parent_id : null;

        // Move item to become the sibling right after its former parent
        $this->moveToParentAfter($documentId, $item, $newParentId, $parent);

        // Reorder the old sibling group to remove the gap
        $this->reorderSiblings($documentId, $oldParentId);

        return response()->json([
            'status' => 'success',
            'message' => 'Unindented',
            'data' => $item->fresh(),
        ]);
    }

    // ---------------------------------------------------------------------
    // Batched structural operations
    //
    // The single-item indent/unindent above re-queries and re-saves per call, so a
    // multi-select used to fan out into N parallel HTTP requests. The helpers below load
    // the outline once, replay the moves in memory, then persist everything with a single
    // bulkWrite: 1 read + 1 write no matter how many items are involved.
    // ---------------------------------------------------------------------

    /**
     * Flatten the outline into id => {parent_id, sort_order} for in-memory edits.
     *
     * @return array<string, array{id: string, parent_id: string|null, sort_order: int}>
     */
    private function loadOutline(string $documentId, $userId): array
    {
        $rows = [];

        $items = Item::where('document_id', $documentId)
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->get(['id', 'parent_id', 'sort_order']);

        foreach ($items as $item) {
            $rows[(string) $item->id] = [
                'id' => (string) $item->id,
                'parent_id' => $item->parent_id ? (string) $item->parent_id : null,
                'sort_order' => (int) ($item->sort_order ?? 0),
            ];
        }

        return $rows;
    }

    /**
     * Group member ids by parent, ordered by sort_order. Null parent maps to the '' key.
     */
    private function groupOutline(array $rows): array
    {
        $groups = [];

        foreach ($rows as $id => $row) {
            $groups[$this->groupKey($row['parent_id'])][] = $id;
        }

        foreach ($groups as $key => $ids) {
            usort($ids, fn ($a, $b) => $rows[$a]['sort_order'] <=> $rows[$b]['sort_order']);
            $groups[$key] = array_values($ids);
        }

        return $groups;
    }

    private function groupKey(?string $parentId): string
    {
        return $parentId ?? '';
    }

    private function detachFromGroup(array &$groups, string $groupKey, string $id): void
    {
        $ids = $groups[$groupKey] ?? [];
        $at = array_search($id, $ids, true);

        if ($at !== false) {
            array_splice($ids, $at, 1);
        }

        $groups[$groupKey] = array_values($ids);
    }

    private function insertIntoGroup(array &$groups, string $groupKey, string $id, int $at): void
    {
        $ids = $groups[$groupKey] ?? [];
        array_splice($ids, max(0, min($at, count($ids))), 0, [$id]);
        $groups[$groupKey] = array_values($ids);
    }

    /**
     * Make $id the last child of its previous sibling.
     */
    private function applyIndent(array &$rows, array &$groups, string $id): bool
    {
        if (! isset($rows[$id])) {
            return false;
        }

        $groupKey = $this->groupKey($rows[$id]['parent_id']);
        $siblings = $groups[$groupKey] ?? [];
        $at = array_search($id, $siblings, true);

        if ($at === false || $at <= 0) {
            return false;
        }

        $newParentId = $siblings[$at - 1];
        $newGroupKey = $this->groupKey($newParentId);

        $this->detachFromGroup($groups, $groupKey, $id);
        $this->insertIntoGroup($groups, $newGroupKey, $id, PHP_INT_MAX);

        $rows[$id]['parent_id'] = $newParentId;

        return true;
    }

    /**
     * Promote $id one level, landing right after its former parent.
     */
    private function applyUnindent(array &$rows, array &$groups, string $id, array &$placedAfterParent = []): bool
    {
        $parentId = $rows[$id]['parent_id'] ?? null;

        if ($parentId === null) {
            return false;
        }

        $oldGroupKey = $this->groupKey($parentId);
        $grandParentId = $rows[$parentId]['parent_id'] ?? null;
        $newGroupKey = $this->groupKey($grandParentId);

        $siblings = $groups[$newGroupKey] ?? [];
        $at = array_search($parentId, $siblings, true);
        $insertAt = $at === false ? count($siblings) : $at + 1;

        // Unindenting several children of the same parent in one batch has to keep their
        // original order. Inserting each one at "parent + 1" would reverse them, because
        // every insert pushes the previous one down. Step past the ones already placed.
        $insertAt += $placedAfterParent[$parentId] ?? 0;

        $this->detachFromGroup($groups, $oldGroupKey, $id);
        $this->insertIntoGroup($groups, $newGroupKey, $id, $insertAt);

        $rows[$id]['parent_id'] = $grandParentId;
        $placedAfterParent[$parentId] = ($placedAfterParent[$parentId] ?? 0) + 1;

        return true;
    }

    /**
     * Renumber every group consecutively and return the bulkWrite operations.
     */
    private function outlineWriteOps(array &$rows, array $groups, array $original): array
    {
        $now = now();
        $ops = [];

        foreach ($groups as $ids) {
            foreach (array_values($ids) as $index => $id) {
                $sortOrder = $index;
                $parentId = $rows[$id]['parent_id'];

                $unchanged = isset($original[$id])
                    && $original[$id]['sort_order'] === $sortOrder
                    && $original[$id]['parent_id'] === $parentId;

                if ($unchanged) {
                    continue;
                }

                $rows[$id]['sort_order'] = $sortOrder;
                $ops[] = [
                    'updateOne' => [
                        ['_id' => new ObjectId($id)],
                        [
                            '$set' => [
                                'parent_id' => $parentId,
                                'sort_order' => $sortOrder,
                                'updated_at' => $now,
                            ],
                        ],
                    ],
                ];
            }
        }

        return $ops;
    }

    private function validateBatchIds(Request $request): array
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:'.self::BATCH_LIMIT],
            'ids.*' => ['required', 'string'],
        ]);

        $ids = array_values(array_unique($data['ids']));

        // Ids are cast to ObjectId on the way to the driver, so a malformed value would
        // surface as a 500 for the whole batch. Silently skip them instead: a caller that
        // sent garbage for one id still gets a correct result for the rest.
        return array_values(array_filter($ids, fn ($id) => (bool) preg_match('/^[a-f0-9]{24}$/i', (string) $id)));
    }

    public function indentBatch(Request $request, $documentId)
    {
        return $this->runStructureBatch($request, $documentId, 'indent');
    }

    public function unindentBatch(Request $request, $documentId)
    {
        return $this->runStructureBatch($request, $documentId, 'unindent');
    }

    public function moveBatch(Request $request, $documentId)
    {
        $user = $request->user();

        if (! $this->ownedDocument($request, $documentId)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'moves' => ['required', 'array', 'min:1', 'max:'.self::BATCH_LIMIT],
            'moves.*.id' => ['required', 'string'],
            'moves.*.parent_id' => ['nullable', 'string'],
            'moves.*.position' => ['nullable', 'integer', 'min:0'],
        ]);

        $original = $this->loadOutline($documentId, $user->id);
        $rows = $original;
        $groups = $this->groupOutline($rows);

        // Validate every distinct target parent with one query up front.
        $parentIds = [];
        foreach ($data['moves'] as $move) {
            if (! empty($move['parent_id'])) {
                $parentIds[(string) $move['parent_id']] = true;
            }
        }

        if ($parentIds) {
            $found = Item::where('document_id', $documentId)
                ->where('user_id', $user->id)
                ->whereIn('id', array_keys($parentIds))
                ->pluck('id')
                ->map(fn ($v) => (string) $v)
                ->all();

            $missing = array_diff(array_keys($parentIds), $found);
            if ($missing) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Parent item not found',
                ], 422);
            }
        }

        $moved = [];
        foreach ($data['moves'] as $move) {
            $id = (string) $move['id'];
            if (! isset($rows[$id])) {
                continue;
            }

            $parentId = ! empty($move['parent_id']) ? (string) $move['parent_id'] : null;
            $position = array_key_exists('position', $move) && $move['position'] !== null
                ? (int) $move['position']
                : null;

            // Reject a move that would put an item inside its own subtree.
            if ($parentId !== null && in_array($parentId, $this->descendantSet($rows, $id), true)) {
                continue;
            }

            $oldKey = $this->groupKey($rows[$id]['parent_id']);
            $newKey = $this->groupKey($parentId);

            $this->detachFromGroup($groups, $oldKey, $id);
            $rows[$id]['parent_id'] = $parentId;
            $this->insertIntoGroup($groups, $newKey, $id, $position === null ? PHP_INT_MAX : $position);

            $moved[] = $id;
        }

        if (empty($moved)) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to move',
                'moved' => [],
            ]);
        }

        $ops = $this->outlineWriteOps($rows, $groups, $original);

        if (! empty($ops)) {
            $this->itemsCollection()->bulkWrite($ops, ['ordered' => false]);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Items moved',
            'moved' => $moved,
        ]);
    }

    /**
     * All descendants of $id within the in-memory outline.
     */
    private function descendantSet(array $rows, string $id): array
    {
        $childrenOf = [];
        foreach ($rows as $nodeId => $row) {
            if ($row['parent_id'] === null) {
                continue;
            }
            $childrenOf[$row['parent_id']][] = $nodeId;
        }

        $out = [];
        $queue = $childrenOf[$id] ?? [];

        while (! empty($queue)) {
            foreach ($queue as $childId) {
                if (in_array($childId, $out, true)) {
                    continue;
                }
                $out[] = $childId;
                $queue = array_merge($queue, $childrenOf[$childId] ?? []);
            }
        }

        return $out;
    }

    private function runStructureBatch(Request $request, $documentId, string $operation)
    {
        $user = $request->user();

        if (! $this->ownedDocument($request, $documentId)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $ids = $this->validateBatchIds($request);

        $original = $this->loadOutline($documentId, $user->id);
        $rows = $original;
        $groups = $this->groupOutline($rows);

        $moved = [];
        $placedAfterParent = [];
        foreach ($ids as $id) {
            $applied = $operation === 'indent'
                ? $this->applyIndent($rows, $groups, $id)
                : $this->applyUnindent($rows, $groups, $id, $placedAfterParent);

            if ($applied) {
                $moved[] = $id;
            }
        }

        if (empty($moved)) {
            return response()->json([
                'status' => 'success',
                'message' => 'Nothing to '.$operation,
                'moved' => [],
            ]);
        }

        $ops = $this->outlineWriteOps($rows, $groups, $original);

        if (! empty($ops)) {
            $this->itemsCollection()->bulkWrite($ops, ['ordered' => false]);
        }

        return response()->json([
            'status' => 'success',
            'message' => ucfirst($operation).'ed',
            'moved' => $moved,
        ]);
    }

    public function sort(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $data = $request->validate([
            'order' => ['required', 'in:default,name_asc,name_desc,created_asc,created_desc,checked,checked_desc,updated_asc,updated_desc,reverse'],
        ]);

        if ($data['order'] === 'reverse') {
            $ordered = Item::where('document_id', $documentId)
                ->where('parent_id', $item->id)
                ->orderBy('sort_order')
                ->get()
                ->reverse()
                ->values();

            foreach ($ordered as $index => $child) {
                $child->sort_order = $index;
                $child->save();
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Sorted',
            ]);
        }

        $children = Item::where('document_id', $documentId)
            ->where('parent_id', $item->id);

        switch ($data['order']) {
            case 'default':
                $children->orderBy('sort_order');
                break;
            case 'name_asc':
                $children->orderBy('content');
                break;
            case 'name_desc':
                $children->orderByDesc('content');
                break;
            case 'created_asc':
                $children->orderBy('created_at');
                break;
            case 'created_desc':
                $children->orderByDesc('created_at');
                break;
            case 'checked':
                $children->orderBy('checked')->orderBy('sort_order');
                break;
            case 'checked_desc':
                $children->orderByDesc('checked')->orderBy('sort_order');
                break;
            case 'updated_asc':
                $children->orderBy('updated_at')->orderBy('sort_order');
                break;
            case 'updated_desc':
                $children->orderByDesc('updated_at')->orderBy('sort_order');
                break;
        }

        $this->bulkSetSortOrder($children->get());

        return response()->json([
            'status' => 'success',
            'message' => 'Sorted',
        ]);
    }

    public function deleteChecked(Request $request, $documentId)
    {
        $user = $request->user();

        if (! $this->ownedDocument($request, $documentId)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        // Prefer the ids the client actually removed from the screen. Falling back to
        // re-querying `checked` used to delete a different set whenever a checked patch
        // was still in flight, so rows vanished without the user selecting them.
        if ($request->filled('ids')) {
            $data = $request->validate([
                'ids' => ['required', 'array', 'min:1', 'max:'.self::BATCH_LIMIT],
                'ids.*' => ['required', 'string'],
            ]);

            $requested = array_values(array_unique($data['ids']));

            $seedIds = Item::where('document_id', $documentId)
                ->where('user_id', $user->id)
                ->whereIn('id', $requested)
                ->pluck('id')
                ->map(fn ($v) => (string) $v)
                ->all();
        } else {
            $seedIds = Item::where('document_id', $documentId)
                ->where('user_id', $user->id)
                ->where('checked', true)
                ->pluck('id')
                ->map(fn ($v) => (string) $v)
                ->all();
        }

        $idsToDelete = array_merge($seedIds, $this->collectDescendantIdsForMany($documentId, $seedIds));
        $idsToDelete = array_values(array_unique($idsToDelete));

        if (empty($idsToDelete)) {
            return response()->json([
                'status' => 'success',
                'message' => 'No items to delete',
                'deleted' => 0,
            ]);
        }

        Item::where('document_id', $documentId)->whereIn('id', $idsToDelete)->delete();

        Bookmark::where('target_type', 'item')->whereIn('target_id', $idsToDelete)->delete();

        $this->reorderAllSiblings($documentId);

        return response()->json([
            'status' => 'success',
            'message' => 'Checked items deleted',
            'deleted' => count($idsToDelete),
        ]);
    }

    public function deleteBatch(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:'.self::BATCH_LIMIT],
            'ids.*' => ['required', 'string'],
        ]);

        $ids = array_values(array_unique($data['ids']));

        $existing = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->map(fn ($v) => (string) $v)
            ->all();

        if (empty($existing)) {
            return response()->json([
                'status' => 'success',
                'message' => 'No items to delete',
                'deleted' => 0,
            ]);
        }

        $idsToDelete = array_merge($existing, $this->collectDescendantIdsForMany($documentId, $existing));
        $idsToDelete = array_values(array_unique($idsToDelete));

        Item::where('document_id', $documentId)->whereIn('id', $idsToDelete)->delete();

        Bookmark::where('target_type', 'item')->whereIn('target_id', $idsToDelete)->delete();

        $this->reorderAllSiblings($documentId);

        return response()->json([
            'status' => 'success',
            'message' => 'Items deleted',
            'deleted' => count($idsToDelete),
        ]);
    }

    public function trashed(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $items = Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->orderByDesc('deleted_at')
            ->get();

        $data = $items->map(function ($item) {
            return [
                'id' => (string) $item->id,
                'parent_id' => $item->parent_id ? (string) $item->parent_id : null,
                'content' => $item->content ?? '',
                'note' => $item->note ?? '',
                'checked' => (bool) ($item->checked ?? false),
                'heading' => (int) ($item->heading ?? 0),
                'color' => $item->color ?? null,
                'bullet' => $item->bullet ?? 'bullet',
                'tags' => $item->tags ?? [],
                'deleted_at' => $item->deleted_at ? $item->deleted_at->toISOString() : null,
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    public function restoreItem(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item tidak ada di Trash',
            ], 404);
        }

        $ids = $this->collectTrashedDescendantIds($documentId, (string) $item->id);
        $ids[] = (string) $item->id;

        Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->whereIn('id', $ids)
            ->restore();

        $this->reorderSiblings($documentId, $item->parent_id ? (string) $item->parent_id : null);

        return response()->json([
            'status' => 'success',
            'message' => 'Item dipulihkan',
            'restored' => count($ids),
        ]);
    }

    public function forceDestroy(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item tidak ada di Trash',
            ], 404);
        }

        $ids = $this->collectTrashedDescendantIds($documentId, (string) $item->id);
        $ids[] = (string) $item->id;

        Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->whereIn('id', $ids)
            ->forceDelete();

        Bookmark::where('target_type', 'item')->whereIn('target_id', $ids)->delete();

        $this->reorderSiblings($documentId, $item->parent_id ? (string) $item->parent_id : null);

        return response()->json([
            'status' => 'success',
            'message' => 'Item dihapus permanen',
        ]);
    }

    public function emptyTrash(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $trashed = Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->pluck('id')
            ->map(fn ($v) => (string) $v)
            ->all();

        Item::onlyTrashed()
            ->where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->forceDelete();

        if ($trashed) {
            Bookmark::where('target_type', 'item')->whereIn('target_id', $trashed)->delete();
        }

        $this->reorderAllSiblings($documentId);

        return response()->json([
            'status' => 'success',
            'message' => 'Trash dikosongkan',
            'deleted' => count($trashed),
        ]);
    }

    public function toggleCheckChildren(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $data = $request->validate([
            'checked' => ['sometimes', 'boolean'],
        ]);

        $checked = $data['checked'] ?? ! $item->checked;
        $item->checked = $checked;
        $item->save();

        $descendants = $this->collectDescendantIds($documentId, $id);
        if ($descendants) {
            Item::where('document_id', $documentId)->whereIn('id', $descendants)->update(['checked' => $checked]);
        }

        return response()->json([
            'status' => 'success',
            'message' => $checked ? 'Checked' : 'Unchecked',
            'data' => $item->fresh(),
        ]);
    }

    public function numberChildren(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $children = Item::where('document_id', $documentId)
            ->where('parent_id', $id)
            ->orderBy('sort_order')
            ->get();

        foreach ($children as $index => $child) {
            $number = $index + 1;
            if (! preg_match('/^\d+\.\s/', $child->content)) {
                $child->content = $number.'. '.$child->content;
                $child->save();
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Children numbered',
        ]);
    }

    public function deduplicateChildren(Request $request, $documentId, $id)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $children = Item::where('document_id', $documentId)
            ->where('parent_id', $id)
            ->orderBy('sort_order')
            ->get();

        $seen = [];
        $reorderParents = [$id];
        $removed = 0;

        foreach ($children as $child) {
            $key = md5(
                (string) ($child->content ?? '') . "\x1f" .
                (string) ($child->note ?? '') . "\x1f" .
                (int) ($child->checked ?? 0)
            );

            if (! isset($seen[$key])) {
                $seen[$key] = (string) $child->id;
                continue;
            }

            $keepId = $seen[$key];

            Item::where('document_id', $documentId)
                ->where('parent_id', (string) $child->id)
                ->update(['parent_id' => $keepId]);
            $reorderParents[] = $keepId;

            $ids = $this->collectDescendantIds($documentId, (string) $child->id);
            $ids[] = (string) $child->id;

            Item::where('document_id', $documentId)->whereIn('id', $ids)->delete();
            Bookmark::where('target_type', 'item')->whereIn('target_id', $ids)->delete();
            $removed++;
        }

        if ($removed) {
            foreach (array_unique($reorderParents) as $parentId) {
                $this->reorderSiblings($documentId, $parentId);
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => "$removed item duplikat dihapus",
            'removed' => $removed,
        ]);
    }

    /**
     * Replace the document's items with a snapshot (used by undo/redo).
     * Items are matched by id (including soft-deleted ones) and restored; items of this
     * document not present in the snapshot are soft-deleted.
     */
    public function restore(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'items' => ['required', 'array'],
            'items.*.id' => ['required', 'string'],
            'items.*.parent_id' => ['nullable', 'string'],
            'items.*.content' => ['nullable', 'string'],
            'items.*.note' => ['nullable', 'string'],
            'items.*.checked' => ['sometimes', 'boolean'],
            'items.*.heading' => ['sometimes', 'integer', 'between:0,3'],
            'items.*.color' => ['nullable', 'string', 'max:50'],
            'items.*.bullet' => ['sometimes', 'string', 'in:bullet,checklist,numbered'],
            'items.*.tags' => ['sometimes', 'array'],
            'items.*.tags.*' => ['string'],
        ]);

        $incoming = [];
        foreach ($data['items'] as $i => $itemData) {
            $incoming[$itemData['id']] = [
                'parent_id' => ! empty($itemData['parent_id']) ? (string) $itemData['parent_id'] : null,
                'content' => (string) ($itemData['content'] ?? ''),
                'note' => (string) ($itemData['note'] ?? ''),
                'checked' => $itemData['checked'] ?? false,
                'heading' => (int) ($itemData['heading'] ?? 0),
                'color' => $itemData['color'] ?? null,
                'bullet' => $itemData['bullet'] ?? 'bullet',
                'tags' => $itemData['tags'] ?? [],
                'sort_order' => $i,
            ];
        }

        foreach ($incoming as $id => $fields) {
            $item = Item::withTrashed()->where('user_id', $user->id)->find($id);

            if (! $item) {
                $item = new Item;
                $item->id = new ObjectId($id);
                $item->user_id = $user->id;
            }

            foreach ($fields as $field => $value) {
                $item->{$field} = $value;
            }
            $item->document_id = (string) $documentId;
            $item->save();

            if ($item->trashed()) {
                $item->restore();
            }
        }

        $ids = array_keys($incoming);
        Item::where('document_id', $documentId)->whereNotIn('id', $ids)->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Items restored',
        ]);
    }

    public function search(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'q' => ['required', 'string'],
            'match' => ['sometimes', 'boolean'],
            'case_sensitive' => ['sometimes', 'boolean'],
            'replace_with' => ['sometimes', 'nullable', 'string'],
        ]);

        $flags = ! empty($data['case_sensitive']) ? '' : 'i';

        $query = Item::where('document_id', $documentId)->whereRaw([
            'content' => new Regex(preg_quote($data['q'], '/'), $flags),
        ]);

        if (! empty($data['match'])) {
            $matches = $query->get();

            return response()->json([
                'status' => 'success',
                'count' => $matches->count(),
                'data' => $matches,
            ]);
        }

        $items = $query->get();

        if (array_key_exists('replace_with', $data)) {
            $replaceFn = ! empty($data['case_sensitive']) ? 'str_replace' : 'str_ireplace';
            foreach ($items as $item) {
                $item->content = $replaceFn($data['q'], $data['replace_with'] ?? '', $item->content);
                $item->save();
            }
        }

        return response()->json([
            'status' => 'success',
            'count' => $items->count(),
            'data' => $items,
        ]);
    }

    private function isDescendant($documentId, $parentId, $targetId): bool
    {
        return in_array($targetId, $this->collectDescendantIds($documentId, $parentId), true);
    }

    private function collectDescendantIds($documentId, $id): array
    {
        return $this->collectDescendantIdsForMany($documentId, [$id]);
    }

    /**
     * Collect every descendant of any of the given seeds in a single BFS.
     *
     * Calling collectDescendantIds() per seed cost one query per tree level per seed, so
     * deleting N items cost N x depth queries. Seeding the queue with every id collapses
     * the whole traversal into one query per level regardless of N.
     *
     * @param  array  $seedIds
     * @return array Descendant ids only (seeds are not included)
     */
    private function collectDescendantIdsForMany($documentId, array $seedIds): array
    {
        $queue = array_values(array_unique($seedIds));
        $found = [];

        while (! empty($queue)) {
            $children = Item::where('document_id', $documentId)
                ->whereIn('parent_id', $queue)
                ->get();

            $childIds = $children->pluck('id')->map(fn ($v) => (string) $v)->all();

            if (empty($childIds)) {
                break;
            }

            $found = array_merge($found, $childIds);
            $queue = array_values(array_diff($childIds, $found));
        }

        return $found;
    }

    private function collectTrashedDescendantIds($documentId, $id): array
    {
        $ids = [];
        $queue = [$id];

        while (! empty($queue)) {
            $children = Item::onlyTrashed()
                ->where('document_id', $documentId)
                ->whereIn('parent_id', $queue)
                ->get();

            $childIds = $children->pluck('id')->map(fn ($v) => (string) $v)->all();
            $ids = array_merge($ids, $childIds);
            $queue = $childIds;
        }

        return $ids;
    }

    private function reorderSiblings($documentId, $parentId): void
    {
        $siblings = Item::where('document_id', $documentId)
            ->where('parent_id', $parentId)
            ->orderBy('sort_order')
            ->get();

        $this->bulkSetSortOrder($siblings);
    }

    /**
     * Persist consecutive sort_order values in a single round trip.
     *
     * Eloquent's save() issues one replaceOne per sibling, so reordering a large group used
     * to cost N sequential round trips (and timed out on serverless). bulkWrite collapses
     * that into one call while keeping the same field semantics.
     *
     * @param  \Illuminate\Support\Collection  $siblings  Already ordered models
     * @return int Number of operations sent
     */
    private function bulkSetSortOrder($siblings): int
    {
        $now = now();
        $ops = [];

        foreach (array_values($siblings->all()) as $index => $sibling) {
            $ops[] = [
                'updateOne' => [
                    [
                        '_id' => new ObjectId((string) $sibling->id),
                    ],
                    [
                        '$set' => [
                            'sort_order' => $index,
                            'updated_at' => $now,
                        ],
                    ],
                ],
            ];
        }

        if (empty($ops)) {
            return 0;
        }

        $this->itemsCollection()->bulkWrite($ops, ['ordered' => false]);

        return count($ops);
    }

    private function reorderAllSiblings($documentId): void
    {
        // Read the whole document once, then emit every group's writes in a single bulkWrite.
        $all = Item::where('document_id', $documentId)
            ->orderBy('parent_id')
            ->orderBy('sort_order')
            ->get();

        if ($all->isEmpty()) {
            return;
        }

        $now = now();
        $ops = [];
        $currentParent = null;
        $hasCurrent = false;
        $index = 0;

        foreach ($all as $item) {
            $parentKey = $item->parent_id ? (string) $item->parent_id : null;

            if (! $hasCurrent || $parentKey !== $currentParent) {
                $currentParent = $parentKey;
                $hasCurrent = true;
                $index = 0;
            }

            $ops[] = [
                'updateOne' => [
                    ['_id' => new ObjectId((string) $item->id)],
                    [
                        '$set' => [
                            'sort_order' => $index,
                            'updated_at' => $now,
                        ],
                    ],
                ],
            ];

            $index++;
        }

        $this->itemsCollection()->bulkWrite($ops, ['ordered' => false]);
    }

    private function moveToParentAfter($documentId, Item $item, $parentId, ?Item $anchor): void
    {
        $item->parent_id = $parentId ? (string) $parentId : null;
        $item->save();

        $siblings = Item::where('document_id', $documentId)
            ->where('parent_id', $item->parent_id)
            ->where('id', '!=', $item->id)
            ->orderBy('sort_order')
            ->get()
            ->values();

        $ordered = [];
        $inserted = false;
        foreach ($siblings as $sibling) {
            if (! $inserted && $anchor && (string) $sibling->id === (string) $anchor->id) {
                $ordered[] = $sibling;
                $ordered[] = $item;
                $inserted = true;
                continue;
            }
            $ordered[] = $sibling;
        }
        if (! $inserted) {
            $ordered[] = $item;
        }

        foreach ($ordered as $i => $sibling) {
            $sibling->sort_order = $i;
            $sibling->save();
        }
    }

    private function applyPosition($documentId, Item $item, $parentId, int $position): void
    {
        $siblings = Item::where('document_id', $documentId)
            ->where('parent_id', $parentId)
            ->where('id', '!=', $item->id)
            ->orderBy('sort_order')
            ->get()
            ->values();

        $targetIndex = min($position, $siblings->count());

        $ordered = [];
        foreach ($siblings as $i => $sibling) {
            if ($i === $targetIndex) {
                $ordered[] = $item;
            }
            $ordered[] = $sibling;
        }

        if ($targetIndex >= $siblings->count()) {
            $ordered[] = $item;
        }

        foreach ($ordered as $i => $node) {
            $node->sort_order = $i;
            $node->save();
        }
    }
}

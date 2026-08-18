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
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use MongoDB\BSON\ObjectId;
use MongoDB\BSON\Regex;

class ItemController extends Controller
{
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

    public function uploadImage(Request $request, $documentId)
    {
        $user = $request->user();
        $file = $request->file('image');

        if (! $file) {
            return response()->json(['status' => 'error', 'message' => 'No file received'], 422);
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
            'path' => ['required', 'string', 'max:500', 'regex:/^images\/[A-Za-z0-9._-]+$/'],
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
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $data = $request->validate([
            'content' => ['sometimes', 'nullable', 'string'],
            'note' => ['sometimes', 'nullable', 'string'],
            'checked' => ['sometimes', 'boolean'],
            'heading' => ['sometimes', 'integer', 'between:0,3'],
            'color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'bullet' => ['sometimes', 'string', 'in:bullet,checklist,numbered'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string'],
            'parent_id' => ['sometimes', 'nullable', 'string'],
        ]);

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

    protected function recordRevision(Item $item, array $data)
    {
        $tracked = ['content', 'note', 'checked', 'heading', 'color', 'bullet'];
        $changed = false;
        foreach ($tracked as $key) {
            if (array_key_exists($key, $data) && (string) ($data[$key] ?? '') !== (string) ($item->{$key} ?? '')) {
                $changed = true;
                break;
            }
        }
        if (! $changed) {
            return;
        }

        $count = ItemRevision::where('user_id', $item->user_id)
            ->where('item_id', (string) $item->id)
            ->count();

        if ($count >= 50) {
            ItemRevision::where('user_id', $item->user_id)
                ->where('item_id', (string) $item->id)
                ->orderBy('created_at')
                ->first()
                ?->delete();
        }

        ItemRevision::create([
            'user_id' => $item->user_id,
            'item_id' => (string) $item->id,
            'document_id' => (string) $item->document_id,
            'content' => (string) ($item->content ?? ''),
            'note' => (string) ($item->note ?? ''),
            'checked' => (bool) $item->checked,
            'heading' => (int) ($item->heading ?? 0),
            'color' => $item->color ?? null,
            'bullet' => $item->bullet ?? 'bullet',
        ]);
    }

    public function destroy(Request $request, $documentId, $id)
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

        $ids = $this->collectDescendantIds($documentId, $id);
        $ids[] = $id;

        Item::where('document_id', $documentId)->whereIn('id', $ids)->delete();

        Bookmark::where('target_type', 'item')->whereIn('target_id', $ids)->delete();

        $this->reorderSiblings($documentId, $item->parent_id);

        return response()->json([
            'status' => 'success',
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

        $item->parent_id = $parentId ?: null;
        $item->save();

        $this->reorderSiblings($documentId, $parentId ?: null);

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

        $parent = Item::find($item->parent_id);
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

        $index = 0;
        foreach ($children->get() as $child) {
            $child->sort_order = $index++;
            $child->save();
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Sorted',
        ]);
    }

    public function deleteChecked(Request $request, $documentId)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($documentId);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $checkedIds = Item::where('document_id', $documentId)
            ->where('checked', true)
            ->pluck('id')
            ->map(fn ($v) => (string) $v)
            ->all();

        $idsToDelete = $checkedIds;
        foreach ($checkedIds as $checkedId) {
            $idsToDelete = array_merge($idsToDelete, $this->collectDescendantIds($documentId, $checkedId));
        }

        Item::where('document_id', $documentId)->whereIn('id', $idsToDelete)->delete();

        Bookmark::where('target_type', 'item')->whereIn('target_id', array_unique($idsToDelete))->delete();

        $this->reorderAllSiblings($documentId);

        return response()->json([
            'status' => 'success',
            'message' => 'Checked items deleted',
            'deleted' => count(array_unique($idsToDelete)),
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
            foreach ($items as $item) {
                $item->content = str_ireplace($data['q'], $data['replace_with'] ?? '', $item->content);
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
        $ids = [];
        $queue = [$id];

        while (! empty($queue)) {
            $children = Item::where('document_id', $documentId)
                ->whereIn('parent_id', $queue)
                ->get();

            $childIds = $children->pluck('id')->map(fn ($v) => (string) $v)->all();
            $ids = array_merge($ids, $childIds);
            $queue = $childIds;
        }

        return $ids;
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
        $index = 0;
        foreach (Item::where('document_id', $documentId)->where('parent_id', $parentId)->orderBy('sort_order')->get() as $sibling) {
            $sibling->sort_order = $index++;
            $sibling->save();
        }
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

    private function reorderAllSiblings($documentId): void
    {
        $parents = Item::where('document_id', $documentId)->pluck('parent_id')->map(fn ($v) => $v ? (string) $v : null)->unique()->all();

        foreach ($parents as $parentId) {
            $this->reorderSiblings($documentId, $parentId);
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

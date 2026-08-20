<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Http\Controllers\ShareController;
use App\Models\Bookmark;
use App\Models\Document;
use App\Models\Item;
use App\Support\DocumentTransfer;
use App\Support\TreeBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DocumentController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $documents = Document::where('user_id', $user->id)
            ->orderBy('sort_order')
            ->get();

        $tree = TreeBuilder::build($documents);

        return response()->json([
            'status' => 'success',
            'data' => $tree,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'type' => ['required', 'in:document,folder'],
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => ['nullable', 'string'],
            'is_inbox' => ['sometimes', 'boolean'],
        ]);

        if (! empty($data['parent_id'])) {
            $parent = Document::where('user_id', $user->id)
                ->where('type', 'folder')
                ->find($data['parent_id']);

            if (! $parent) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Parent folder not found',
                ], 404);
            }
        }

        $data['user_id'] = $user->id;
        $data['parent_id'] = $data['parent_id'] ?? null;
        $data['sort_order'] = Document::where('user_id', $user->id)
            ->where('parent_id', $data['parent_id'])
            ->count();
        $data['settings'] = [];

        $document = Document::create($data);

        return response()->json([
            'status' => 'success',
            'message' => 'Document created',
            'data' => $document,
        ], 201);
    }

    public function show(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => $document,
        ]);
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'parent_id' => ['sometimes', 'nullable', 'string'],
            'is_inbox' => ['sometimes', 'boolean'],
            'color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'settings' => ['sometimes', 'array'],
        ]);

        if (array_key_exists('parent_id', $data)) {
            if (! empty($data['parent_id'])) {
                $parent = Document::where('user_id', $user->id)
                    ->where('type', 'folder')
                    ->find($data['parent_id']);

                if (! $parent || (string) $parent->id === $id) {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'Invalid parent folder',
                    ], 422);
                }
            }
            $data['parent_id'] = $data['parent_id'] ?: null;
        }

        $document->update($data);

        return response()->json([
            'status' => 'success',
            'message' => 'Document updated',
            'data' => $document->fresh(),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $ids = $this->collectDescendantIds($document);
        $ids[] = (string) $document->id;

        Item::whereIn('document_id', $ids)->each(function ($item) {
            $item->delete();
        });

        Bookmark::where('target_type', 'document')->whereIn('target_id', $ids)->delete();

        Document::whereIn('id', $ids)->each(function ($doc) {
            $doc->delete();
        });

        $this->reorderSiblings($user->id, $document->parent_id);

        return response()->json([
            'status' => 'success',
            'message' => 'Document deleted',
        ]);
    }

    public function trashed(Request $request)
    {
        $user = $request->user();

        $documents = Document::onlyTrashed()
            ->where('user_id', $user->id)
            ->orderByDesc('deleted_at')
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $documents,
        ]);
    }

    public function restoreTrashed(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::onlyTrashed()->where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found in trash',
            ], 404);
        }

        $ids = $this->collectDescendantIds($document, true);
        $ids[] = (string) $document->id;

        Document::onlyTrashed()->whereIn('id', $ids)->restore();
        Item::onlyTrashed()->whereIn('document_id', $ids)->restore();

        return response()->json([
            'status' => 'success',
            'message' => 'Document restored',
        ]);
    }

    public function forceDestroy(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::withTrashed()->where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $ids = $this->collectDescendantIds($document, true);
        $ids[] = (string) $document->id;

        $itemIds = Item::withTrashed()
            ->whereIn('document_id', $ids)
            ->get()
            ->pluck('id')
            ->map(fn ($v) => (string) $v)
            ->all();

        Item::withTrashed()->whereIn('document_id', $ids)->forceDelete();
        Bookmark::where('target_type', 'document')->whereIn('target_id', $ids)->delete();
        Bookmark::where('target_type', 'item')->whereIn('target_id', $itemIds)->delete();
        Document::withTrashed()->whereIn('id', $ids)->forceDelete();

        return response()->json([
            'status' => 'success',
            'message' => 'Document permanently deleted',
        ]);
    }

    public function showShare(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $token = $document->share_token;

        return response()->json([
            'status' => 'success',
            'data' => [
                'enabled' => ! empty($token),
                'share_token' => $token ? (string) $token : null,
                'share_url' => $token ? url('/share/'.$token) : null,
            ],
        ]);
    }

    public function updateShare(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        if ($data['enabled']) {
            if (empty($document->share_token)) {
                $document->share_token = Str::random(32);
            }
        } else {
            $document->share_token = null;
        }

        $document->save();

        $token = $document->share_token;

        return response()->json([
            'status' => 'success',
            'message' => $data['enabled'] ? 'Tautan berbagi diaktifkan' : 'Berbagi dimatikan',
            'data' => [
                'enabled' => ! empty($token),
                'share_token' => $token ? (string) $token : null,
                'share_url' => $token ? url('/share/'.$token) : null,
            ],
        ]);
    }

    public function showPublish(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $token = $document->publish_token;

        return response()->json([
            'status' => 'success',
            'data' => [
                'enabled' => ! empty($token),
                'password' => ! empty($document->publish_password),
                'publish_token' => $token ? (string) $token : null,
                'publish_url' => $token ? url('/publish/'.$token) : null,
            ],
        ]);
    }

    public function updatePublish(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'password' => ['nullable', 'string', 'max:255'],
        ]);

        if ($data['enabled']) {
            if (empty($document->publish_token)) {
                $document->publish_token = Str::random(32);
            }
            if (array_key_exists('password', $data)) {
                $password = trim((string) ($data['password'] ?? ''));
                $document->publish_password = $password === '' ? null : Hash::make($password);
            }
        } else {
            $document->publish_token = null;
            $document->publish_password = null;
        }

        $document->save();

        $token = $document->publish_token;

        return response()->json([
            'status' => 'success',
            'message' => $data['enabled'] ? 'Dokumen dipublikasikan' : 'Publikasi dimatikan',
            'data' => [
                'enabled' => ! empty($token),
                'password' => ! empty($document->publish_password),
                'publish_token' => $token ? (string) $token : null,
                'publish_url' => $token ? url('/publish/'.$token) : null,
            ],
        ]);
    }

    public function export(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'format' => ['required', 'in:markdown,opml,json'],
            'indent' => ['nullable', 'in:spaces,asterisks,dashes,none'],
            'hidden' => ['nullable', 'string'],
        ]);

        $itemId = $request->input('item_id') ?: null;
        $ordered = ShareController::buildOrdered($user->id, $document->id, $itemId);

        $hiddenRaw = json_decode((string) $request->input('hidden', '[]'), true);
        if (is_array($hiddenRaw) && count($hiddenRaw)) {
            $hiddenSet = [];
            foreach ($hiddenRaw as $h) {
                $hiddenSet[(string) $h] = true;
            }
            $remove = [];
            foreach ($ordered as $it) {
                $pid = (string) ($it->parent_id ?? '');
                if (isset($hiddenSet[(string) $it->id]) || ($remove[$pid] ?? false)) {
                    $remove[(string) $it->id] = true;
                }
            }
            $ordered = array_values(array_filter($ordered, fn ($it) => ! ($remove[(string) $it->id] ?? false)));
        }

        $indentStyle = $request->input('indent', 'spaces');

        switch ($data['format']) {
            case 'markdown':
                $content = DocumentTransfer::toMarkdown($document->name, $ordered, $indentStyle);
                $ext = 'md';
                break;
            case 'opml':
                $content = DocumentTransfer::toOpml($document->name, $ordered);
                $ext = 'opml';
                break;
            default:
                $content = DocumentTransfer::toJson($document->name, $ordered);
                $ext = 'json';
                break;
        }

        $nameBase = $document->name;
        if ($itemId !== null) {
            $rootItem = Item::where('user_id', $user->id)
                ->where('document_id', $document->id)
                ->find($itemId);
            if ($rootItem) {
                $clean = trim(preg_replace('/[#*_`=\[\]!@><~|]+/', '', (string) $rootItem->content));
                $nameBase = $clean !== '' ? $clean : $document->name;
            }
        }

        return response()->json([
            'status' => 'success',
            'data' => [
                'content' => $content,
                'filename' => preg_replace('/[^A-Za-z0-9_-]+/', '_', $nameBase).'.'.$ext,
            ],
        ]);
    }

    public function importDocument(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'format' => ['required', 'in:markdown,opml,json'],
            'content' => ['required', 'string'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $parsed = match ($data['format']) {
                'markdown' => DocumentTransfer::fromMarkdown($data['content']),
                'opml' => DocumentTransfer::fromOpml($data['content']),
                'json' => DocumentTransfer::fromJson($data['content']),
            };
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }

        $document = Document::create([
            'user_id' => $user->id,
            'type' => 'document',
            'name' => ($data['name'] ?? null) ?: ($parsed['title'] ?: 'Imported document'),
            'parent_id' => null,
            'sort_order' => Document::where('user_id', $user->id)->where('parent_id', null)->count(),
            'settings' => [],
        ]);

        $this->insertItems($user->id, $document->id, null, $parsed['items']);

        return response()->json([
            'status' => 'success',
            'message' => 'Dokumen berhasil diimpor',
            'data' => $document->fresh(),
        ], 201);
    }

    private function insertItems($userId, $documentId, $parentId, array $items): void
    {
        $index = 0;
        foreach ($items as $node) {
            $item = Item::create([
                'user_id' => $userId,
                'document_id' => $documentId,
                'parent_id' => $parentId,
                'content' => $node['content'],
                'note' => $node['note'],
                'checked' => (bool) $node['checked'],
                'heading' => (int) $node['heading'],
                'color' => $node['color'],
                'bullet' => $node['bullet'],
                'sort_order' => $index++,
            ]);

            if (! empty($node['children'])) {
                $this->insertItems($userId, $documentId, $item->id, $node['children']);
            }
        }
    }

    public function move(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'parent_id' => ['nullable', 'string'],
            'position' => ['sometimes', 'integer', 'min:0'],
        ]);

        $parentId = $data['parent_id'] ?? null;

        if (! empty($parentId)) {
            $parent = Document::where('user_id', $user->id)
                ->where('type', 'folder')
                ->find($parentId);

            if (! $parent || in_array((string) $parent->id, $this->collectDescendantIds($document), true)) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Invalid parent folder',
                ], 422);
            }
        }

        $oldParentId = $document->parent_id;

        $document->parent_id = $parentId ?: null;
        $document->save();

        $this->reorderSiblings($user->id, $parentId);
        if ($oldParentId && (string) $oldParentId !== (string) ($parentId ?: null)) {
            $this->reorderSiblings($user->id, $oldParentId);
        }

        if (isset($data['position'])) {
            $this->applyPosition($user->id, $document, $parentId, $data['position']);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Document moved',
            'data' => $document->fresh(),
        ]);
    }

    public function setInbox(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'is_inbox' => ['sometimes', 'boolean'],
        ]);

        $isInbox = $data['is_inbox'] ?? true;

        if ($isInbox) {
            Document::where('user_id', $user->id)
                ->where('is_inbox', true)
                ->update(['is_inbox' => false]);
        }

        $document->is_inbox = $isInbox;
        $document->save();

        return response()->json([
            'status' => 'success',
            'message' => $isInbox ? 'Set as inbox' : 'Inbox removed',
            'data' => $document->fresh(),
        ]);
    }

    public function sort(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $data = $request->validate([
            'order' => ['required', 'in:name_asc,name_desc,created_asc,created_desc'],
        ]);

        $siblings = Document::where('user_id', $user->id)
            ->where('parent_id', $document->parent_id);

        switch ($data['order']) {
            case 'name_asc':
                $siblings->orderBy('name');
                break;
            case 'name_desc':
                $siblings->orderByDesc('name');
                break;
            case 'created_asc':
                $siblings->orderBy('created_at');
                break;
            case 'created_desc':
                $siblings->orderByDesc('created_at');
                break;
        }

        $index = 0;
        foreach ($siblings->get() as $sibling) {
            $sibling->sort_order = $index++;
            $sibling->save();
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Sorted',
        ]);
    }

    public function sortAll(Request $request)
    {
        $user = $request->user();

        $documents = Document::where('user_id', $user->id)->get();

        foreach ($documents->groupBy('parent_id') as $group) {
            $sorted = $group->sortBy(fn ($d) => mb_strtolower((string) $d->name))->values();

            foreach ($sorted as $index => $d) {
                $d->sort_order = $index;
                $d->save();
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Sorted alphabetically',
        ]);
    }

    public function copy(Request $request, $id)
    {
        $user = $request->user();

        $document = Document::where('user_id', $user->id)->find($id);

        if (! $document || $document->type !== 'document') {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $newDoc = Document::create([
            'user_id' => $user->id,
            'type' => 'document',
            'name' => $document->name.' copy',
            'parent_id' => $document->parent_id,
            'color' => $document->color,
            'sort_order' => Document::where('user_id', $user->id)
                ->where('parent_id', $document->parent_id)
                ->count(),
            'settings' => [],
        ]);

        // Item dibuat dalam dua pass: pass pertama membuat salinan tanpa parent
        // (agar id baru tersedia), pass kedua menautkan parent_id dengan id baru.
        $items = Item::where('user_id', $user->id)
            ->where('document_id', $document->id)
            ->get();

        $idMap = [];

        foreach ($items as $item) {
            $idMap[(string) $item->id] = (string) Item::create([
                'user_id' => $user->id,
                'document_id' => $newDoc->id,
                'parent_id' => null,
                'content' => $item->content,
                'note' => $item->note,
                'checked' => (bool) $item->checked,
                'heading' => (int) $item->heading,
                'color' => $item->color,
                'bullet' => $item->bullet,
                'tags' => $item->tags,
                'sort_order' => (int) $item->sort_order,
            ])->id;
        }

        foreach ($items as $item) {
            if ($item->parent_id) {
                $copy = Item::find($idMap[(string) $item->id]);
                $copy->parent_id = $idMap[(string) $item->parent_id] ?? null;
                $copy->save();
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Document copied',
            'data' => $newDoc,
        ], 201);
    }

    private function collectDescendantIds(Document $document, bool $withTrashed = false): array
    {
        $ids = [];
        $queue = [$document->id];

        while (! empty($queue)) {
            $query = Document::whereIn('parent_id', $queue);
            if ($withTrashed) {
                $query = $query->withTrashed();
            }
            $children = $query->get();
            $ids = array_merge($ids, $children->pluck('id')->map(fn ($v) => (string) $v)->all());
            $queue = $children->pluck('id')->map(fn ($v) => (string) $v)->all();
        }

        return $ids;
    }

    private function reorderSiblings($userId, $parentId): void
    {
        $index = 0;
        foreach (Document::where('user_id', $userId)->where('parent_id', $parentId)->orderBy('sort_order')->get() as $doc) {
            $doc->sort_order = $index++;
            $doc->save();
        }
    }

    private function applyPosition($userId, Document $document, $parentId, int $position): void
    {
        $siblings = Document::where('user_id', $userId)
            ->where('parent_id', $parentId)
            ->where('id', '!=', $document->id)
            ->orderBy('sort_order')
            ->get()
            ->values();

        $targetIndex = min($position, $siblings->count());

        $ordered = [];
        foreach ($siblings as $i => $sibling) {
            if ($i === $targetIndex) {
                $ordered[] = $document;
            }
            $ordered[] = $sibling;
        }

        if ($targetIndex >= $siblings->count()) {
            $ordered[] = $document;
        }

        foreach ($ordered as $i => $node) {
            $node->sort_order = $i;
            $node->save();
        }
    }
}

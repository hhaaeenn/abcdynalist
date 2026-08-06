<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\Item;
use Illuminate\Http\Request;

class QuickFinderController extends Controller
{
    public function search(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'q' => ['required', 'string', 'max:255'],
            'include_items' => ['sometimes', 'in:true,false,1,0'],
        ]);

        $q = preg_quote($data['q'], '/');

        $documents = Document::where('user_id', $user->id)
            ->whereRaw([
                'name' => new \MongoDB\BSON\Regex($q, 'i'),
            ])
            ->orderBy('name')
            ->take(20)
            ->get();

        $result = $documents->map(fn ($doc) => [
            'type' => $doc->type,
            'id' => (string) $doc->id,
            'name' => $doc->name,
            'parent_id' => $doc->parent_id ? (string) $doc->parent_id : null,
        ])->values();

        $bookmarkIds = \App\Models\Bookmark::where('user_id', $user->id)
            ->where('target_type', 'item')
            ->pluck('target_id')
            ->map(fn ($v) => (string) $v)
            ->all();

        $docsById = Document::where('user_id', $user->id)->get()->keyBy(fn ($d) => (string) $d->id);

        $candidates = Item::where('user_id', $user->id)
            ->whereRaw([
                'content' => new \MongoDB\BSON\Regex($q, 'i'),
            ])
            ->take(100)
            ->get();

        foreach ($candidates as $item) {
            if (! in_array((string) $item->id, $bookmarkIds, true)) {
                continue;
            }
            $result->push([
                'type' => 'item',
                'id' => (string) $item->id,
                'name' => $item->content,
                'document_id' => (string) $item->document_id,
                'document_name' => isset($docsById[$item->document_id]) ? $docsById[$item->document_id]->name : 'Tanpa judul',
                'bookmarked' => true,
            ]);
        }

        if (! empty($data['include_items']) && $data['include_items'] !== 'false' && $data['include_items'] !== '0') {
            $items = Item::where('user_id', $user->id)
                ->whereRaw([
                    'content' => new \MongoDB\BSON\Regex($q, 'i'),
                ])
                ->orderBy('content')
                ->take(20)
                ->get();

            foreach ($items as $item) {
                $result->push([
                    'type' => 'item',
                    'id' => (string) $item->id,
                    'name' => $item->content,
                    'document_id' => (string) $item->document_id,
                    'document_name' => isset($docsById[$item->document_id]) ? $docsById[$item->document_id]->name : 'Tanpa judul',
                ]);
            }
        }

        return response()->json([
            'status' => 'success',
            'data' => $result,
        ]);
    }

    public function items(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'q' => ['required', 'string', 'max:255'],
        ]);

        $q = preg_quote($data['q'], '/');

        $items = Item::where('user_id', $user->id)
            ->whereRaw([
                'content' => new \MongoDB\BSON\Regex($q, 'i'),
            ])
            ->orderBy('content')
            ->take(30)
            ->get();

        $docs = Document::where('user_id', $user->id)
            ->whereIn('id', $items->pluck('document_id')->unique()->all() ?: [''])
            ->get()
            ->keyBy('id');

        $result = $items->map(fn ($it) => [
            'id' => (string) $it->id,
            'content' => $it->content,
            'document_id' => (string) $it->document_id,
            'document_name' => isset($docs[$it->document_id]) ? $docs[$it->document_id]->name : 'Tanpa judul',
            'checked' => (bool) $it->checked,
        ])->values();

        return response()->json([
            'status' => 'success',
            'data' => $result,
        ]);
    }

    public function locate(Request $request, $id)
    {
        $user = $request->user();

        $item = Item::where('user_id', $user->id)->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $doc = Document::where('user_id', $user->id)->find($item->document_id);

        return response()->json([
            'status' => 'success',
            'data' => [
                'id' => (string) $item->id,
                'document_id' => (string) $item->document_id,
                'document_name' => $doc ? $doc->name : 'Tanpa judul',
                'content' => $item->content,
            ],
        ]);
    }

    public function bookmarks(Request $request)
    {
        $user = $request->user();

        $documents = Document::where('user_id', $user->id)
            ->whereIn('id', \App\Models\Bookmark::where('user_id', $user->id)
                ->where('target_type', 'document')
                ->pluck('target_id')
                ->map(fn ($v) => (string) $v)
                ->all() ?: [''])
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $documents,
        ]);
    }

    public function tags(Request $request)
    {
        $user = $request->user();

        $items = Item::where('user_id', $user->id)
            ->whereRaw([
                'content' => new \MongoDB\BSON\Regex('#[A-Za-z0-9_-]+', 'i'),
            ])
            ->get(['content']);

        $map = [];
        foreach ($items as $item) {
            preg_match_all('/#[A-Za-z0-9_-]+/', $item->content, $matches);
            foreach ($matches[0] as $tag) {
                $key = mb_strtolower($tag);
                $map[$key] = ($map[$key] ?? 0) + 1;
            }
        }

        arsort($map);

        $data = collect($map)
            ->map(fn ($count, $tag) => ['tag' => $tag, 'count' => $count])
            ->values();

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    public function tagItems(Request $request, $tag)
    {
        $user = $request->user();

        $pattern = preg_quote($tag, '/');
        $pattern = str_replace('\\#', '#', $pattern);

        $items = Item::where('user_id', $user->id)
            ->whereRaw([
                'content' => new \MongoDB\BSON\Regex($pattern, 'i'),
            ])
            ->orderBy('content')
            ->take(300)
            ->get();

        $docs = Document::where('user_id', $user->id)
            ->whereIn('id', $items->pluck('document_id')->unique()->all() ?: [''])
            ->get()
            ->keyBy('id');

        $data = $items->map(fn ($it) => [
            'id' => (string) $it->id,
            'document_id' => (string) $it->document_id,
            'document_name' => isset($docs[$it->document_id]) ? $docs[$it->document_id]->name : 'Tanpa judul',
            'content' => $it->content,
            'checked' => (bool) $it->checked,
        ]);

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }
}

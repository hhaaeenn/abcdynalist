<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\Item;
use Illuminate\Http\Request;

class BacklinkController extends Controller
{
    public function index(Request $request, $id)
    {
        $user = $request->user();

        $item = Item::where('user_id', $user->id)->find($id);

        if (! $item) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item not found',
            ], 404);
        }

        $esc = preg_quote((string) $id, '/');
        $pattern = '\\|' . $esc . '\]\]';

        $links = Item::where('user_id', $user->id)
            ->whereRaw([
                'content' => new \MongoDB\BSON\Regex($pattern, 'i'),
            ])
            ->take(50)
            ->get();

        $docs = Document::where('user_id', $user->id)
            ->whereIn('id', $links->pluck('document_id')->unique()->all() ?: [''])
            ->get()
            ->keyBy('id');

        $data = $links->map(function ($it) use ($docs, $id) {
            preg_match('/\[\[([^\]|]*)\|' . preg_quote((string) $id, '/') . '\]\]/', $it->content, $m);
            return [
                'id' => (string) $it->id,
                'label' => isset($m[1]) ? trim($m[1]) : '',
                'content' => $it->content,
                'document_id' => (string) $it->document_id,
                'document_name' => isset($docs[$it->document_id]) ? $docs[$it->document_id]->name : 'Tanpa judul',
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    public function counts(Request $request, $documentId)
    {
        $user = $request->user();

        $doc = Document::where('user_id', $user->id)->find($documentId);

        if (! $doc) {
            return response()->json([
                'status' => 'error',
                'message' => 'Document not found',
            ], 404);
        }

        $ids = Item::where('user_id', $user->id)
            ->where('document_id', $documentId)
            ->get(['id'])
            ->pluck('id')
            ->map(fn ($v) => (string) $v)
            ->all();

        if (! $ids) {
            return response()->json([
                'status' => 'success',
                'data' => (object) [],
            ]);
        }

        $refs = Item::where('user_id', $user->id)
            ->whereRaw([
                'content' => new \MongoDB\BSON\Regex('\]\]', 'i'),
            ])
            ->get(['content']);

        $counts = [];
        foreach ($refs as $it) {
            preg_match_all('/\[\[[^\]]*\|([A-Za-z0-9]+)\]\]/', (string) $it->content, $m);
            foreach ($m[1] as $target) {
                if (in_array($target, $ids, true)) {
                    $counts[$target] = ($counts[$target] ?? 0) + 1;
                }
            }
        }

        return response()->json([
            'status' => 'success',
            'data' => $counts,
        ]);
    }
}

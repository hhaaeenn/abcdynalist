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
}

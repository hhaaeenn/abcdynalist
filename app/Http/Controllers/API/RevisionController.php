<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\ItemRevision;
use Illuminate\Http\Request;

class RevisionController extends Controller
{
    public function index(Request $request, $documentId, $id)
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

        $revisions = ItemRevision::where('user_id', $user->id)
            ->where('item_id', (string) $id)
            ->orderByDesc('created_at')
            ->take(50)
            ->get()
            ->map(fn ($r) => [
                'id' => (string) $r->id,
                'content' => (string) ($r->content ?? ''),
                'note' => (string) ($r->note ?? ''),
                'checked' => (bool) $r->checked,
                'heading' => (int) ($r->heading ?? 0),
                'color' => $r->color,
                'bullet' => $r->bullet,
                'created_at' => optional($r->created_at)->toDateTimeString(),
            ]);

        return response()->json([
            'status' => 'success',
            'data' => $revisions->values(),
        ]);
    }

    public function restore(Request $request, $documentId, $id, $revisionId)
    {
        $user = $request->user();

        $item = Item::where('document_id', $documentId)
            ->where('user_id', $user->id)
            ->find($id);

        $revision = ItemRevision::where('user_id', $user->id)
            ->where('item_id', (string) $id)
            ->find($revisionId);

        if (! $item || ! $revision) {
            return response()->json([
                'status' => 'error',
                'message' => 'Item or revision not found',
            ], 404);
        }

        $item->update([
            'content' => (string) ($revision->content ?? ''),
            'note' => (string) ($revision->note ?? ''),
            'checked' => (bool) $revision->checked,
            'heading' => (int) ($revision->heading ?? 0),
            'color' => $revision->color,
            'bullet' => $revision->bullet ?? 'bullet',
        ]);

        $revision->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Item restored from revision',
            'data' => $item->fresh(),
        ]);
    }
}

<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Bookmark;
use App\Models\Document;
use App\Models\Item;
use Illuminate\Http\Request;

class BookmarkController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $bookmarks = Bookmark::where('user_id', $user->id)->orderByDesc('created_at')->get();

        $data = [];
        foreach ($bookmarks as $bookmark) {
            if ($bookmark->target_type === 'document') {
                $target = Document::where('user_id', $user->id)->find($bookmark->target_id);
                if (! $target) {
                    continue;
                }

                $data[] = [
                    'id' => (string) $bookmark->id,
                    'type' => 'document',
                    'target_id' => (string) $bookmark->target_id,
                    'name' => $target->name,
                    'is_inbox' => (bool) $target->is_inbox,
                ];

                continue;
            }

            $target = Item::where('user_id', $user->id)->find($bookmark->target_id);
            if (! $target) {
                continue;
            }

            $doc = Document::where('user_id', $user->id)->find($target->document_id);

            $data[] = [
                'id' => (string) $bookmark->id,
                'type' => 'item',
                'target_id' => (string) $bookmark->target_id,
                'content' => $target->content,
                'document_id' => (string) $target->document_id,
                'document_name' => $doc ? $doc->name : 'Tanpa judul',
            ];
        }

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'target_type' => ['required', 'in:document,item'],
            'target_id' => ['required', 'string'],
        ]);

        if ($data['target_type'] === 'document') {
            $target = Document::where('user_id', $user->id)->find($data['target_id']);
        } else {
            $target = Item::where('user_id', $user->id)->find($data['target_id']);
        }

        if (! $target) {
            return response()->json([
                'status' => 'error',
                'message' => 'Target not found',
            ], 404);
        }

        $existing = Bookmark::where('user_id', $user->id)
            ->where('target_type', $data['target_type'])
            ->where('target_id', $data['target_id'])
            ->first();

        if ($existing) {
            return response()->json([
                'status' => 'success',
                'message' => 'Already bookmarked',
                'data' => $existing,
            ]);
        }

        $bookmark = Bookmark::create([
            'user_id' => $user->id,
            'target_type' => $data['target_type'],
            'target_id' => $data['target_id'],
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Bookmarked',
            'data' => $bookmark,
        ], 201);
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();

        $bookmark = Bookmark::where('user_id', $user->id)->find($id);

        if (! $bookmark) {
            return response()->json([
                'status' => 'error',
                'message' => 'Bookmark not found',
            ], 404);
        }

        $bookmark->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Bookmark removed',
        ]);
    }
}

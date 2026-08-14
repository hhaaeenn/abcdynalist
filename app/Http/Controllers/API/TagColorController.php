<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\TagColor;
use Illuminate\Http\Request;

class TagColorController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $colors = TagColor::where('user_id', $user->id)
            ->get(['tag', 'color'])
            ->map(fn ($c) => ['tag' => $c->tag, 'color' => $c->color])
            ->values();

        return response()->json([
            'status' => 'success',
            'data' => $colors,
        ]);
    }

    public function update(Request $request, $tag)
    {
        $data = $request->validate([
            'color' => ['nullable', 'string', 'max:50'],
        ]);

        $key = mb_strtolower(ltrim($tag, '#'));

        if (empty($data['color'])) {
            TagColor::where('user_id', $request->user()->id)
                ->where('tag', $key)
                ->delete();
        } else {
            TagColor::updateOrCreate(
                ['user_id' => $request->user()->id, 'tag' => $key],
                ['color' => $data['color']]
            );
        }

        return response()->json([
            'status' => 'success',
            'data' => ['tag' => $key, 'color' => $data['color'] ?? null],
        ]);
    }
}

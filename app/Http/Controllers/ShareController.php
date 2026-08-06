<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\Item;

class ShareController extends Controller
{
    public static function buildOrdered($userId, $documentId): array
    {
        $items = Item::where('user_id', $userId)
            ->where('document_id', $documentId)
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($i) => (object) [
                'id' => (string) $i->id,
                'parent_id' => $i->parent_id ? (string) $i->parent_id : null,
                'content' => (string) ($i->content ?? ''),
                'note' => (string) ($i->note ?? ''),
                'checked' => (bool) $i->checked,
                'heading' => (int) ($i->heading ?? 0),
                'color' => $i->color ? (string) $i->color : null,
                'bullet' => (string) ($i->bullet ?? 'bullet'),
            ])
            ->values()
            ->all();

        $byParent = [];
        foreach ($items as $item) {
            $byParent[$item->parent_id ?? ''] = $byParent[$item->parent_id ?? ''] ?? [];
            $byParent[$item->parent_id ?? ''][] = $item;
        }

        $ordered = [];
        $walk = function ($parentId, $depth, $parentCounters) use (&$walk, &$ordered, &$byParent) {
            $i = 1;
            foreach (($byParent[$parentId] ?? []) as $item) {
                $item->depth = $depth;
                $item->num = $i;
                $item->parentCounters = $parentCounters;
                $ordered[] = $item;
                $walk($item->id, $depth + 1, array_merge($parentCounters, [$i]));
                $i++;
            }
        };
        $walk('', 0, []);

        return $ordered;
    }

    public function view($token)
    {
        $document = Document::where('share_token', $token)->first();

        if (! $document) {
            abort(404);
        }

        return view('share', [
            'document' => $document,
            'ordered' => self::buildOrdered($document->user_id, $document->id),
        ]);
    }

    public static function renderContent(string $content): string
    {
        $html = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');

        $html = preg_replace('/`([^`]+)`/', '<code>$1</code>', $html);
        $html = preg_replace('/~~([^~]+)~~/', '<del>$1</del>', $html);
        $html = preg_replace('/==([^=\n]+)==/', '<mark>$1</mark>', $html);
        $html = preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $html);
        $html = preg_replace('/__([^_\n]+)__/', '<em>$1</em>', $html);
        $html = preg_replace('/(^|[^*])\*([^*\n]+)\*/', '$1<em>$2</em>', $html);
        $html = preg_replace('/(^|[^#!])([!@]\d{4}-\d{2}-\d{2})/', '$1<span class="sh-date">$2</span>', $html);
        $html = preg_replace('/(^|[^#])(#[A-Za-z0-9_-]+)/', '$1<span class="sh-tag">$2</span>', $html);
        $html = preg_replace('/\[([^\]\n]+)\]\(([^)\s]+)\)/', '<a href="$2" target="_blank" rel="noopener" class="sh-link">$1</a>', $html);
        $html = preg_replace('/\[\[([^\]|]+)\|([^\]]+)\]\]/', '<span class="sh-internal">$1</span>', $html);
        $html = preg_replace('/\n/', '<br>', $html);

        return $html;
    }
}

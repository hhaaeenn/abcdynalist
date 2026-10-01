<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\Item;

class ShareController extends Controller
{
    public static function descendantDocuments($userId, $folderId): array
    {
        $out = [];
        $children = Document::where('user_id', $userId)
            ->where('parent_id', $folderId)
            ->orderBy('sort_order')
            ->get();

        foreach ($children as $child) {
            if ($child->type === 'document') {
                $out[] = ['id' => (string) $child->id, 'name' => (string) ($child->name ?? 'Tanpa judul')];
            } elseif ($child->type === 'folder') {
                $out = array_merge($out, self::descendantDocuments($userId, (string) $child->id));
            }
        }

        return $out;
    }

    public static function buildOrdered($userId, $documentId, $rootId = null, $docName = null): array
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
                'doc_id' => (string) $documentId,
                'doc_name' => $docName,
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

        if ($rootId !== null) {
            $root = collect($items)->firstWhere('id', (string) $rootId);
            if ($root) {
                $root->depth = 0;
                $root->num = 1;
                $root->parentCounters = [];
                $ordered[] = $root;
                $walk($root->id, 1, [1]);
            }
        } else {
            $walk('', 0, []);
        }

        return $ordered;
    }

    public static function buildFolderOrdered($userId, $folderId): array
    {
        $docs = self::descendantDocuments($userId, (string) $folderId);
        $ordered = [];
        foreach ($docs as $doc) {
            $ordered = array_merge($ordered, self::buildOrdered($userId, $doc['id'], null, $doc['name']));
        }

        return $ordered;
    }

    public function view($token)
    {
        $document = Document::where('share_token', $token)->first();

        if (! $document) {
            abort(404);
        }

        $isFolder = $document->type === 'folder';

        return view('share', [
            'document' => $document,
            'isFolder' => $isFolder,
            'ordered' => $isFolder
                ? self::buildFolderOrdered($document->user_id, $document->id)
                : self::buildOrdered($document->user_id, $document->id),
        ]);
    }

    public static function renderContent(string $content): string
    {
        $html = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');

        // URL gambar/storage absolut (mis. http://localhost:8000/storage/...) diubah
        // menjadi path relatif agar ikut host yang sedang membuka halaman share/publish,
        // sehingga pemirsa dari luar jaringan tetap bisa memuat gambarnya.
        $html = preg_replace('#https?://[^/\s"\'()]+?/storage/#', '/storage/', $html);

        $html = preg_replace('/`([^`]+)`/', '<code>$1</code>', $html);
        $html = preg_replace('/~~([^~]+)~~/', '<del>$1</del>', $html);
        $html = preg_replace('/==([^=\n]+)==/', '<mark>$1</mark>', $html);
        $html = preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $html);
        $html = preg_replace('/__([^_\n]+)__/', '<em>$1</em>', $html);
        $html = preg_replace('/(^|[^*])\*([^*\n]+)\*/', '$1<em>$2</em>', $html);
        $html = preg_replace('/(^|[^#!])([!@]\d{4}-\d{2}-\d{2})/', '$1<span class="sh-date">$2</span>', $html);
        $html = preg_replace('/(^|[^#])(#[A-Za-z0-9_-]+)/', '$1<span class="sh-tag">$2</span>', $html);
        // Only turn a markdown link/image into a real <a>/<img> when its URL is http(s),
        // mailto, or relative -- otherwise leave the markdown source as plain (already
        // escaped) text. This is a public, unauthenticated page anyone with the link can
        // open, so a javascript: URL here would run in a visitor's browser the moment they
        // clicked what looks like an ordinary link.
        $isSafeUrl = function (string $url): bool {
            $url = trim(html_entity_decode($url, ENT_QUOTES, 'UTF-8'));
            if ($url === '') {
                return false;
            }
            if ($url[0] === '/' || $url[0] === '#') {
                return true;
            }

            return (bool) preg_match('/^(https?|mailto):/i', $url);
        };
        $html = preg_replace_callback('/!\[([^\]]*)\]\(([^)\s]+)\)/', function ($m) use ($isSafeUrl) {
            return $isSafeUrl($m[2]) ? '<img src="'.$m[2].'" alt="'.$m[1].'" class="sh-img" loading="lazy">' : $m[0];
        }, $html);
        $html = preg_replace_callback('/\[([^\]\n]+)\]\(([^)\s]+)\)/', function ($m) use ($isSafeUrl) {
            return $isSafeUrl($m[2]) ? '<a href="'.$m[2].'" target="_blank" rel="noopener" class="sh-link">'.$m[1].'</a>' : $m[0];
        }, $html);
        $html = preg_replace('/\[\[([^\]|]+)\|([^\]]+)\]\]/', '<span class="sh-internal">$1</span>', $html);
        $html = preg_replace('/\n/', '<br>', $html);

        return $html;
    }
}

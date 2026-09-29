<?php

namespace App\Support;

use Illuminate\Support\Collection;

class TreeBuilder
{
    /**
     * Build a nested tree from a flat list of models that have `id`, `parent_id` and `sort_order`.
     *
     * @param  Collection|\Illuminate\Database\Eloquent\Collection  $items
     * @param  string|null  $parentId  Filter tree root by a specific parent (null = all roots)
     * @param  bool  $withChildren  Include children key even when empty
     */
    public static function build(Collection $items, ?string $parentId = null, bool $withChildren = true): array
    {
        $map = [];
        foreach ($items as $item) {
            $map[$item->id] = $item;
        }

        $tree = [];
        $children = [];
        foreach ($map as $id => $node) {
            $nodeId = $node->parent_id ? (string) $node->parent_id : null;

            if ($parentId !== null && $nodeId !== $parentId) {
                continue;
            }

            if ($nodeId !== null && isset($map[$nodeId])) {
                $children[$nodeId][] = $node;
            } else {
                $tree[] = $node;
            }
        }

        $visited = [];
        $maxDepth = 1000;

        $attach = function (array $nodes, int $depth = 0) use (&$attach, &$children, $withChildren, &$visited, $maxDepth) {
            if ($depth > $maxDepth) {
                return [];
            }

            $result = [];
            foreach (self::sortNodes($nodes) as $node) {
                $nodeId = (string) $node->id;

                // Cycle detection
                if (isset($visited[$nodeId])) {
                    continue;
                }
                $visited[$nodeId] = true;

                $sub = $children[$nodeId] ?? [];
                if ($sub) {
                    $node->children = $attach($sub, $depth + 1);
                } elseif ($withChildren) {
                    $node->children = [];
                }
                $result[] = $node;
            }

            return $result;
        };

        return $attach($tree);
    }

    private static function sortNodes(array $nodes): array
    {
        usort($nodes, function ($a, $b) {
            return ($a->sort_order ?? 0) <=> ($b->sort_order ?? 0);
        });

        return array_values($nodes);
    }
}

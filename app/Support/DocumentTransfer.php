<?php

namespace App\Support;

class DocumentTransfer
{
    /**
     * @param  array  $ordered  Flat DFS list from ShareController::buildOrdered
     */
    public static function toMarkdown(string $title, array $ordered): string
    {
        $lines = ["# ".$title, ''];

        foreach ($ordered as $item) {
            $indent = str_repeat('  ', $item->depth);
            $prefix = self::bulletPrefix($item);

            $lines[] = $indent.$prefix.$item->content;

            if ($item->note !== '') {
                $lines[] = $indent.'    > '.str_replace("\n", "\n".$indent.'    > ', $item->note);
            }
        }

        return implode("\n", $lines)."\n";
    }

    public static function fromMarkdown(string $text): array
    {
        $root = (object) ['children' => []];
        $stack = []; // ['depth' => int, 'node' => stdClass]
        $prev = null;
        $title = null;

        foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
            if (preg_match('/^\s*>\s?(.*)$/', $line, $m)) {
                if ($prev !== null) {
                    $prev->note .= ($prev->note !== '' ? "\n" : '').$m[1];
                }
                continue;
            }

            $depth = intdiv(strlen($line) - strlen(ltrim($line)), 2);
            $trimmed = ltrim($line);

            if ($trimmed === '') {
                continue;
            }

            if ($title === null && $depth === 0 && preg_match('/^#\s+(.*)$/', $trimmed, $m)) {
                $title = $m[1];
                continue;
            }

            $node = (object) ['content' => '', 'note' => '', 'checked' => false, 'heading' => 0, 'color' => null, 'bullet' => 'bullet', 'children' => []];

            if (preg_match('/^#{2,6}\s+(.*)$/', $trimmed, $m)) {
                $node->heading = strlen($m[0]) - strlen(ltrim($m[0], '#'));
                $node->bullet = 'bullet';
                $node->content = $m[1];
            } elseif (preg_match('/^[-*+]\s+\[([ xX])\]\s+(.*)$/', $trimmed, $m)) {
                $node->bullet = 'checklist';
                $node->checked = strtolower($m[1]) === 'x';
                $node->content = $m[2];
            } elseif (preg_match('/^[-*+]\s+(.*)$/', $trimmed, $m)) {
                $node->bullet = 'bullet';
                $node->content = $m[1];
            } elseif (preg_match('/^\d+[.)]\s+(.*)$/', $trimmed, $m)) {
                $node->bullet = 'numbered';
                $node->content = $m[1];
            } else {
                $node->bullet = 'bullet';
                $node->content = $trimmed;
            }

            while (! empty($stack) && $stack[count($stack) - 1]['depth'] >= $depth) {
                array_pop($stack);
            }

            if (empty($stack)) {
                $root->children[] = $node;
            } else {
                $stack[count($stack) - 1]['node']->children[] = $node;
            }

            $stack[] = ['depth' => $depth, 'node' => $node];
            $prev = $node;
        }

        return ['title' => $title ?? 'Imported document', 'items' => self::objToArray($root->children)];
    }

    private static function objToArray(array $nodes): array
    {
        $result = [];
        foreach ($nodes as $node) {
            $result[] = [
                'content' => $node->content,
                'note' => $node->note,
                'checked' => $node->checked,
                'heading' => $node->heading,
                'color' => $node->color,
                'bullet' => $node->bullet,
                'children' => self::objToArray($node->children),
            ];
        }

        return $result;
    }

    public static function toOpml(string $title, array $ordered): string
    {
        $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
        $xml .= "<opml version=\"2.0\">\n";
        $xml .= "  <head>\n    <title>".self::xmlEsc($title)."</title>\n  </head>\n";
        $xml .= "  <body>\n";

        foreach ($ordered as $item) {
            $xml .= self::outlineXml($item, 2);
        }

        $xml .= "  </body>\n</opml>\n";

        return $xml;
    }

    private static function outlineXml($item, int $indent): string
    {
        $pad = str_repeat('  ', $indent);
        $attrs = 'text="'.self::xmlEsc($item->content).'"';

        if ($item->note !== '') {
            $attrs .= ' _note="'.self::xmlEsc($item->note).'"';
        }
        if ($item->checked) {
            $attrs .= ' _checked="true"';
        }
        if ($item->heading > 0) {
            $attrs .= ' _heading="'.(int) $item->heading.'"';
        }
        if ($item->bullet && $item->bullet !== 'checklist') {
            $attrs .= ' _bullet="'.self::xmlEsc($item->bullet).'"';
        }

        return $pad.'<outline '.$attrs."/>\n";
    }

    public static function fromOpml(string $text): array
    {
        $prev = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($text);
        libxml_use_internal_errors($prev);

        if ($xml === false) {
            throw new \InvalidArgumentException('File OPML tidak valid.');
        }

        $title = isset($xml->head->title) ? trim((string) $xml->head->title) : 'Imported document';
        $items = [];

        if (isset($xml->body->outline)) {
            foreach ($xml->body->outline as $outline) {
                $items[] = self::outlineNode($outline);
            }
        }

        return ['title' => $title, 'items' => $items];
    }

    private static function outlineNode($outline): array
    {
        $node = [
            'content' => (string) ($outline['text'] ?? ''),
            'note' => (string) ($outline['_note'] ?? ''),
            'checked' => strtolower((string) ($outline['_checked'] ?? 'false')) === 'true',
            'heading' => (int) ($outline['_heading'] ?? 0),
            'color' => null,
            'bullet' => (string) ($outline['_bullet'] ?? 'bullet'),
            'children' => [],
        ];

        foreach ($outline->outline as $child) {
            $node['children'][] = self::outlineNode($child);
        }

        return $node;
    }

    public static function toJson(string $title, array $ordered): string
    {
        $byParent = [];
        foreach ($ordered as $item) {
            $byParent[$item->parent_id ?? ''] = $byParent[$item->parent_id ?? ''] ?? [];
            $byParent[$item->parent_id ?? ''][] = $item;
        }

        $convert = function ($parentId) use (&$convert, &$byParent) {
            $result = [];
            foreach (($byParent[$parentId ?? ''] ?? []) as $item) {
                $result[] = [
                    'content' => $item->content,
                    'note' => $item->note,
                    'checked' => $item->checked,
                    'heading' => $item->heading,
                    'color' => $item->color,
                    'bullet' => $item->bullet,
                    'children' => $convert($item->id),
                ];
            }

            return $result;
        };

        return json_encode(['title' => $title, 'items' => $convert('')], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }

    public static function fromJson(string $text): array
    {
        $data = json_decode($text, true);

        if (! is_array($data) || ! isset($data['items']) || ! is_array($data['items'])) {
            throw new \InvalidArgumentException('File JSON tidak valid.');
        }

        $title = isset($data['title']) ? trim((string) $data['title']) : 'Imported document';
        $items = [];

        foreach ($data['items'] as $raw) {
            $items[] = self::jsonNode($raw);
        }

        return ['title' => $title, 'items' => $items];
    }

    private static function jsonNode(array $raw): array
    {
        return [
            'content' => (string) ($raw['content'] ?? ''),
            'note' => (string) ($raw['note'] ?? ''),
            'checked' => (bool) ($raw['checked'] ?? false),
            'heading' => (int) ($raw['heading'] ?? 0),
            'color' => isset($raw['color']) && $raw['color'] ? (string) $raw['color'] : null,
            'bullet' => (string) ($raw['bullet'] ?? 'bullet'),
            'children' => array_map(fn ($c) => self::jsonNode($c), $raw['children'] ?? []),
        ];
    }

    private static function bulletPrefix($item): string
    {
        if ($item->heading > 0) {
            return str_repeat('#', $item->heading).' ';
        }

        switch ($item->bullet) {
            case 'numbered':
                return '1. ';
            case 'checklist':
                return $item->checked ? '- [x] ' : '- [ ] ';
            default:
                return '- ';
        }
    }

    private static function xmlEsc(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}

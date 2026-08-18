<?php

namespace App\Support;

class ImageStorage
{
    public function enabled(): bool
    {
        return true;
    }

    public function put(string $filename, string $contents): string
    {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION) ?: 'png');
        $mime = match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'image/png',
        };

        return 'data:' . $mime . ';base64,' . base64_encode($contents);
    }
}

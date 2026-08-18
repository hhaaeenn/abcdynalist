<?php

namespace App\Support;

use RuntimeException;

class ImageStorage
{
    public function enabled(): bool
    {
        return true;
    }

    public function put(string $filename, string $contents): string
    {
        $ext = pathinfo($filename, PATHINFO_EXTENSION) ?: 'png';
        $mime = 'image/' . $ext;

        $tmpFile = tempnam(sys_get_temp_dir(), 'upload_');
        $target = $tmpFile . '.' . $ext;
        rename($tmpFile, $target);
        file_put_contents($target, $contents);

        $ch = curl_init('https://catbox.moe/user/api.php');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => [
                'reqtype' => 'fileupload',
                'fileToUpload' => new \CURLFile($target, $mime, $filename),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        @unlink($target);

        if ($res === false) {
            throw new RuntimeException('Curl error: ' . $err);
        }

        $url = trim((string) $res);

        if ($status < 200 || $status >= 300 || !str_starts_with($url, 'https://')) {
            throw new RuntimeException('Upload gagal (' . $status . '): ' . substr((string) $res, 0, 200));
        }

        return $url;
    }
}

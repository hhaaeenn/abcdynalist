<?php

namespace App\Support;

use RuntimeException;

class ImageStorage
{
    private string $uploadUrl = 'https://telegra.ph/upload';

    public function enabled(): bool
    {
        return true;
    }

    public function put(string $filename, string $contents): string
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'img_');
        file_put_contents($tmpFile, $contents);

        $ch = curl_init($this->uploadUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => [
                'file' => new \CURLFile($tmpFile, mime_content_type($tmpFile), $filename),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        @unlink($tmpFile);

        $json = json_decode((string) $res, true);

        if ($status < 200 || $status >= 300 || empty($json[0]['src'])) {
            throw new RuntimeException('Upload gagal ('.$status.'): '.substr((string) $res, 0, 200));
        }

        return 'https://telegra.ph'.$json[0]['src'];
    }
}

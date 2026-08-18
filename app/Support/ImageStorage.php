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
        $mime = 'image/'.$ext;

        $tmpFile = tempnam(sys_get_temp_dir(), 'upload_');
        $target = $tmpFile.'.'.$ext;
        rename($tmpFile, $target);
        file_put_contents($target, $contents);

        $postFields = ['file' => new \CURLFile($target, $mime, $filename)];

        $ch = curl_init('https://telegra.ph/upload');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postFields,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        @unlink($target);

        if ($res === false) {
            throw new RuntimeException('Curl error: '.$err);
        }

        $json = json_decode((string) $res, true);

        if ($status < 200 || $status >= 300 || empty($json[0]['src'])) {
            throw new RuntimeException('Upload gagal ('.$status.'): '.((string) $res));
        }

        return 'https://telegra.ph'.$json[0]['src'];
    }
}

<?php

namespace App\Support;

use RuntimeException;

class ImageStorage
{
    private string $apiKey;

    public function __construct()
    {
        $this->apiKey = (string) env('IMGBB_API_KEY', '');
    }

    public function enabled(): bool
    {
        return $this->apiKey !== '';
    }

    public function put(string $filename, string $contents): string
    {
        $ch = curl_init('https://api.imgbb.com/1/upload');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => [
                'key' => $this->apiKey,
                'image' => base64_encode($contents),
                'name' => pathinfo($filename, PATHINFO_FILENAME),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string) $res, true);

        if ($status < 200 || $status >= 300 || empty($json['success'])) {
            throw new RuntimeException('Upload gagal ('.$status.'): '.substr((string) $res, 0, 200));
        }

        return $json['data']['url'];
    }
}

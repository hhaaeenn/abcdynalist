<?php

namespace App\Support;

use RuntimeException;

class ImageStorage
{
    private string $cloudName;
    private string $apiKey;
    private string $apiSecret;

    public function __construct()
    {
        $this->cloudName = (string) env('CLOUDINARY_CLOUD_NAME', '');
        $this->apiKey = (string) env('CLOUDINARY_API_KEY', '');
        $this->apiSecret = (string) env('CLOUDINARY_API_SECRET', '');
    }

    public function enabled(): bool
    {
        return $this->cloudName !== '' && $this->apiKey !== '' && $this->apiSecret !== '';
    }

    public function put(string $filename, string $contents): string
    {
        $timestamp = time();
        $paramsToSign = "folder=dynalist&timestamp={$timestamp}";
        $signature = sha1($paramsToSign . $this->apiSecret);

        $ch = curl_init("https://api.cloudinary.com/v1_1/{$this->cloudName}/image/upload");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => [
                'file' => 'data:image/png;base64,' . base64_encode($contents),
                'api_key' => $this->apiKey,
                'timestamp' => $timestamp,
                'signature' => $signature,
                'folder' => 'dynalist',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($res === false) {
            throw new RuntimeException('Curl error: ' . $err);
        }

        $json = json_decode((string) $res, true);

        if ($status < 200 || $status >= 300 || empty($json['secure_url'])) {
            throw new RuntimeException('Upload gagal (' . $status . '): ' . substr((string) $res, 0, 200));
        }

        return $json['secure_url'];
    }
}

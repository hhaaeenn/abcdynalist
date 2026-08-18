<?php

namespace App\Support;

use RuntimeException;

/**
 * Klien minimal untuk Vercel Blob (REST API).
 *
 * Token Vercel Blob berbentuk `vercel_blob_rw_<storeId>_<secret>`;
 * storeId diturunkan dari token, sama seperti SDK resmi @vercel/blob.
 */
class BlobStorage
{
    private string $token;

    private string $storeId;

    public function __construct()
    {
        $this->token = (string) env('BLOB_READ_WRITE_TOKEN', '');
        $this->storeId = (string) env('BLOB_STORE_ID', '');

        if ($this->storeId === '' && $this->token !== '') {
            $parts = explode('_', $this->token);
            $this->storeId = $parts[3] ?? '';
        }
    }

    public function enabled(): bool
    {
        return $this->token !== '' && $this->storeId !== '';
    }

    public function put(string $path, string $contents, string $contentType): string
    {
        $url = $this->publicUrl($path);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => 'PUT',
            CURLOPT_POSTFIELDS => $contents,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'x-api-token: '.$this->token,
                'content-type: '.$contentType,
                'x-content-type: '.$contentType,
                'cache-control: public, max-age=31536000, immutable',
            ],
        ]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('Vercel Blob upload gagal ('.$status.'): '.substr((string) $res, 0, 200));
        }

        return $url;
    }

    public function delete(string $path): void
    {
        $ch = curl_init('https://api.vercel.com/v3/blob');
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_POSTFIELDS => json_encode(['urls' => [$this->publicUrl($path)]]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer '.$this->token,
                'Content-Type: application/json',
            ],
        ]);
        curl_exec($ch);
        curl_close($ch);
    }

    public function publicUrl(string $path): string
    {
        return 'https://'.$this->storeId.'.public.blob.vercel-storage.com/'.ltrim($path, '/');
    }
}

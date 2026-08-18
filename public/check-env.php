<?php
header('Content-Type: application/json');
$keys = ['BLOB_READ_WRITE_TOKEN', 'APP_DEBUG', 'SESSION_DRIVER'];
$result = [];
foreach ($keys as $key) {
    $result[$key] = [
        'env' => env($key),
        'getenv' => getenv($key),
        'SERVER' => $_SERVER[$key] ?? null,
    ];
}
echo json_encode($result, JSON_PRETTY_PRINT);

<?php
header('Content-Type: application/json');

$blob = getenv('BLOB_READ_WRITE_TOKEN');
$appDebug = getenv('APP_DEBUG');

echo json_encode([
    'getenv_blob' => $blob !== false ? substr($blob, 0, 20) . '...' : 'NOT_FOUND',
    'getenv_blob_type' => gettype($blob),
    'getenv_app_debug' => $appDebug !== false ? $appDebug : 'NOT_FOUND',
    'getenv_app_debug_type' => gettype($appDebug),
    'server_keys' => array_filter(array_keys($_SERVER), fn($k) => str_contains($k, 'BLOB') || str_contains($k, 'VERCEL')),
    'env_keys' => array_keys($_ENV),
    'ini_variables_order' => ini_get('variables_order'),
]);

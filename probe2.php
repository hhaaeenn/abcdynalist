<?php

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Http\Controllers\API\ItemController;

$start = microtime(true);
$docId = '6a7063b370a28381480502b6';
$childId = '6a70640f70a28381480502b8';
$parentId = '6a7063bb70a28381480502b7';

$c = new ItemController();
$ref = new ReflectionMethod(ItemController::class, 'collectDescendantIds');
$ref->setAccessible(true);
echo 'descendants: ' . json_encode($ref->invoke($c, $docId, $childId)) . PHP_EOL;
echo 'elapsed: ' . round((microtime(true) - $start) * 1000) . ' ms' . PHP_EOL;

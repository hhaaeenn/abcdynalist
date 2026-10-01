<?php

use App\Http\Controllers\PageController;
use App\Http\Controllers\PublishController;
use App\Http\Controllers\ShareController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PageController::class, 'home']);

Route::get('/login', [PageController::class, 'login'])->name('login');
Route::get('/register', [PageController::class, 'register'])->name('register');
Route::get('/app', [PageController::class, 'app'])->name('app');

// IP-throttled: both the share token and the publish password are guessable only by brute
// force, and neither route requires auth, so this is the only thing standing in the way of
// a script trying many tokens/passwords per minute.
Route::get('/share/{token}', [ShareController::class, 'view'])->middleware('throttle:30,1');
Route::get('/publish/{token}', [PublishController::class, 'view'])->middleware('throttle:30,1');

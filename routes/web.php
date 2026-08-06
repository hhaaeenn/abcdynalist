<?php

use App\Http\Controllers\PageController;
use App\Http\Controllers\PublishController;
use App\Http\Controllers\ShareController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PageController::class, 'home']);

Route::get('/login', [PageController::class, 'login'])->name('login');
Route::get('/register', [PageController::class, 'register'])->name('register');
Route::get('/app', [PageController::class, 'app'])->name('app');

Route::get('/share/{token}', [ShareController::class, 'view']);
Route::get('/publish/{token}', [PublishController::class, 'view']);

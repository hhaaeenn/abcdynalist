<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\BacklinkController;
use App\Http\Controllers\API\BookmarkController;
use App\Http\Controllers\API\DocumentController;
use App\Http\Controllers\API\ItemController;
use App\Http\Controllers\API\QuickFinderController;
use App\Http\Controllers\API\RevisionController;
use App\Http\Controllers\API\TagColorController;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/search', [QuickFinderController::class, 'search']);
    Route::get('/finder/items', [QuickFinderController::class, 'items']);
    Route::get('/finder/items/{id}', [QuickFinderController::class, 'locate']);
    Route::get('/bookmarked-documents', [QuickFinderController::class, 'bookmarks']);
    Route::get('/tags', [QuickFinderController::class, 'tags']);
    Route::get('/tags/{tag}', [QuickFinderController::class, 'tagItems']);

    Route::get('/items/{id}/backlinks', [BacklinkController::class, 'index']);
    Route::get('/documents/{documentId}/backlink-counts', [BacklinkController::class, 'counts']);

    Route::get('/tag-colors', [TagColorController::class, 'index']);
    Route::put('/tag-colors/{tag}', [TagColorController::class, 'update']);

    Route::get('/documents', [DocumentController::class, 'index']);
    Route::get('/documents/trashed', [DocumentController::class, 'trashed']);
    Route::post('/documents', [DocumentController::class, 'store']);
    Route::get('/documents/{id}', [DocumentController::class, 'show']);
    Route::put('/documents/{id}', [DocumentController::class, 'update']);
    Route::patch('/documents/{id}', [DocumentController::class, 'update']);
    Route::delete('/documents/{id}', [DocumentController::class, 'destroy']);
    Route::post('/documents/{id}/restore', [DocumentController::class, 'restoreTrashed']);
    Route::delete('/documents/{id}/force', [DocumentController::class, 'forceDestroy']);
    Route::post('/documents/{id}/move', [DocumentController::class, 'move']);
    Route::post('/documents/{id}/sort', [DocumentController::class, 'sort']);
    Route::post('/documents/sort-all', [DocumentController::class, 'sortAll']);
    Route::post('/documents/{id}/copy', [DocumentController::class, 'copy']);
    Route::post('/documents/import', [DocumentController::class, 'importDocument']);
    Route::post('/documents/{id}/set-inbox', [DocumentController::class, 'setInbox']);
    Route::get('/documents/{id}/share', [DocumentController::class, 'showShare']);
    Route::post('/documents/{id}/share', [DocumentController::class, 'updateShare']);
    Route::get('/documents/{id}/publish', [DocumentController::class, 'showPublish']);
    Route::post('/documents/{id}/publish', [DocumentController::class, 'updatePublish']);
    Route::get('/documents/{id}/export', [DocumentController::class, 'export']);

    Route::get('/documents/{documentId}/items', [ItemController::class, 'index']);
    Route::post('/documents/{documentId}/items', [ItemController::class, 'store']);
    Route::get('/documents/{documentId}/trash', [ItemController::class, 'trashed']);
    Route::delete('/documents/{documentId}/trash', [ItemController::class, 'emptyTrash']);
    Route::post('/documents/{documentId}/items/{id}/restore', [ItemController::class, 'restoreItem']);
    Route::delete('/documents/{documentId}/items/{id}/force', [ItemController::class, 'forceDestroy']);
    Route::post('/documents/{documentId}/images', [ItemController::class, 'uploadImage']);
    Route::delete('/documents/{documentId}/images', [ItemController::class, 'deleteImage']);
    Route::get('/documents/{documentId}/items/{id}', [ItemController::class, 'show']);
    Route::put('/documents/{documentId}/items/{id}', [ItemController::class, 'update']);
    Route::patch('/documents/{documentId}/items/{id}', [ItemController::class, 'update']);
    Route::delete('/documents/{documentId}/items/{id}', [ItemController::class, 'destroy']);
    Route::get('/documents/{documentId}/items/{id}/revisions', [RevisionController::class, 'index']);
    Route::post('/documents/{documentId}/items/{id}/revisions/{revisionId}/restore', [RevisionController::class, 'restore']);
    Route::post('/documents/{documentId}/items/{id}/move', [ItemController::class, 'move']);
    Route::post('/documents/{documentId}/items/{id}/move-document', [ItemController::class, 'moveToDocument']);
    Route::post('/documents/{documentId}/items/{id}/indent', [ItemController::class, 'indent']);
    Route::post('/documents/{documentId}/items/{id}/unindent', [ItemController::class, 'unindent']);
    Route::post('/documents/{documentId}/items/{id}/sort', [ItemController::class, 'sort']);
    Route::post('/documents/{documentId}/items/{id}/toggle-check-children', [ItemController::class, 'toggleCheckChildren']);
    Route::post('/documents/{documentId}/items/{id}/number-children', [ItemController::class, 'numberChildren']);
    Route::post('/documents/{documentId}/items/{id}/deduplicate-children', [ItemController::class, 'deduplicateChildren']);
    Route::post('/documents/{documentId}/items-restore', [ItemController::class, 'restore']);
    Route::post('/documents/{documentId}/items-delete-checked', [ItemController::class, 'deleteChecked']);
    Route::post('/documents/{documentId}/items-delete-batch', [ItemController::class, 'deleteBatch']);
    Route::post('/documents/{documentId}/items-search', [ItemController::class, 'search']);

    Route::get('/bookmarks', [BookmarkController::class, 'index']);
    Route::post('/bookmarks', [BookmarkController::class, 'store']);
    Route::delete('/bookmarks/{id}', [BookmarkController::class, 'destroy']);
});

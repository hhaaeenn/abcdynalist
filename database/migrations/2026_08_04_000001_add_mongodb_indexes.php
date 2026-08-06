<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use MongoDB\Laravel\Schema\Blueprint;

return new class extends Migration
{
    public function up(): void
    {
        $this->ensureCollection('users');
        Schema::connection('mongodb')->table('users', function (Blueprint $collection) {
            $collection->unique('email');
        });

        $this->ensureCollection('documents');
        Schema::connection('mongodb')->table('documents', function (Blueprint $collection) {
            $collection->index(['user_id' => 1, 'parent_id' => 1, 'sort_order' => 1]);
        });

        $this->ensureCollection('items');
        Schema::connection('mongodb')->table('items', function (Blueprint $collection) {
            $collection->index(['user_id' => 1]);
            $collection->index(['document_id' => 1, 'parent_id' => 1, 'sort_order' => 1]);
        });

        $this->ensureCollection('bookmarks');
        Schema::connection('mongodb')->table('bookmarks', function (Blueprint $collection) {
            $collection->index(['user_id' => 1, 'target_type' => 1, 'target_id' => 1]);
        });
    }

    public function down(): void
    {
        Schema::connection('mongodb')->table('users', function (Blueprint $collection) {
            $collection->dropIndexIfExists('email_1');
        });

        Schema::connection('mongodb')->table('documents', function (Blueprint $collection) {
            $collection->dropIndexIfExists('user_id_1_parent_id_1_sort_order_1');
        });

        Schema::connection('mongodb')->table('items', function (Blueprint $collection) {
            $collection->dropIndexIfExists('user_id_1');
            $collection->dropIndexIfExists('document_id_1_parent_id_1_sort_order_1');
        });

        Schema::connection('mongodb')->table('bookmarks', function (Blueprint $collection) {
            $collection->dropIndexIfExists('user_id_1_target_type_1_target_id_1');
        });
    }

    private function ensureCollection(string $collection): void
    {
        if (! Schema::connection('mongodb')->hasTable($collection)) {
            Schema::connection('mongodb')->create($collection);
        }
    }
};

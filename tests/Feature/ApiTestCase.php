<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Item;
use App\Models\User;
use Tests\TestCase;

abstract class ApiTestCase extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('migrate:fresh', ['--force' => true]);
    }

    protected function createUser(array $overrides = []): User
    {
        return User::create(array_merge([
            'name' => 'Test User',
            'email' => 'user@example.com',
            'password' => 'password123',
        ], $overrides));
    }

    protected function authHeaders(User $user): array
    {
        return [
            'Authorization' => 'Bearer '.$user->createToken('test-token')->plainTextToken,
        ];
    }

    protected function createDocument(User $user, array $attributes = []): Document
    {
        return Document::create(array_merge([
            'user_id' => $user->id,
            'type' => 'document',
            'name' => 'Test Document',
            'parent_id' => null,
            'sort_order' => 0,
            'is_inbox' => false,
            'settings' => [],
        ], $attributes));
    }

    protected function createItem(User $user, Document $document, array $attributes = []): Item
    {
        return Item::create(array_merge([
            'user_id' => $user->id,
            'document_id' => $document->id,
            'parent_id' => null,
            'content' => 'Test item',
            'note' => '',
            'checked' => false,
            'heading' => 0,
            'color' => null,
            'tags' => [],
            'sort_order' => 0,
        ], $attributes));
    }
}

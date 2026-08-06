<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Document;

class DocumentTest extends ApiTestCase
{
    public function test_index_returns_tree(): void
    {
        $user = $this->createUser();
        $folder = $this->createDocument($user, ['type' => 'folder', 'name' => 'Folder']);
        $this->createDocument($user, ['name' => 'Child', 'parent_id' => $folder->id, 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/documents')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Folder')
            ->assertJsonPath('data.0.children.0.name', 'Child');
    }

    public function test_user_cannot_see_other_users_documents(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $this->createDocument($userA, ['name' => 'Secret Doc']);

        $userB = $this->createUser(['email' => 'b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->getJson('/api/documents')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_can_create_document_inside_folder(): void
    {
        $user = $this->createUser();
        $folder = $this->createDocument($user, ['type' => 'folder', 'name' => 'Folder']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/documents', [
                'type' => 'document',
                'name' => 'Inside',
                'parent_id' => $folder->id,
            ])->assertStatus(201)
            ->assertJsonPath('data.parent_id', $folder->id);

        $this->assertDatabaseHas('documents', [
            'user_id' => $user->id,
            'name' => 'Inside',
            'parent_id' => $folder->id,
        ]);
    }

    public function test_cannot_create_document_under_non_folder_parent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user, ['name' => 'Plain Document']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/documents', [
                'type' => 'document',
                'name' => 'Bad',
                'parent_id' => $doc->id,
            ])->assertStatus(404);
    }

    public function test_can_update_document(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user, ['name' => 'Before']);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson("/api/documents/{$doc->id}", ['name' => 'After'])
            ->assertOk()
            ->assertJsonPath('data.name', 'After');
    }

    public function test_can_move_document_into_folder(): void
    {
        $user = $this->createUser();
        $folder = $this->createDocument($user, ['type' => 'folder', 'name' => 'Folder']);
        $doc = $this->createDocument($user, ['name' => 'Move Me']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/move", ['parent_id' => $folder->id])
            ->assertOk()
            ->assertJsonPath('data.parent_id', $folder->id);
    }

    public function test_can_sort_siblings_by_name(): void
    {
        $user = $this->createUser();
        $this->createDocument($user, ['name' => 'Banana', 'sort_order' => 0]);
        $this->createDocument($user, ['name' => 'Apple', 'sort_order' => 1]);

        $ids = Document::where('user_id', $user->id)->orderBy('sort_order')->pluck('id')->all();

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$ids[0]}/sort", ['order' => 'name_asc'])
            ->assertOk();

        $names = Document::where('user_id', $user->id)->orderBy('sort_order')->pluck('name')->all();
        $this->assertSame(['Apple', 'Banana'], $names);
    }

    public function test_destroy_cascades_to_items_and_bookmarks(): void
    {
        $user = $this->createUser();
        $folder = $this->createDocument($user, ['type' => 'folder', 'name' => 'Folder']);
        $doc = $this->createDocument($user, ['name' => 'Child Doc', 'parent_id' => $folder->id, 'sort_order' => 0]);
        $item = $this->createItem($user, $doc, ['content' => 'To be deleted']);

        Bookmark::create([
            'user_id' => $user->id,
            'target_type' => 'document',
            'target_id' => $doc->id,
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson("/api/documents/{$folder->id}")
            ->assertOk();

        $this->assertSoftDeleted('documents', ['id' => $folder->id]);
        $this->assertSoftDeleted('documents', ['id' => $doc->id]);
        $this->assertSoftDeleted('items', ['id' => $item->id]);
        $this->assertSame(0, Bookmark::where('target_type', 'document')->where('target_id', $doc->id)->count());
    }

    public function test_can_set_inbox(): void
    {
        $user = $this->createUser();
        $docA = $this->createDocument($user, ['name' => 'A']);
        $docB = $this->createDocument($user, ['name' => 'B']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$docA->id}/set-inbox", ['is_inbox' => true])
            ->assertOk()
            ->assertJsonPath('data.is_inbox', true);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$docB->id}/set-inbox", ['is_inbox' => true])
            ->assertOk()
            ->assertJsonPath('data.is_inbox', true);

        $this->assertTrue((bool) Document::find($docB->id)->is_inbox);
        $this->assertFalse((bool) Document::find($docA->id)->is_inbox);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$docB->id}/set-inbox", ['is_inbox' => false])
            ->assertOk()
            ->assertJsonPath('data.is_inbox', false);
    }

    public function test_cannot_set_inbox_for_other_users_document(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $docA = $this->createDocument($userA);

        $userB = $this->createUser(['email' => 'b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->postJson("/api/documents/{$docA->id}/set-inbox", ['is_inbox' => true])
            ->assertStatus(404);
    }

    public function test_cannot_delete_other_users_document(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $docA = $this->createDocument($userA);

        $userB = $this->createUser(['email' => 'b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->deleteJson("/api/documents/{$docA->id}")
            ->assertStatus(404);

        $this->assertNotNull(Document::find($docA->id));
    }
}

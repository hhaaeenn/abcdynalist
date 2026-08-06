<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Item;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class ItemTest extends ApiTestCase
{
    public function test_create_item_with_tags(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items", [
                'content' => 'Beli susu',
                'tags' => ['belanja', 'urgent'],
            ])->assertStatus(201)
            ->assertJsonPath('data.content', 'Beli susu')
            ->assertJsonPath('data.tags', ['belanja', 'urgent']);
    }

    public function test_tags_aggregation_and_tag_items(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $this->createItem($user, $doc, ['content' => 'Selesaikan #pekerjaan dan #penting']);
        $this->createItem($user, $doc, ['content' => 'Beli bahan #belanja']);

        $response = $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/tags')
            ->assertOk()
            ->assertJsonCount(3, 'data');

        $tags = collect($response->json('data'))->pluck('tag')->sort()->values()->all();
        $this->assertEquals(['#belanja', '#pekerjaan', '#penting'], $tags);

        $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/tags/%23penting')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.content', 'Selesaikan #pekerjaan dan #penting');
    }

    public function test_cannot_create_item_in_other_users_document(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $docA = $this->createDocument($userA);

        $userB = $this->createUser(['email' => 'b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->postJson("/api/documents/{$docA->id}/items", ['content' => 'Nope'])
            ->assertStatus(404);
    }

    public function test_index_returns_tree(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $parent = $this->createItem($user, $doc, ['content' => 'Parent']);
        $this->createItem($user, $doc, ['content' => 'Child', 'parent_id' => $parent->id, 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/documents/{$doc->id}/items")
            ->assertOk()
            ->assertJsonPath('data.0.content', 'Parent')
            ->assertJsonPath('data.0.children.0.content', 'Child');
    }

    public function test_can_update_item(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'Before']);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson("/api/documents/{$doc->id}/items/{$item->id}", [
                'content' => 'After',
                'checked' => true,
            ])->assertOk()
            ->assertJsonPath('data.content', 'After')
            ->assertJsonPath('data.checked', true);
    }

    public function test_can_move_item_under_parent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $parent = $this->createItem($user, $doc, ['content' => 'Parent']);
        $child = $this->createItem($user, $doc, ['content' => 'Child', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$child->id}/move", ['parent_id' => $parent->id])
            ->assertOk()
            ->assertJsonPath('data.parent_id', $parent->id);
    }

    public function test_cannot_move_item_into_own_descendant(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $parent = $this->createItem($user, $doc, ['content' => 'Parent']);
        $grandchild = $this->createItem($user, $doc, ['content' => 'Grandchild', 'parent_id' => $parent->id, 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$parent->id}/move", ['parent_id' => $grandchild->id])
            ->assertStatus(422);
    }

    public function test_can_move_item_to_another_document(): void
    {
        $user = $this->createUser();
        $docA = $this->createDocument($user, ['name' => 'A']);
        $docB = $this->createDocument($user, ['name' => 'B']);
        $root = $this->createItem($user, $docA, ['content' => 'Root']);
        $child = $this->createItem($user, $docA, ['content' => 'Child', 'parent_id' => $root->id, 'sort_order' => 0]);
        $other = $this->createItem($user, $docA, ['content' => 'Other', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$docA->id}/items/{$root->id}/move-document", ['target_document_id' => $docB->id])
            ->assertOk()
            ->assertJsonPath('data.document_id', $docB->id)
            ->assertJsonPath('data.parent_id', null);

        $moved = Item::find($root->id);
        $movedChild = Item::find($child->id);
        $this->assertSame($docB->id, $moved->document_id);
        $this->assertSame($docB->id, $movedChild->document_id);
        $this->assertSame($root->id, $movedChild->parent_id);
        $this->assertSame($docA->id, Item::find($other->id)->document_id);
    }

    public function test_cannot_move_item_to_other_users_document(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $docA = $this->createDocument($userA, ['name' => 'A']);
        $item = $this->createItem($userA, $docA);

        $userB = $this->createUser(['email' => 'b@example.com']);
        $docB = $this->createDocument($userB, ['name' => 'B']);

        $this->withHeaders($this->authHeaders($userA))
            ->postJson("/api/documents/{$docA->id}/items/{$item->id}/move-document", ['target_document_id' => $docB->id])
            ->assertStatus(404);

        $this->assertSame($docA->id, Item::find($item->id)->document_id);
    }

    public function test_cannot_move_item_to_folder(): void
    {
        $user = $this->createUser();
        $docA = $this->createDocument($user, ['name' => 'A']);
        $item = $this->createItem($user, $docA);
        $folder = $this->createDocument($user, ['type' => 'folder', 'name' => 'Folder']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$docA->id}/items/{$item->id}/move-document", ['target_document_id' => $folder->id])
            ->assertStatus(404);
    }

    public function test_indent_and_unindent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $first = $this->createItem($user, $doc, ['content' => 'First', 'sort_order' => 0]);
        $second = $this->createItem($user, $doc, ['content' => 'Second', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$second->id}/indent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', $first->id);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$second->id}/unindent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', null);
    }

    public function test_unindent_places_item_after_its_parent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);
        $c = $this->createItem($user, $doc, ['content' => 'C', 'sort_order' => 2]);

        // Make B the first child of A
        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/indent")
            ->assertOk();

        // B must be the only child of A, then unindent it
        $b = Item::find($b->id);
        $this->assertSame((string) $a->id, (string) $b->parent_id);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/unindent")
            ->assertOk();

        $order = Item::where('document_id', $doc->id)->whereNull('parent_id')->orderBy('sort_order')->get()
            ->pluck('content')->all();
        $this->assertSame(['A', 'B', 'C'], $order);
    }

    public function test_indent_appends_as_last_child(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);
        $c1 = $this->createItem($user, $doc, ['content' => 'C1', 'parent_id' => $a->id, 'sort_order' => 0]);

        // Indent B under A -> B must land after C1
        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/indent")
            ->assertOk();

        $order = Item::where('document_id', $doc->id)->where('parent_id', (string) $a->id)
            ->orderBy('sort_order')->get()->pluck('content')->all();
        $this->assertSame(['C1', 'B'], $order);
    }

    public function test_unindent_then_indent_returns_item_as_child(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/indent")
            ->assertOk();

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/unindent")
            ->assertOk();

        $b = Item::find($b->id);
        $this->assertNull($b->parent_id);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/indent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', (string) $a->id);
    }

    public function test_indent_unindent_at_boundary_are_silent_noops(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);

        // First item cannot be indented -> success, no change
        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$a->id}/indent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', null);

        // Root item cannot be unindented -> success, no change
        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$a->id}/unindent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', null);

        // First child cannot be indented -> success, no change
        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/indent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', (string) $a->id);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$b->id}/indent")
            ->assertOk()
            ->assertJsonPath('data.parent_id', (string) $a->id);
    }

    public function test_destroy_cascades_to_bookmarks(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'Delete me']);
        $child = $this->createItem($user, $doc, ['content' => 'Child', 'parent_id' => $item->id, 'sort_order' => 0]);

        Bookmark::create([
            'user_id' => $user->id,
            'target_type' => 'item',
            'target_id' => $child->id,
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson("/api/documents/{$doc->id}/items/{$item->id}")
            ->assertOk();

        $this->assertSoftDeleted('items', ['id' => $item->id]);
        $this->assertSoftDeleted('items', ['id' => $child->id]);
        $this->assertSame(0, Bookmark::where('target_type', 'item')->where('target_id', $child->id)->count());
    }

    public function test_delete_checked_removes_items_and_bookmarks(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $checked = $this->createItem($user, $doc, ['content' => 'Done', 'checked' => true]);
        $this->createItem($user, $doc, ['content' => 'Child of done', 'parent_id' => $checked->id, 'checked' => true, 'sort_order' => 0]);
        $kept = $this->createItem($user, $doc, ['content' => 'Keep', 'sort_order' => 1]);

        Bookmark::create([
            'user_id' => $user->id,
            'target_type' => 'item',
            'target_id' => $checked->id,
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items-delete-checked")
            ->assertOk();

        $this->assertSoftDeleted('items', ['id' => $checked->id]);
        $this->assertNotNull(Item::find($kept->id));
        $this->assertSame(0, Bookmark::where('target_type', 'item')->where('target_id', $checked->id)->count());
    }

    public function test_toggle_check_children(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $parent = $this->createItem($user, $doc, ['content' => 'Parent']);
        $child = $this->createItem($user, $doc, ['content' => 'Child', 'parent_id' => $parent->id, 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items/{$parent->id}/toggle-check-children")
            ->assertOk()
            ->assertJsonPath('data.checked', true);

        $this->assertTrue((bool) Item::find($child->id)->checked);
    }

    public function test_search_returns_matching_items(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $this->createItem($user, $doc, ['content' => 'Beli susu']);
        $this->createItem($user, $doc, ['content' => 'Belajar PHP']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items-search", ['q' => 'susu', 'match' => true])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('data.0.content', 'Beli susu');
    }

    public function test_can_create_item_with_empty_content(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items", ['content' => ''])
            ->assertStatus(201)
            ->assertJsonPath('data.content', '');
    }

    public function test_search_respects_case_sensitive(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $this->createItem($user, $doc, ['content' => 'Beli Susu']);
        $this->createItem($user, $doc, ['content' => 'beli susu']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items-search", ['q' => 'Susu', 'match' => true, 'case_sensitive' => true])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('data.0.content', 'Beli Susu');
    }

    public function test_can_create_item_with_position(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);
        $this->createItem($user, $doc, ['content' => 'C', 'sort_order' => 2]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items", ['content' => 'X', 'position' => 1])
            ->assertStatus(201)
            ->assertJsonPath('data.content', 'X');

        $order = Item::where('document_id', $doc->id)
            ->whereNull('parent_id')
            ->orderBy('sort_order')
            ->pluck('content')
            ->all();

        $this->assertSame(['A', 'X', 'B', 'C'], $order);
    }

    public function test_can_upload_image(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/images", [
                'image' => $this->fakePng(),
            ])
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonStructure(['status', 'data' => ['url', 'path']]);
    }

    public function test_cannot_upload_image_to_other_users_document(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $docA = $this->createDocument($userA);

        $userB = $this->createUser(['email' => 'b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->postJson("/api/documents/{$docA->id}/images", [
                'image' => $this->fakePng(),
            ])
            ->assertStatus(404);
    }

    public function test_can_delete_image_referenced_by_item(): void
    {
        Storage::fake('public');
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $url = Storage::disk('public')->url('images/foto.png');
        $item = $this->createItem($user, $doc, ['content' => "![]($url)"]);
        Storage::disk('public')->put('images/foto.png', 'fake');

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson("/api/documents/{$doc->id}/images", [
                'path' => 'images/foto.png',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'success');

        $this->assertFalse(Storage::disk('public')->exists('images/foto.png'));

        $item->refresh();
        $this->assertSame("![]($url)", $item->content);
    }

    public function test_cannot_delete_image_not_referenced_by_item(): void
    {
        Storage::fake('public');
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        Storage::disk('public')->put('images/foto.png', 'fake');

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson("/api/documents/{$doc->id}/images", [
                'path' => 'images/foto.png',
            ])
            ->assertStatus(404);

        $this->assertTrue(Storage::disk('public')->exists('images/foto.png'));
    }

    public function test_cannot_delete_image_in_other_users_document(): void
    {
        Storage::fake('public');
        $userA = $this->createUser(['email' => 'a@example.com']);
        $docA = $this->createDocument($userA);
        $url = Storage::disk('public')->url('images/foto.png');
        $this->createItem($userA, $docA, ['content' => "![]($url)"]);
        Storage::disk('public')->put('images/foto.png', 'fake');

        $userB = $this->createUser(['email' => 'b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->deleteJson("/api/documents/{$docA->id}/images", [
                'path' => 'images/foto.png',
            ])
            ->assertStatus(404);

        $this->assertTrue(Storage::disk('public')->exists('images/foto.png'));
    }

    private function fakePng(): UploadedFile
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
        $path = tempnam(sys_get_temp_dir(), 'img').'.png';
        file_put_contents($path, $png);

        return new UploadedFile($path, 'foto.png', 'image/png', null, true);
    }

    public function test_bookmark_endpoints(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/bookmarks', ['target_type' => 'item', 'target_id' => $item->id])
            ->assertStatus(201);

        $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/bookmarks')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.target_type', 'item');

        $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/bookmarked-documents')
            ->assertOk();
    }

    public function test_finder_items_searches_across_documents(): void
    {
        $user = $this->createUser();
        $docA = $this->createDocument($user, ['name' => 'Proyek A']);
        $docB = $this->createDocument($user, ['name' => 'Proyek B']);
        $this->createItem($user, $docA, ['content' => 'Rapat #lokal']);
        $this->createItem($user, $docB, ['content' => 'Rapat #proyek', 'checked' => true]);

        $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/finder/items?q=rapat')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.document_name', 'Proyek A')
            ->assertJsonPath('data.1.checked', true)
            ->assertJsonPath('data.1.document_id', (string) $docB->id);
    }

    public function test_finder_items_scoped_to_user(): void
    {
        $userA = $this->createUser(['email' => 'scoped-a@example.com']);
        $userB = $this->createUser(['email' => 'scoped-b@example.com']);
        $docA = $this->createDocument($userA);
        $this->createItem($userA, $docA, ['content' => 'Item rahasia user A']);

        $this->withHeaders($this->authHeaders($userB))
            ->getJson('/api/finder/items?q=rahasia')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_finder_locate_returns_document_and_content(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user, ['name' => 'Catatan Harian']);
        $item = $this->createItem($user, $doc, ['content' => 'Tugas penting']);

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/finder/items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.id', (string) $item->id)
            ->assertJsonPath('data.document_id', (string) $doc->id)
            ->assertJsonPath('data.document_name', 'Catatan Harian')
            ->assertJsonPath('data.content', 'Tugas penting');

        $other = $this->createUser(['email' => 'locate-b@example.com']);
        $this->app['auth']->forgetGuards();
        $this->withHeaders($this->authHeaders($other))
            ->getJson("/api/finder/items/{$item->id}")
            ->assertStatus(404);
    }

    public function test_item_defaults_to_checklist_bullet_and_can_be_changed(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $created = $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items", ['content' => 'A'])
            ->assertStatus(201)
            ->assertJsonPath('data.bullet', 'checklist');

        $itemId = $created->json('data.id');

        $this->withHeaders($this->authHeaders($user))
            ->patchJson("/api/documents/{$doc->id}/items/{$itemId}", ['bullet' => 'numbered'])
            ->assertOk()
            ->assertJsonPath('data.bullet', 'numbered');

        $this->withHeaders($this->authHeaders($user))
            ->patchJson("/api/documents/{$doc->id}/items/{$itemId}", ['bullet' => 'bogus'])
            ->assertStatus(422);

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/documents/{$doc->id}/items")
            ->assertOk()
            ->assertJsonPath('data.0.bullet', 'numbered');
    }

    public function test_restore_replaces_document_items_preserving_ids(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'Lama']);
        $child = $this->createItem($user, $doc, ['content' => 'Anak', 'parent_id' => $item->id, 'sort_order' => 0]);

        $snapshot = [
            ['id' => (string) $item->id, 'parent_id' => null, 'content' => 'Lama', 'note' => '', 'checked' => false, 'heading' => 0, 'color' => null, 'bullet' => 'checklist'],
            ['id' => (string) $child->id, 'parent_id' => (string) $item->id, 'content' => 'Anak diubah', 'note' => '', 'checked' => true, 'heading' => 1, 'color' => '#dc2626', 'bullet' => 'numbered'],
        ];

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items-restore", ['items' => $snapshot])
            ->assertOk();

        $tree = $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/documents/{$doc->id}/items")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->json('data');

        $this->assertSame((string) $item->id, $tree[0]['id']);
        $this->assertSame('Lama', $tree[0]['content']);
        $this->assertSame('Anak diubah', $tree[0]['children'][0]['content']);
        $this->assertTrue($tree[0]['children'][0]['checked']);
        $this->assertSame(1, $tree[0]['children'][0]['heading']);
        $this->assertSame('numbered', $tree[0]['children'][0]['bullet']);
    }

    public function test_restore_recreates_deleted_items(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'Akan dihapus']);
        $kept = $this->createItem($user, $doc, ['content' => 'Disimpan', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson("/api/documents/{$doc->id}/items/{$item->id}")
            ->assertOk();

        $snapshot = [
            ['id' => (string) $item->id, 'parent_id' => null, 'content' => 'Akan dihapus', 'note' => '', 'checked' => false, 'heading' => 0, 'color' => null, 'bullet' => 'checklist'],
            ['id' => (string) $kept->id, 'parent_id' => null, 'content' => 'Disimpan', 'note' => '', 'checked' => false, 'heading' => 0, 'color' => null, 'bullet' => 'checklist'],
        ];

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items-restore", ['items' => $snapshot])
            ->assertOk();

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/documents/{$doc->id}/items")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_restore_deletes_items_not_in_snapshot(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $kept = $this->createItem($user, $doc, ['content' => 'Tetap']);
        $extra = $this->createItem($user, $doc, ['content' => 'Harus hilang', 'sort_order' => 1]);

        $snapshot = [
            ['id' => (string) $kept->id, 'parent_id' => null, 'content' => 'Tetap', 'note' => '', 'checked' => false, 'heading' => 0, 'color' => null, 'bullet' => 'checklist'],
        ];

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/documents/{$doc->id}/items-restore", ['items' => $snapshot])
            ->assertOk();

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/documents/{$doc->id}/items")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', (string) $kept->id);
    }

    public function test_restore_scoped_to_document_owner(): void
    {
        $userA = $this->createUser(['email' => 'r-a@example.com']);
        $docA = $this->createDocument($userA);
        $userB = $this->createUser(['email' => 'r-b@example.com']);

        $this->withHeaders($this->authHeaders($userB))
            ->postJson("/api/documents/{$docA->id}/items-restore", ['items' => []])
            ->assertStatus(404);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemRevision;

class ItemBatchTest extends ApiTestCase
{
    private function batchUrl($doc, string $suffix = ''): string
    {
        return '/v1/documents/'.$doc->id.'/items'.$suffix;
    }

    // -----------------------------------------------------------------
    // items-batch
    // -----------------------------------------------------------------

    public function test_batch_update_applies_many_items_in_one_request(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);
        $c = $this->createItem($user, $doc, ['content' => 'C', 'sort_order' => 2]);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [
                    ['id' => (string) $a->id, 'content' => 'A baru'],
                    ['id' => (string) $b->id, 'checked' => true],
                    ['id' => (string) $c->id, 'bullet' => 'checklist', 'heading' => 2],
                ],
            ])->assertOk()
            ->assertJsonPath('updated', 3);

        $this->assertSame('A baru', $a->fresh()->content);
        $this->assertTrue((bool) $b->fresh()->checked);
        $this->assertSame('checklist', $c->fresh()->bullet);
        $this->assertSame(2, (int) $c->fresh()->heading);
    }

    public function test_batch_update_merges_multiple_fields_for_one_item(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'awal']);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [[
                    'id' => (string) $item->id,
                    'content' => 'akhir',
                    'note' => 'catatan',
                    'color' => '#ff0000',
                ]],
            ])->assertOk()
            ->assertJsonPath('updated', 1);

        $fresh = $item->fresh();
        $this->assertSame('akhir', $fresh->content);
        $this->assertSame('catatan', $fresh->note);
        $this->assertSame('#ff0000', $fresh->color);
    }

    public function test_batch_update_creates_only_one_revision_per_item(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'awal']);

        // Two entries for the same id: the write queue would already have merged these, so
        // the server must apply them without stacking a revision per entry.
        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [
                    ['id' => (string) $item->id, 'content' => 'tengah'],
                    ['id' => (string) $item->id, 'content' => 'akhir'],
                ],
            ])->assertOk();

        $this->assertSame('akhir', $item->fresh()->content);
        $this->assertSame(1, ItemRevision::where('item_id', (string) $item->id)->count());
    }

    public function test_batch_update_skips_revision_when_nothing_changed(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'sama']);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [['id' => (string) $item->id, 'content' => 'sama']],
            ])->assertOk();

        $this->assertSame(0, ItemRevision::where('item_id', (string) $item->id)->count());
    }

    public function test_batch_update_ignores_items_owned_by_another_user(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $userB = $this->createUser(['email' => 'b@example.com']);

        $docA = $this->createDocument($userA);
        $mine = $this->createItem($userA, $docA, ['content' => 'milik A']);
        $theirs = $this->createItem($userA, $docA, ['content' => 'milik A juga']);

        // Same document, different authenticated user.
        $this->withHeaders($this->authHeaders($userB))
            ->patchJson($this->batchUrl($docA, '-batch'), [
                'items' => [['id' => (string) $mine->id, 'content' => 'ditulis B']],
            ])->assertNotFound();

        $this->assertSame('milik A', $mine->fresh()->content);
        $this->assertSame('milik A juga', $theirs->fresh()->content);
    }

    public function test_batch_update_reports_gone_ids_instead_of_failing(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $alive = $this->createItem($user, $doc, ['content' => 'hidup']);

        $dead = $this->createItem($user, $doc, ['content' => 'mati']);
        $deadId = (string) $dead->id;
        $dead->delete();

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [
                    ['id' => $deadId, 'content' => 'patch terlambat'],
                    ['id' => (string) $alive->id, 'content' => 'masih hidup'],
                ],
            ])->assertOk()
            ->assertJsonPath('updated', 1)
            ->assertJsonPath('gone', [$deadId]);

        $this->assertSame('masih hidup', $alive->fresh()->content);
    }

    public function test_batch_update_ignores_parent_id(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $parent = $this->createItem($user, $doc, ['content' => 'parent', 'sort_order' => 0]);
        $child = $this->createItem($user, $doc, ['content' => 'child', 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [[
                    'id' => (string) $child->id,
                    'content' => 'child baru',
                    'parent_id' => (string) $parent->id,
                ]],
            ])->assertOk();

        $fresh = $child->fresh();
        $this->assertSame('child baru', $fresh->content);
        $this->assertNull($fresh->parent_id, 'Re-parenting harus lewat endpoint move, bukan items-batch');
    }

    public function test_batch_update_rejects_more_than_the_limit(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $items = [];
        for ($i = 0; $i < 201; $i++) {
            $items[] = ['id' => str_repeat('a', 24), 'content' => "x{$i}"];
        }

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), ['items' => $items])
            ->assertStatus(422);
    }

    public function test_batch_update_validates_field_values(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '-batch'), [
                'items' => [['id' => (string) $item->id, 'bullet' => 'tidak-valid']],
            ])->assertStatus(422);
    }

    public function test_batch_update_requires_document_ownership(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $userB = $this->createUser(['email' => 'b@example.com']);
        $docA = $this->createDocument($userA);

        $this->withHeaders($this->authHeaders($userB))
            ->patchJson($this->batchUrl($docA, '-batch'), ['items' => []])
            ->assertNotFound();
    }

    // -----------------------------------------------------------------
    // indent / unindent / move batch
    // -----------------------------------------------------------------

    public function test_indent_batch_reparents_every_item(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);
        $c = $this->createItem($user, $doc, ['content' => 'C', 'sort_order' => 2]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-indent-batch'), [
                'ids' => [(string) $b->id, (string) $c->id],
            ])->assertOk();

        $this->assertNull($a->fresh()->parent_id);
        $this->assertSame((string) $a->id, (string) $b->fresh()->parent_id);
        // C follows B's move, so it must land under A directly, not under B.
        $this->assertSame((string) $a->id, (string) $c->fresh()->parent_id);
        $this->assertSame(0, (int) $b->fresh()->sort_order);
        $this->assertSame(1, (int) $c->fresh()->sort_order);
    }

    public function test_indent_batch_ignores_first_sibling(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-indent-batch'), ['ids' => [(string) $a->id]])
            ->assertOk()
            ->assertJsonPath('moved', []);

        $this->assertNull($a->fresh()->parent_id);
        $this->assertNull($b->fresh()->parent_id);
    }

    public function test_unindent_batch_promotes_items_to_grandparent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'parent_id' => (string) $a->id, 'sort_order' => 0]);
        $c = $this->createItem($user, $doc, ['content' => 'C', 'parent_id' => (string) $a->id, 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-unindent-batch'), [
                'ids' => [(string) $b->id, (string) $c->id],
            ])->assertOk();

        $bFresh = $b->fresh();
        $cFresh = $c->fresh();

        $this->assertNull($bFresh->parent_id);
        $this->assertNull($cFresh->parent_id);
        // Unindenting must land directly after the former parent, in order.
        $this->assertSame(1, (int) $bFresh->sort_order);
        $this->assertSame(2, (int) $cFresh->sort_order);
    }

    public function test_unindent_batch_ignores_root_items(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-unindent-batch'), ['ids' => [(string) $a->id]])
            ->assertOk()
            ->assertJsonPath('moved', []);

        $this->assertNull($a->fresh()->parent_id);
    }

    public function test_move_batch_repositions_several_items(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $target = $this->createItem($user, $doc, ['content' => 'target', 'sort_order' => 0]);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 1]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 2]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-move-batch'), [
                'moves' => [
                    ['id' => (string) $a->id, 'parent_id' => (string) $target->id, 'position' => 0],
                    ['id' => (string) $b->id, 'parent_id' => (string) $target->id, 'position' => 1],
                ],
            ])->assertOk()
            ->assertJsonPath('moved', [(string) $a->id, (string) $b->id]);

        $this->assertSame((string) $target->id, (string) $a->fresh()->parent_id);
        $this->assertSame((string) $target->id, (string) $b->fresh()->parent_id);
        $this->assertSame(0, (int) $a->fresh()->sort_order);
        $this->assertSame(1, (int) $b->fresh()->sort_order);
    }

    public function test_move_batch_refuses_to_move_item_into_its_own_subtree(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'parent_id' => (string) $a->id, 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-move-batch'), [
                'moves' => [['id' => (string) $a->id, 'parent_id' => (string) $b->id, 'position' => 0]],
            ])->assertOk()
            ->assertJsonPath('moved', []);

        $this->assertNull($a->fresh()->parent_id);
    }

    public function test_move_batch_rejects_unknown_parent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-move-batch'), [
                'moves' => [['id' => (string) $a->id, 'parent_id' => str_repeat('b', 24), 'position' => 0]],
            ])->assertStatus(422);
    }

    // -----------------------------------------------------------------
    // Delete behaviour
    // -----------------------------------------------------------------

    public function test_deleting_twice_is_not_an_error(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc);
        $id = (string) $item->id;

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson($this->batchUrl($doc, "/{$id}"))
            ->assertOk();

        // The client optimistically removes the row and may retry; a 404 here used to
        // surface as a scary "not found" alert.
        $this->withHeaders($this->authHeaders($user))
            ->deleteJson($this->batchUrl($doc, "/{$id}"))
            ->assertOk()
            ->assertJsonPath('deleted', 0);
    }

    public function test_patching_a_deleted_item_reports_gone_not_not_found(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'awal']);
        $id = (string) $item->id;

        $this->withHeaders($this->authHeaders($user))
            ->deleteJson($this->batchUrl($doc, "/{$id}"))
            ->assertOk();

        // A debounced edit landing after the delete must be recognised as "already gone".
        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, "/{$id}"), ['content' => 'terlambat'])
            ->assertStatus(410)
            ->assertJsonPath('deleted', true);
    }

    public function test_patching_a_nonexistent_item_is_still_404(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '/' . str_repeat('c', 24)), ['content' => 'x'])
            ->assertNotFound();
    }

    public function test_delete_checked_uses_the_ids_the_client_actually_removed(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $unchecked = $this->createItem($user, $doc, ['content' => 'tidak dicentang', 'checked' => false, 'sort_order' => 0]);
        $checked = $this->createItem($user, $doc, ['content' => 'dicentang', 'checked' => true, 'sort_order' => 1]);

        // The screen removed `unchecked`; the server's own checked column still says
        // `checked` is ticked. Trusting the server here would delete the wrong row.
        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-delete-checked'), [
                'ids' => [(string) $unchecked->id],
            ])->assertOk()
            ->assertJsonPath('deleted', 1);

        $this->assertSoftDeleted('items', ['_id' => $unchecked->id]);
        $this->assertDatabaseHas('items', ['_id' => $checked->id]);
    }

    public function test_delete_checked_without_ids_still_uses_the_checked_column(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $unchecked = $this->createItem($user, $doc, ['content' => 'biasa', 'checked' => false, 'sort_order' => 0]);
        $checked = $this->createItem($user, $doc, ['content' => 'centang', 'checked' => true, 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-delete-checked'))
            ->assertOk();

        $this->assertSoftDeleted('items', ['_id' => $checked->id]);
        $this->assertDatabaseHas('items', ['_id' => $unchecked->id]);
    }

    public function test_delete_batch_removes_descendants_in_one_request(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $root = $this->createItem($user, $doc, ['content' => 'root', 'sort_order' => 0]);
        $child = $this->createItem($user, $doc, ['content' => 'child', 'parent_id' => (string) $root->id, 'sort_order' => 0]);
        $grandChild = $this->createItem($user, $doc, ['content' => 'grandchild', 'parent_id' => (string) $child->id, 'sort_order' => 0]);
        $other = $this->createItem($user, $doc, ['content' => 'lain', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-delete-batch'), ['ids' => [(string) $root->id]])
            ->assertOk()
            ->assertJsonPath('deleted', 3);

        $this->assertSoftDeleted('items', ['_id' => $root->id]);
        $this->assertSoftDeleted('items', ['_id' => $child->id]);
        $this->assertSoftDeleted('items', ['_id' => $grandChild->id]);
        $this->assertDatabaseHas('items', ['_id' => $other->id]);
    }

    public function test_delete_batch_is_idempotent(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc);
        $id = (string) $item->id;

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-delete-batch'), ['ids' => [$id]])
            ->assertOk();

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, '-delete-batch'), ['ids' => [$id]])
            ->assertOk()
            ->assertJsonPath('deleted', 0);
    }

    public function test_delete_batch_does_not_touch_another_users_items(): void
    {
        $userA = $this->createUser(['email' => 'a@example.com']);
        $userB = $this->createUser(['email' => 'b@example.com']);
        $docA = $this->createDocument($userA);
        $itemA = $this->createItem($userA, $docA);

        $this->withHeaders($this->authHeaders($userB))
            ->postJson($this->batchUrl($docA, '-delete-batch'), ['ids' => [(string) $itemA->id]])
            ->assertNotFound();

        $this->assertDatabaseHas('items', ['_id' => $itemA->id]);
    }

    // -----------------------------------------------------------------
    // Regression: the single-item endpoint must keep working
    // -----------------------------------------------------------------

    public function test_single_item_update_still_works(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'lama']);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson($this->batchUrl($doc, '/' . $item->id), ['content' => 'baru'])
            ->assertOk()
            ->assertJsonPath('data.content', 'baru');

        $this->assertSame('baru', $item->fresh()->content);
        $this->assertSame(1, ItemRevision::where('item_id', (string) $item->id)->count());
    }

    public function test_single_item_update_keeps_creating_revisions_up_to_the_limit(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'v0']);

        for ($i = 1; $i <= 55; $i++) {
            $this->withHeaders($this->authHeaders($user))
                ->patchJson($this->batchUrl($doc, '/' . $item->id), ['content' => "v{$i}"])
                ->assertOk();
        }

        $this->assertSame('v55', $item->fresh()->content);
        $this->assertLessThanOrEqual(50, ItemRevision::where('item_id', (string) $item->id)->count());
    }

    public function test_batch_update_respects_the_revision_limit(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);
        $item = $this->createItem($user, $doc, ['content' => 'v0']);

        for ($round = 0; $round < 3; $round++) {
            $items = [];
            for ($i = 0; $i < 25; $i++) {
                $items[] = ['id' => (string) $item->id, 'content' => "r{$round}-{$i}"];
            }

            $this->withHeaders($this->authHeaders($user))
                ->patchJson($this->batchUrl($doc, '-batch'), ['items' => $items])
                ->assertOk();
        }

        $this->assertLessThanOrEqual(50, ItemRevision::where('item_id', (string) $item->id)->count());
    }

    public function test_indent_and_unindent_single_endpoints_still_work(): void
    {
        $user = $this->createUser();
        $doc = $this->createDocument($user);

        $a = $this->createItem($user, $doc, ['content' => 'A', 'sort_order' => 0]);
        $b = $this->createItem($user, $doc, ['content' => 'B', 'sort_order' => 1]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, "/{$b->id}/indent"))
            ->assertOk();

        $this->assertSame((string) $a->id, (string) $b->fresh()->parent_id);

        $this->withHeaders($this->authHeaders($user))
            ->postJson($this->batchUrl($doc, "/{$b->id}/unindent"))
            ->assertOk();

        $this->assertNull($b->fresh()->parent_id);
    }
}

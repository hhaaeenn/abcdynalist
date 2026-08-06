<?php

namespace Tests\Feature;

use Tests\TestCase;

class WebPagesTest extends TestCase
{
    public function test_login_page_renders(): void
    {
        $response = $this->get('/login');

        $response->assertOk();
        $response->assertSee('id="login-form"', false);
        $response->assertSee('data-page="login"', false);
    }

    public function test_register_page_renders(): void
    {
        $response = $this->get('/register');

        $response->assertOk();
        $response->assertSee('id="register-form"', false);
        $response->assertSee('data-page="register"', false);
    }

    public function test_app_shell_contains_all_ui_elements(): void
    {
        $response = $this->get('/app');

        $response->assertOk();
        $response->assertSee('data-page="app"', false);

        $ids = [
            'file-pane',
            'doc-tree',
            'add-btn',
            'add-menu',
            'opml-input',
            'quick-finder-btn',
            'collapse-pane',
            'rail-toggle-pane',
            'rail-toggle-bookmarks',
            'logout-btn',
            'bookmarks-panel',
            'bookmarks-list',
            'bookmarks-close',
            'quick-finder',
            'qf-input',
            'qf-results',
            'sr-modal',
            'sr-find',
            'sr-replace',
            'sr-count',
            'sr-replace-all',
            'toast',
            'main-empty',
            'doc-toolbar',
            'doc-view',
            'doc-container',
            'doc-title',
            'doc-meta',
            'outline',
            'outline-loading',
            'bookmark-doc-btn',
            'ctx-menu',
        ];

        foreach ($ids as $id) {
            $response->assertSee('id="'.$id.'"', false);
        }

        $response->assertSee('build/assets/app-', false);
        $response->assertSee('.js', false);
        $response->assertSee('.css', false);
    }

    public function test_home_redirects_to_app(): void
    {
        $response = $this->get('/');

        $response->assertRedirect('/app');
    }
}

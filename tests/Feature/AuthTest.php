<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\User;

class AuthTest extends ApiTestCase
{
    public function test_register_creates_user_inbox_and_token(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'New User',
            'email' => 'new@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonStructure(['token', 'user' => ['id']]);

        $user = User::where('email', 'new@example.com')->first();
        $this->assertNotNull($user);

        $inbox = Document::where('user_id', $user->id)->where('is_inbox', true)->first();
        $this->assertNotNull($inbox);
        $this->assertSame('Inbox', $inbox->name);
    }

    public function test_register_rejects_duplicate_email(): void
    {
        $this->createUser(['email' => 'dup@example.com']);

        $this->postJson('/api/auth/register', [
            'name' => 'Dup User',
            'email' => 'dup@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertStatus(422);
    }

    public function test_register_rejects_mismatched_password_confirmation(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'New User',
            'email' => 'new2@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'different',
        ])->assertStatus(422);
    }

    public function test_login_and_me(): void
    {
        $user = $this->createUser(['email' => 'login@example.com']);

        $login = $this->postJson('/api/auth/login', [
            'email' => 'login@example.com',
            'password' => 'password123',
        ])->assertOk()
            ->assertJsonPath('status', 'success');

        $token = $login->json('token');
        $this->assertNotNull($token);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.email', 'login@example.com');
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        $this->createUser(['email' => 'login2@example.com']);

        $this->postJson('/api/auth/login', [
            'email' => 'login2@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(401);
    }

    public function test_logout_revokes_token(): void
    {
        $user = $this->createUser();
        $headers = $this->authHeaders($user);

        $this->withHeaders($headers)->postJson('/api/auth/logout')->assertOk();

        $this->assertSame(0, $user->tokens()->count());

        $this->app['auth']->forgetGuards();

        $this->withHeaders($headers)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_protected_routes_require_token(): void
    {
        $this->getJson('/api/documents')->assertStatus(401);
    }
}

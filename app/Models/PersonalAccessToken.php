<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;
use MongoDB\Laravel\Eloquent\DocumentModel;
use MongoDB\Laravel\Query\Builder;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    use DocumentModel;

    protected $connection = 'mongodb';

    protected $collection = 'personal_access_tokens';

    public $incrementing = true;

    protected $keyType = 'string';

    protected $casts = [
        'abilities' => 'json',
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    protected $fillable = [
        'name',
        'token',
        'abilities',
        'expires_at',
    ];

    protected $hidden = [
        'token',
    ];

    protected function newBaseQueryBuilder()
    {
        $connection = $this->getConnection();

        return new Builder($connection, $connection->getQueryGrammar(), $connection->getPostProcessor());
    }

    public function tokenable()
    {
        return $this->morphTo('tokenable');
    }

    public static function findToken($token)
    {
        if (strpos($token, '|') === false) {
            return static::where('token', hash('sha256', $token))->first();
        }

        [$id, $token] = explode('|', $token, 2);

        if ($instance = static::find($id)) {
            return hash_equals($instance->token, hash('sha256', $token)) ? $instance : null;
        }
    }

    public function can($ability)
    {
        return in_array('*', $this->abilities, true) ||
               in_array($ability, $this->abilities, true);
    }

    public function cant($ability)
    {
        return ! $this->can($ability);
    }
}

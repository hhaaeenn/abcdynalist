<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use MongoDB\Laravel\Eloquent\SoftDeletes;

class Document extends Model
{
    use SoftDeletes;

    protected $connection = 'mongodb';

    protected $table = 'documents';

    protected $fillable = [
        'user_id',
        'type',        // 'folder' | 'document'
        'name',
        'parent_id',   // null = root level
        'sort_order',
        'is_inbox',
        'settings',
        'share_token',
        'publish_token',
        'publish_password',
    ];

    protected $casts = [
        'is_inbox' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function items()
    {
        return $this->hasMany(Item::class, 'document_id');
    }
}

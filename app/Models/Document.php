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
        'color',       // color label dokumen
        'settings',
        'share_token',
        'publish_token',
        'publish_password',
    ];

    protected $casts = [
        'is_inbox' => 'boolean',
        'sort_order' => 'integer',
    ];

    protected $hidden = [
        'share_token',
        'publish_token',
        'publish_password',
    ];

    protected $appends = [
        'share_enabled',
        'share_url',
        'publish_enabled',
        'publish_url',
    ];

    public function getShareEnabledAttribute()
    {
        return ! empty($this->share_token);
    }

    public function getShareUrlAttribute()
    {
        return $this->share_token ? url('/share/'.$this->share_token) : null;
    }

    public function getPublishEnabledAttribute()
    {
        return ! empty($this->publish_token);
    }

    public function getPublishUrlAttribute()
    {
        return $this->publish_token ? url('/publish/'.$this->publish_token) : null;
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function items()
    {
        return $this->hasMany(Item::class, 'document_id');
    }
}

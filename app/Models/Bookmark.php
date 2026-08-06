<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Bookmark extends Model
{
    protected $connection = 'mongodb';

    protected $table = 'bookmarks';

    protected $fillable = [
        'user_id',
        'target_type',   // 'document' | 'item'
        'target_id',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

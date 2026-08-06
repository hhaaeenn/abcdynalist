<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use MongoDB\Laravel\Eloquent\SoftDeletes;

class Item extends Model
{
    use SoftDeletes;

    protected $connection = 'mongodb';

    protected $table = 'items';

    protected $fillable = [
        'user_id',
        'document_id',
        'parent_id',   // null = root level of document
        'content',
        'note',
        'checked',
        'heading',     // 0 | 1 | 2 | 3
        'color',
        'bullet',      // 'bullet' | 'checklist' | 'numbered'
        'tags',
        'sort_order',
    ];

    protected $casts = [
        'checked' => 'boolean',
        'heading' => 'integer',
        'sort_order' => 'integer',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }

    public function children()
    {
        return $this->hasMany(Item::class, 'parent_id');
    }
}

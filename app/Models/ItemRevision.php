<?php

namespace App\Models;

use App\Models\Concerns\NormalizesDateAttributes;
use MongoDB\Laravel\Eloquent\Model;

class ItemRevision extends Model
{
    use NormalizesDateAttributes;

    protected $connection = 'mongodb';

    protected $table = 'item_revisions';

    protected $fillable = [
        'user_id',
        'item_id',
        'document_id',
        'content',
        'note',
        'checked',
        'heading',
        'color',
        'bullet',
    ];

    protected $casts = [
        'checked' => 'boolean',
        'heading' => 'integer',
    ];
}

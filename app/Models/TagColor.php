<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class TagColor extends Model
{
    protected $connection = 'mongodb';

    protected $table = 'tag_colors';

    protected $fillable = [
        'user_id',
        'tag',
        'color',
    ];
}

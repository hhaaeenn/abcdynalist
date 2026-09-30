<?php

namespace App\Models;

use App\Models\Concerns\NormalizesDateAttributes;
use MongoDB\Laravel\Eloquent\Model;

class TagColor extends Model
{
    use NormalizesDateAttributes;

    protected $connection = 'mongodb';

    protected $table = 'tag_colors';

    protected $fillable = [
        'user_id',
        'tag',
        'color',
    ];
}

<?php

namespace App\Models\Concerns;

use DateTimeInterface;
use MongoDB\BSON\UTCDateTime;

/**
 * Legacy records may hold a date column as something other than a date (an
 * array or an object, for example). Laravel pushes every key returned by
 * getDates() through asDateTime() while serialising a model, so one malformed
 * value aborts the whole response with a TypeError. Values that cannot be
 * parsed as a date are dropped to null as the model is hydrated, which keeps
 * the rest of the record readable.
 */
trait NormalizesDateAttributes
{
    /** @var array<class-string, list<string>> */
    protected static array $dateAttributeKeys = [];

    public function setRawAttributes(array $attributes, $sync = false)
    {
        return parent::setRawAttributes(
            $this->normalizeMalformedDateAttributes($attributes), $sync
        );
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    protected function normalizeMalformedDateAttributes(array $attributes): array
    {
        foreach ($this->dateAttributeKeys() as $key) {
            if (array_key_exists($key, $attributes) && ! $this->isParsableDateValue($attributes[$key])) {
                $attributes[$key] = null;
            }
        }

        return $attributes;
    }

    /**
     * Date columns this model reads as dates: the timestamp columns plus any
     * attribute cast to a date type.
     *
     * @return list<string>
     */
    protected function dateAttributeKeys(): array
    {
        if (isset(static::$dateAttributeKeys[static::class])) {
            return static::$dateAttributeKeys[static::class];
        }

        $dateCasts = array_keys(array_filter(
            $this->getCasts(),
            fn ($cast) => in_array($cast, ['date', 'datetime', 'immutable_date', 'immutable_datetime', 'timestamp'], true)
        ));

        return static::$dateAttributeKeys[static::class] = array_values(array_unique(
            array_merge($this->getDates(), $dateCasts)
        ));
    }

    protected function isParsableDateValue(mixed $value): bool
    {
        return $value === null
            || $value instanceof UTCDateTime
            || $value instanceof DateTimeInterface
            || is_string($value)
            || is_int($value);
    }
}

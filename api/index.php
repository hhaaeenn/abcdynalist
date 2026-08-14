<?php

/**
 * Serverless function entry untuk deployment Vercel.
 * Vercel mengarahkan seluruh request ke file ini (lihat vercel.json),
 * yang kemudian me-boot Laravel melalui public/index.php.
 */
require __DIR__.'/../public/index.php';

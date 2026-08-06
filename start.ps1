<#
.SYNOPSIS
    Menjalankan Dynalist API (Laravel 12 + MongoDB Atlas).

.DESCRIPTION
    - Memastikan .env dan vendor sudah siap
    - Menjalankan migrasi (collection + index MongoDB) bila belum
    - Menjalankan server di http://127.0.0.1:8000/api

.PARAMETER Tests
    Jalankan test suite (memakai DB terpisah: dynalist_test) tanpa menjalankan server.

.PARAMETER Fresh
    Reset database (HAPUS SEMUA DATA) lalu migrasi ulang. Akan diminta konfirmasi.

.EXAMPLE
    .\start.ps1
    .\start.ps1 -Tests
    .\start.ps1 -Fresh
#>
param(
    [switch]$Tests,
    [switch]$Fresh
)

$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot

function Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

# 0. Pastikan PHP tersedia.
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Error "PHP tidak ditemukan di PATH. Contoh jalur: C:\laragon\bin\php\php-8.x"
    exit 1
}

# 1. Pastikan .env ada (buat dari .env.example bila belum).
if (-not (Test-Path -LiteralPath ".env")) {
    Step "Membuat .env dari .env.example (atur MONGO_DSN & MONGO_DATABASE bila perlu)"
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    php artisan key:generate --ansi
}

# 2. Pastikan dependency terinstal.
if (-not (Test-Path -LiteralPath "vendor\autoload.php")) {
    Step "Menginstal dependency (composer install)"
    composer install
}

# 3. Migrasi database (MongoDB Atlas - cloud, tidak perlu service lokal).
if ($Fresh) {
    $dbLine = (Get-Content -LiteralPath ".env" | Select-String '^MONGO_DATABASE=').Line
    $dbName = ($dbLine -replace '^MONGO_DATABASE=', '').Trim()
    if (-not $dbName) { $dbName = "(default)" }

    Step "Migrasi FRESH akan menghapus seluruh data di database '$dbName'"
    $answer = Read-Host "Lanjutkan? (y/N)"
    if ($answer -notmatch '^[yY]') {
        Write-Host "Dibatalkan." -ForegroundColor Yellow
        exit 0
    }
    php artisan migrate:fresh --force
} else {
    Step "Menjalankan migrasi (aman diulang - tidak menghapus data)"
    php artisan migrate --force
}

# 4. Test atau server.
if ($Tests) {
    Step "Menjalankan test (DB terpisah: dynalist_test)"
    php artisan test
    exit $LASTEXITCODE
}

Step "Server siap: http://127.0.0.1:8000/api (Ctrl+C untuk berhenti)"
php artisan serve

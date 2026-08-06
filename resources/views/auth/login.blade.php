@extends('layouts.app')

@section('page', 'login')
@section('title', 'Login - Dynalist')

@section('content')
<div class="min-h-screen flex items-center justify-center bg-[#f5f4f3] px-4">
    <div class="w-full max-w-sm">
        <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[#24221f] text-white mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" />
                    <path d="M5 12a7 7 0 0 1 14 0" />
                </svg>
            </div>
            <h1 class="text-2xl font-semibold tracking-tight">Dynalist</h1>
            <p class="text-sm text-[#77716b] mt-1">Masuk untuk melanjutkan</p>
        </div>

        <form id="login-form" class="bg-white rounded-xl shadow-sm border border-black/5 p-6 space-y-4" novalidate>
            <div>
                <label for="email" class="block text-sm font-medium mb-1.5">Email</label>
                <input type="email" id="email" required autocomplete="email" placeholder="nama@email.com"
                    class="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:border-[#d9a441] focus:ring-2 focus:ring-[#d9a441]/30">
            </div>
            <div>
                <label for="password" class="block text-sm font-medium mb-1.5">Password</label>
                <input type="password" id="password" required autocomplete="current-password" placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                    class="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:border-[#d9a441] focus:ring-2 focus:ring-[#d9a441]/30">
            </div>
            <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></div>
            <button type="submit" id="submit-btn"
                class="w-full bg-[#24221f] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition">
                Masuk
            </button>
        </form>

        <p class="text-center text-sm text-[#77716b] mt-6">
            Belum punya akun?
            <a href="/register" class="text-[#d9a441] font-medium hover:underline">Daftar gratis</a>
        </p>
    </div>
</div>
@endsection

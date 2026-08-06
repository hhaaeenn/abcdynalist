<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;

class PageController extends Controller
{
    public function home(): RedirectResponse
    {
        return redirect('/app');
    }

    public function login()
    {
        return view('auth.login');
    }

    public function register()
    {
        return view('auth.register');
    }

    public function app()
    {
        return view('app');
    }
}

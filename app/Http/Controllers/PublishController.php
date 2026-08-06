<?php

namespace App\Http\Controllers;

use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class PublishController extends Controller
{
    public function view(Request $request, $token)
    {
        $document = Document::where('publish_token', $token)->first();

        if (! $document) {
            abort(404);
        }

        $locked = ! empty($document->publish_password);

        if ($locked) {
            $password = (string) $request->query('password', '');

            if ($password === '') {
                return response()->view('publish', [
                    'document' => $document,
                    'locked' => true,
                    'wrongPassword' => false,
                    'ordered' => [],
                ]);
            }

            if (! Hash::check($password, $document->publish_password)) {
                return response()->view('publish', [
                    'document' => $document,
                    'locked' => true,
                    'wrongPassword' => true,
                    'ordered' => [],
                ]);
            }
        }

        return view('publish', [
            'document' => $document,
            'locked' => false,
            'wrongPassword' => false,
            'ordered' => ShareController::buildOrdered($document->user_id, $document->id),
        ]);
    }
}

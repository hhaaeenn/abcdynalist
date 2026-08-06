<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $document->name }} · Dynalist</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #faf9f8; color: #24221f; font-family: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
        .sh-head { max-width: 760px; margin: 0 auto; padding: 32px 24px 8px; }
        .sh-head h1 { font-size: 24px; font-weight: 600; margin: 0 0 4px; }
        .sh-head p { margin: 0; font-size: 13px; color: #8a857e; }
        .sh-body { max-width: 760px; margin: 0 auto; padding: 12px 24px 64px; }
        .sh-row { display: flex; align-items: flex-start; gap: 10px; padding: 2px 0; }
        .sh-bullet { flex-shrink: 0; margin-top: 4px; font-size: 14px; line-height: 20px; min-width: 20px; text-align: center; color: #8a857e; }
        .sh-check { width: 12px; height: 12px; border: 1.5px solid currentColor; border-radius: 3px; margin: 6px auto 0; }
        .sh-check.on { background: #16a34a; border-color: #16a34a; position: relative; }
        .sh-check.on::after { content: ""; position: absolute; left: 2px; top: 0px; width: 4px; height: 7px; border: solid #fff; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
        .sh-check.off { border-color: #8a857e; }
        .sh-content { flex: 1; min-width: 0; font-size: 14px; line-height: 1.6; }
        .sh-content.is-checked { color: #b5b0a9; text-decoration: line-through; }
        .sh-content h1 { font-size: 19px; font-weight: 700; margin: 0; }
        .sh-content h2 { font-size: 16px; font-weight: 700; margin: 0; }
        .sh-content h3 { font-size: 14px; font-weight: 600; margin: 0; }
        .sh-box { display: inline-block; background: var(--c); color: #fff; border-radius: 4px; padding: 0 7px; }
        .sh-note { margin-top: 2px; font-size: 12.5px; color: #8a857e; white-space: pre-wrap; }
        .sh-tag, .sh-date { color: #c07a12; }
        .sh-link { color: #2563eb; text-decoration: none; }
        .sh-internal { color: #7c3aed; }
        code { background: #f1efec; border-radius: 3px; padding: 0 3px; font-size: 12.5px; }
        mark { background: #fff3db; padding: 0 3px; border-radius: 3px; }
        .sh-empty { text-align: center; color: #b5b0a9; padding: 40px 0; font-size: 14px; }
        .sh-gate { max-width: 360px; margin: 64px auto; text-align: center; }
        .sh-gate h2 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
        .sh-gate p { margin: 0 0 18px; font-size: 13px; color: #8a857e; }
        .sh-gate input { width: 100%; padding: 10px 12px; border: 1px solid #e0dcd5; border-radius: 8px; font-size: 14px; margin-bottom: 12px; }
        .sh-gate button { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #c07a12; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
        .sh-gate .err { color: #dc2626; font-size: 12.5px; margin-bottom: 10px; }
        .sh-gate .hint { margin-top: 12px; font-size: 12px; color: #b5b0a9; }
    </style>
</head>
<body>
    @if ($locked)
        <div class="sh-gate">
            <h2>{{ $document->name }}</h2>
            <p>Dokumen ini dilindungi kata sandi.</p>
            @if ($wrongPassword)
                <div class="err">Kata sandi salah. Coba lagi.</div>
            @endif
            <form method="GET" action="{{ url()->current() }}">
                <input type="password" name="password" placeholder="Masukkan kata sandi" autofocus>
                <button type="submit">Buka</button>
            </form>
            <div class="hint">Diterbitkan dari Dynalist</div>
        </div>
    @else
        <div class="sh-head">
            <h1>{{ $document->name }}</h1>
            <p>Diterbitkan dari Dynalist · mode baca saja</p>
        </div>
        <div class="sh-body">
            @if (count($ordered) === 0)
                <div class="sh-empty">Dokumen ini masih kosong.</div>
            @else
                @foreach ($ordered as $item)
                    @php
                        $bulletType = $item->bullet === 'bullet' ? 'bullet' : ($item->bullet === 'numbered' ? 'numbered' : 'checklist');
                        $headingCls = match ($item->heading) { 1 => 'h1', 2 => 'h2', 3 => 'h3', default => '' };
                        $number = implode('.', array_merge($item->parentCounters, [$item->num]));
                    @endphp
                    <div class="sh-row" style="margin-left: {{ $item->depth * 24 }}px;">
                        <div class="sh-bullet">
                            @if ($bulletType === 'checklist')
                                <span class="sh-check {{ $item->checked ? 'on' : 'off' }}"></span>
                            @elseif ($bulletType === 'numbered')
                                {{ $number }}
                            @else
                                •
                            @endif
                        </div>
                        <div>
                            <div class="sh-content {{ $headingCls }} {{ $item->checked ? 'is-checked' : '' }}">
                                @if ($item->color && ! $item->checked)
                                    <span class="sh-box" style="--c: {{ $item->color }};">{!! \App\Http\Controllers\ShareController::renderContent($item->content) !!}</span>
                                @else
                                    {!! \App\Http\Controllers\ShareController::renderContent($item->content) !!}
                                @endif
                            </div>
                            @if ($item->note)
                                <div class="sh-note">{{ $item->note }}</div>
                            @endif
                        </div>
                    </div>
                @endforeach
            @endif
        </div>
    @endif
</body>
</html>

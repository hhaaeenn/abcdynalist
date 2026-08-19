@extends('layouts.app')

@section('page', 'app')
@section('title', 'ABCLIST')

@section('content')
<div class="h-screen flex overflow-hidden">

    {{-- Vertical icon rail --}}
    <aside id="rail" class="w-11 shrink-0 bg-[#e9e8e7] border-r border-black/5 flex flex-col items-center py-2 gap-1">
        <button id="rail-toggle-pane" title="Toggle file pane"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
            aria-label="Toggle file pane">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
            </svg>
        </button>
        <button id="rail-toggle-bookmarks" title="Bookmarks"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
            aria-label="Bookmarks">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
        </button>
        <button id="rail-toggle-backlinks" title="Backlinks"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
            aria-label="Backlinks">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
        </button>
        <button id="rail-toggle-trash" title="Trash dokumen"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
            aria-label="Trash dokumen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
            </svg>
        </button>
        <button id="logout-btn" title="Keluar"
            class="mt-auto w-8 h-8 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-red-500 hover:text-white transition"
            aria-label="Keluar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
            </svg>
        </button>
    </aside>

    {{-- File pane --}}
    <aside id="file-pane" class="w-64 shrink-0 bg-[#f4f3f2] border-r border-black/10 flex flex-col transition-[margin-left,width] duration-200">
        <div class="flex items-center justify-between px-3 pt-3 pb-1">
            <h2 class="pane-heading text-[11px] font-bold uppercase tracking-wider text-[#8a857e]">My files</h2>
            <div class="flex items-center gap-0.5">
                <button id="quick-finder-btn" title="Quick Finder"
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
                    aria-label="Quick Finder">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                </button>
                <button id="sort-docs-btn" title="Urutkan dokumen A–Z"
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
                    aria-label="Urutkan dokumen">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                        <path d="m3 16 4 4 4-4" />
                        <path d="M7 20V4" />
                        <path d="M11 8h10" />
                        <path d="M17 4v4" />
                        <path d="M17 8v12" />
                    </svg>
                </button>
                <button id="collapse-pane" title="Collapse file pane"
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-[#5a5650] hover:bg-black/10 hover:text-black transition"
                    aria-label="Collapse file pane">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </button>
            </div>
        </div>

        <div class="px-3 pb-2">
            <div class="relative">
                <button id="add-btn"
                    class="w-full flex items-center gap-2 rounded-lg bg-white border border-black/10 hover:border-[#d9a441] hover:shadow-sm px-2.5 py-1.5 text-[13px] font-medium text-[#24221f] transition">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="w-3.5 h-3.5 text-[#c07a12]">
                        <path d="M5 12h14M12 5v14" />
                    </svg>
                    New
                </button>
                <div id="add-menu" class="hidden absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-black/10 py-1">
                    <button data-action="document"
                        class="w-full text-left px-3 py-2 text-[13px] hover:bg-[#f4f3f2] flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[#8a857e]">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                        </svg>
                        New document
                    </button>
                    <button data-action="folder"
                        class="w-full text-left px-3 py-2 text-[13px] hover:bg-[#f4f3f2] flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[#8a857e]">
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                        </svg>
                        New folder
                    </button>
                    <button data-action="opml"
                        class="w-full text-left px-3 py-2 text-[13px] hover:bg-[#f4f3f2] flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[#8a857e]">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M12 15V3" />
                        </svg>
                        Import from OPML
                    </button>
                    <input type="file" id="opml-input" accept=".opml,text/xml" class="hidden">
                </div>
            </div>
        </div>

        <nav id="doc-tree" class="flex-1 overflow-y-auto px-2 pb-4 space-y-px"></nav>

        <div class="border-t border-black/5 px-3 pt-2 pb-3">
            <h2 class="pane-heading text-[11px] font-bold uppercase tracking-wider text-[#8a857e] mb-1.5">Tags</h2>
            <div id="tags-list" class="max-h-40 overflow-y-auto space-y-px"></div>
        </div>
    </aside>

    {{-- Bookmarks panel (overlay) --}}
    <aside id="bookmarks-panel"
        class="hidden w-64 shrink-0 bg-[#f4f3f2] border-r border-black/10 flex-col absolute left-11 top-0 bottom-0 z-30 shadow-xl">
        <div class="flex items-center justify-between px-3 pt-3 pb-2">
            <h2 class="text-[11px] font-bold uppercase tracking-wider text-[#8a857e]">Bookmarks</h2>
            <button id="bookmarks-close" title="Tutup"
                class="w-7 h-7 flex items-center justify-center rounded-md text-[#5a5650] hover:bg-black/10 hover:text-black transition"
                aria-label="Tutup bookmarks">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div id="bookmarks-list" class="flex-1 overflow-y-auto px-2 pb-4 space-y-px">
        </div>
    </aside>

    {{-- Trash panel (overlay) --}}
    <aside id="trash-panel"
        class="hidden w-72 shrink-0 bg-[#f4f3f2] border-r border-black/10 flex-col absolute left-11 top-0 bottom-0 z-30 shadow-xl">
        <div class="flex items-center justify-between px-3 pt-3 pb-2">
            <h2 class="text-[11px] font-bold uppercase tracking-wider text-[#8a857e]">Trash</h2>
            <div class="flex items-center gap-1">
                <button id="trash-docs-empty" title="Kosongkan Trash"
                    class="w-7 h-7 flex items-center justify-center rounded-md text-[#5a5650] hover:bg-black/10 hover:text-red-600 transition"
                    aria-label="Kosongkan Trash">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <button id="trash-docs-close" title="Tutup"
                    class="w-7 h-7 flex items-center justify-center rounded-md text-[#5a5650] hover:bg-black/10 hover:text-black transition"
                    aria-label="Tutup trash">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
        <div id="trash-docs-list" class="flex-1 overflow-y-auto px-2 pb-4 space-y-px">
        </div>
    </aside>

    {{-- Main area --}}
    <main id="main" class="flex-1 overflow-hidden flex flex-col bg-[#faf9f8]">
        {{-- Toolbar --}}
        <div id="doc-toolbar" class="hidden shrink-0 h-[36px] px-2.5 border-b border-black/5 bg-white flex items-center justify-between overflow-x-auto">
            <div class="flex items-center gap-0.5">
                <button id="undo-btn" title="Undo (Ctrl+Z)" class="tool-btn" disabled>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
                </button>
                <button id="redo-btn" title="Redo (Ctrl+Y)" class="tool-btn" disabled>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
                </button>
                <button data-act="add" title="Tambah item (Enter)" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-[17px] h-[17px]"><path d="M5 12h14M12 5v14"/></svg>
                </button>
                <span class="w-px h-5 bg-black/10 mx-1 shrink-0"></span>
                <button data-act="search" title="Cari dalam dokumen (Ctrl+F)" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </button>
                <button data-act="view-options" title="Opsi tampilan" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#fff"/><circle cx="15" cy="12" r="2" fill="#fff"/><circle cx="7" cy="18" r="2" fill="#fff"/></svg>
                </button>
            </div>
            <div class="flex items-center gap-0.5">
                <button id="trash-btn" title="Trash" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <button id="bookmark-doc-btn" title="Bookmark dokumen" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <button id="reminder-btn" title="Pengingat" class="tool-btn relative">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                    <span id="reminder-badge" class="hidden absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none"></span>
                </button>
                <button data-act="settings" title="Pengaturan" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
                <button id="help-btn" title="Pintasan keyboard (?)" class="tool-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[17px] h-[17px]"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                </button>
            </div>
        </div>

        {{-- View options popover (like ABCLIST) --}}
        <div id="view-options" class="hidden fixed z-40 min-w-[210px] rounded-lg border border-black/10 bg-white shadow-lg py-1 text-[13px] text-[#24221f]">
            <div class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8a857e]">Item selesai</div>
            <button data-view="completed" data-val="global" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Global</button>
            <button data-view="completed" data-val="show" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Tampilkan</button>
            <button data-view="completed" data-val="hide" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Sembunyikan</button>
            <div class="h-px bg-black/10 my-1"></div>
            <div class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8a857e]">Catatan</div>
            <button data-view="notes" data-val="global" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Global</button>
            <button data-view="notes" data-val="show" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Tampilkan</button>
            <button data-view="notes" data-val="first" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Baris pertama</button>
            <button data-view="notes" data-val="hide" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Sembunyikan</button>
            <div class="h-px bg-black/10 my-1"></div>
            <div class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8a857e]">Spacing</div>
            <button data-view="spacing" data-val="dense" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Padat</button>
            <button data-view="spacing" data-val="normal" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Normal</button>
            <button data-view="spacing" data-val="wide" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Luas</button>
            <div class="h-px bg-black/10 my-1"></div>
            <div class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8a857e]">Tema</div>
            <button data-view="theme" data-val="light" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Terang</button>
            <button data-view="theme" data-val="dark" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Gelap</button>
            <button data-view="theme" data-val="sepia" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Sepia</button>
            <div class="h-px bg-black/10 my-1"></div>
            <div class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8a857e]">Bullet item baru</div>
            <button data-view="bullet" data-val="checklist" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Checklist</button>
            <button data-view="bullet" data-val="bullet" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Bullet</button>
            <button data-view="bullet" data-val="numbered" class="view-opt w-full flex items-center gap-2 px-3 py-1 hover:bg-[#f4f3f2]">Numbered</button>
        </div>

        {{-- Popover pengingat --}}
        <div id="reminder-pop" class="hidden fixed z-40 min-w-[240px] max-w-[320px] rounded-lg border border-black/10 bg-white shadow-lg py-1 text-[13px] text-[#24221f]">
            <div class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8a857e]">Pengingat</div>
            <div id="reminder-list" class="max-h-72 overflow-y-auto py-0.5"></div>
            <div class="h-px bg-black/10 my-1"></div>
            <button id="reminder-notify-toggle" class="view-opt w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#f4f3f2]">
                <span id="reminder-notify-label" class="flex-1">Notifikasi browser</span>
            </button>
        </div>

        <div id="doc-view" class="flex-1 overflow-y-auto">
            <div id="main-empty" class="h-full flex flex-col items-center justify-center text-center px-6">
                <div class="empty-blob inline-flex items-center justify-center w-16 h-16 rounded-2xl text-[#c07a12] mb-5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="1" fill="currentColor" />
                        <path d="M5 12a7 7 0 0 1 14 0" />
                    </svg>
                </div>
                <h2 class="font-display text-xl font-semibold text-[#24221f]">Selamat datang di ABCLIST</h2>
                <p class="text-sm text-[#8a857e] mt-2 max-w-sm leading-relaxed">
                    Pilih dokumen di panel kiri, atau buat dokumen baru dengan tombol
                    <span class="font-medium text-[#24221f]">New</span>.
                </p>
            </div>

        {{-- Bar cari dalam dokumen (Ctrl+F) seperti ABCLIST --}}
        <div id="doc-searchbar" class="hidden fixed top-11 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-3">
            <div class="flex items-center gap-2 rounded-xl border border-black/10 bg-white shadow-lg px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0 text-[#8a857e]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input id="doc-search-input" type="text" placeholder="Cari dalam dokumen… (Ctrl+Enter = semua dokumen, Shift+Enter = semua item)"
                    class="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm text-[#24221f] placeholder:text-[#c5c0b9]">
                <span id="doc-search-count" class="shrink-0 text-[12px] text-[#8a857e] whitespace-nowrap"></span>
                <span id="doc-search-flat-hint" class="hidden shrink-0 text-[11px] font-medium text-[#c07a12] whitespace-nowrap">Semua item</span>
                <span class="shrink-0 w-px h-4 bg-black/10"></span>
                <button id="doc-search-prev" title="Sebelumnya (Shift+Tab)" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-[#5a5650] hover:bg-black/5">↑</button>
                <button id="doc-search-next" title="Berikutnya (Enter)" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-[#5a5650] hover:bg-black/5">↓</button>
                <button id="doc-search-close" title="Tutup (Esc)" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-[#8a857e] hover:bg-black/5">✕</button>
            </div>
        </div>

            <div id="doc-container" class="hidden max-w-3xl mx-auto px-10 py-8">
                <div id="doc-breadcrumb" class="hidden flex items-center gap-1.5 text-[12.5px] text-[#8a857e] mb-1"></div>
                <div class="group flex items-center gap-1">
                    <input id="doc-title"
                        class="flex-1 min-w-0 text-3xl font-semibold bg-transparent border-none focus:outline-none placeholder:text-[#c5c0b9]"
                        placeholder="Tanpa judul">
                    <button id="doc-menu-btn" title="Menu dokumen"
                        class="opacity-0 group-hover:opacity-100 shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#8a857e] hover:bg-black/5 hover:text-[#24221f] transition"
                        aria-label="Menu dokumen">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                    </button>
                </div>
                <p id="doc-meta" class="text-xs text-[#b5b0a9] mt-1.5"></p>
                <div id="doc-tags" class="hidden flex flex-wrap gap-1.5 mt-4"></div>
                <div id="outline" class="mt-7"></div>
            </div>

            <div id="tag-results" class="hidden max-w-3xl mx-auto px-10 py-8">
                <div class="flex items-center gap-3 mb-4">
                    <h2 id="tag-results-title" class="text-2xl font-semibold text-[#24221f]"></h2>
                    <button id="tag-results-close" type="button"
                        class="text-[13px] text-[#c07a12] hover:underline">Tutup</button>
                </div>
                <div id="tag-results-color" class="hidden flex items-center gap-1.5 mb-4"></div>
                <div id="tag-results-list" class="space-y-1"></div>
            </div>

            <div id="trash-view" class="hidden max-w-3xl mx-auto px-10 py-8">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-2xl font-semibold text-[#24221f]">Trash</h2>
                    <div class="flex items-center gap-4">
                        <button id="trash-empty" type="button"
                            class="text-[13px] text-red-600 hover:underline">Kosongkan Trash</button>
                        <button id="trash-close" type="button"
                            class="text-[13px] text-[#c07a12] hover:underline">Kembali</button>
                    </div>
                </div>
                <p class="text-[13px] text-[#8a857e] mb-4">Item yang dihapus berada di sini dan dapat dipulihkan.</p>
                <p id="trash-empty-msg" class="hidden py-10 text-center text-sm text-[#8a857e]">Trash kosong.</p>
                <div id="trash-list" class="space-y-1"></div>
            </div>
        </div>

        {{-- Status bar (word count + save indicator) --}}
        <div id="status-bar" class="hidden shrink-0 h-[24px] px-3 border-t border-black/5 bg-white flex items-center justify-end gap-4 text-[11px] text-[#8a857e]">
            <span id="status-save" class="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M20 6 9 17l-5-5"/></svg>
                <span id="status-save-text">Tersimpan</span>
            </span>
            <span id="status-count" class="whitespace-nowrap"></span>
            <span id="status-words" class="whitespace-nowrap"></span>
        </div>
    </main>

    {{-- Backlinks panel (overlay kanan) --}}
    <aside id="backlinks-panel"
        class="hidden w-72 shrink-0 bg-[#f4f3f2] border-l border-black/10 flex-col absolute right-0 top-0 bottom-0 z-30 shadow-xl">
        <div class="flex items-center justify-between px-3 pt-3 pb-2">
            <h2 class="text-[11px] font-bold uppercase tracking-wider text-[#8a857e]">Backlinks</h2>
            <button id="backlinks-close" title="Tutup"
                class="w-7 h-7 flex items-center justify-center rounded-md text-[#5a5650] hover:bg-black/10 hover:text-black transition"
                aria-label="Tutup backlinks">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div id="backlinks-list" class="flex-1 overflow-y-auto px-2 pb-4 space-y-px">
            <p class="px-1 py-4 text-center text-[13px] text-[#8a857e]">Pilih item untuk melihat referensinya.</p>
        </div>
    </aside>
</div>

{{-- Quick Finder modal --}}
<div id="quick-finder" class="hidden fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/25" data-close></div>
    <div class="relative max-w-xl mx-auto mt-24 bg-white rounded-xl shadow-2xl border border-black/10 overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-black/5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-[#8a857e] shrink-0">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
            </svg>
            <input id="qf-input" type="text" placeholder="Cari dokumen atau bookmark…"
                class="w-full bg-transparent text-[15px] focus:outline-none placeholder:text-[#b5b0a9]"
                autocomplete="off">
        </div>
        <div id="qf-results" class="max-h-80 overflow-y-auto py-1">
            <p id="qf-empty" class="px-4 py-6 text-center text-[13px] text-[#8a857e]">
                Mulai mengetik untuk mencari dokumen Anda.
            </p>
        </div>
        <div class="flex items-center justify-end gap-4 px-4 py-2 border-t border-black/5 text-[11px] text-[#8a857e]">
            <span><kbd class="kbd">&#8593;</kbd> <kbd class="kbd">&#8595;</kbd> navigasi</span>
            <span><kbd class="kbd">&#9166;</kbd> buka</span>
            <span><kbd class="kbd">Esc</kbd> tutup</span>
        </div>
    </div>
</div>

{{-- Search & Replace modal --}}
<div id="sr-modal" class="hidden fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/25" data-sr-close></div>
    <div class="relative max-w-md mx-auto mt-24 bg-white rounded-xl shadow-2xl border border-black/10 p-5 space-y-3">
        <h3 class="text-sm font-semibold text-[#24221f]">Cari & ganti</h3>
        <input id="sr-find" type="text" placeholder="Cari…"
            class="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:border-[#d9a441] focus:ring-2 focus:ring-[#d9a441]/30">
        <label class="flex items-center gap-2 text-[13px] text-[#5a5650]">
            <input id="sr-match" type="checkbox" class="rounded accent-[#d9a441]">
            Cocokkan besar/kecil huruf
        </label>
        <input id="sr-replace" type="text" placeholder="Ganti dengan… (kosongkan untuk menghapus)"
            class="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:border-[#d9a441] focus:ring-2 focus:ring-[#d9a441]/30">
        <div id="sr-result" class="hidden text-sm text-[#5a5650]"></div>
        <div class="flex items-center justify-end gap-2 pt-1">
            <button id="sr-cancel"
                class="px-3 py-1.5 rounded-lg text-[13px] text-[#5a5650] hover:bg-black/5 transition">Batal</button>
            <button id="sr-count"
                class="px-3 py-1.5 rounded-lg text-[13px] text-[#5a5650] hover:bg-black/5 transition">Hitung</button>
            <button id="sr-replace-all"
                class="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white bg-[#24221f] hover:bg-black transition">Ganti semua</button>
        </div>
    </div>
</div>

{{-- Shortcut help modal --}}
<div id="help-modal" class="hidden fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/25" data-help-close></div>
    <div class="relative max-w-2xl mx-auto mt-14 bg-white rounded-xl shadow-2xl border border-black/10 p-5 max-h-[82vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-[#24221f]">Pintasan &amp; Formatting</h3>
            <button id="help-close" type="button" class="text-[12px] text-[#8a857e] hover:text-[#24221f]">Tutup</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
                <div class="help-head">Mengedit</div>
                <div class="help-row"><kbd class="kbd">Enter</kbd><span>Item baru di bawah</span></div>
                <div class="help-row"><kbd class="kbd">Shift</kbd>+<kbd class="kbd">Enter</kbd><span>Beralih item / note</span></div>
                <div class="help-row"><kbd class="kbd">Tab</kbd><span>Indent</span></div>
                <div class="help-row"><kbd class="kbd">Shift</kbd>+<kbd class="kbd">Tab</kbd><span>Unindent</span></div>
                <div class="help-row"><kbd class="kbd">Spasi</kbd><span>Tandai / selesai</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Enter</kbd><span>Tandai selesai</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">Enter</kbd><span>Baris baru</span></div>
                <div class="help-row"><kbd class="kbd">Del</kbd><span>Hapus item</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">↑</kbd><span>Pindah ke atas</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">↓</kbd><span>Pindah ke bawah</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Z</kbd><span>Undo</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Y</kbd><span>Redo</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">.</kbd><span>Lipat / buka lipatan item</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">.</kbd><span>Lipat / buka semua</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">]</kbd><span>Zoom masuk</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">[</kbd><span>Zoom keluar</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">D</kbd><span>Duplikat item</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">C</kbd><span>Salin item</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">X</kbd><span>Potong item</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">V</kbd><span>Tempel sebagai anak</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">V</kbd><span>Tempel sebagai saudara</span></div>
            </div>
            <div>
                <div class="help-head">Format (saat mengedit)</div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">B</kbd><span>Tebal</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">I</kbd><span>Miring</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">K</kbd><span>Buat tautan</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">E</kbd><span>Keluar dari mode edit</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">E</kbd><span>Kode</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">C</kbd><span>Jadikan checklist</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">X</kbd><span>Jadikan bernomor</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">H</kbd><span>Ubah ke judul</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">L</kbd><span>Siklus warna</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">M</kbd><span>Pindah ke dokumen lain</span></div>
                <div class="help-head">Global</div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">F</kbd><span>Cari dalam dokumen</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">P</kbd> / <kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">O</kbd><span>Cari cepat dokumen</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">P</kbd> / <kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">O</kbd><span>Cari cepat item</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">B</kbd><span>Panel bookmark</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">Shift</kbd>+<kbd class="kbd">F</kbd><span>Alihkan panel kiri</span></div>
                <div class="help-row"><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">?</kbd> / <kbd class="kbd">?</kbd><span>Bantuan ini</span></div>
                <div class="help-row"><kbd class="kbd">Esc</kbd><span>Tutup dialog</span></div>
            </div>
        </div>
        <div class="mt-6">
            <div class="help-head mb-2">Format (Markdown)</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                <div class="help-row"><code class="md">**teks**</code><span>Tebal</span></div>
                <div class="help-row"><code class="md">__teks__</code><span>Miring</span></div>
                <div class="help-row"><code class="md">~~teks~~</code><span>Coret</span></div>
                <div class="help-row"><code class="md">==teks==</code><span>Sorotan</span></div>
                <div class="help-row"><code class="md">`kode`</code><span>Kode inline</span></div>
                <div class="help-row"><code class="md">```blok```</code><span>Blok kode</span></div>
                <div class="help-row"><code class="md">[label](url)</code><span>Tautan</span></div>
                <div class="help-row"><code class="md">![alt](url)</code><span>Gambar</span></div>
                <div class="help-row"><code class="md">[[label|id-item]]</code><span>Tautan antar item</span></div>
                <div class="help-row"><code class="md">#tag</code><span>Tag</span></div>
                <div class="help-row"><code class="md">$$e=mc^2$$</code><span>Rumus (LaTeX)</span></div>
                <div class="help-row"><code class="md">@2026-08-10</code><span>Tanggal</span></div>
                <div class="help-row"><code class="md">!2026-08-10</code><span>Pengingat (bisa + jam: !2026-08-10 14:30)</span></div>
            </div>
        </div>
    </div>
</div>

{{-- Settings modal --}}
<div id="settings-modal" class="hidden fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/25" data-settings-close></div>
    <div class="relative max-w-md mx-auto mt-16 bg-white rounded-xl shadow-2xl border border-black/10 p-5 space-y-4 max-h-[82vh] overflow-y-auto">
        <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-[#24221f]">Pengaturan</h3>
            <button type="button" data-settings-close class="text-[12px] text-[#8a857e] hover:text-[#24221f]">Tutup</button>
        </div>

        <div>
            <div class="settings-label">Tema</div>
            <div class="flex items-center gap-1">
                <button data-pref="theme" data-val="light" class="pref-btn flex-1">Terang</button>
                <button data-pref="theme" data-val="dark" class="pref-btn flex-1">Gelap</button>
                <button data-pref="theme" data-val="sepia" class="pref-btn flex-1">Sepia</button>
            </div>
        </div>

        <div>
            <div class="settings-label">Spacing</div>
            <div class="flex items-center gap-1">
                <button data-pref="spacing" data-val="dense" class="pref-btn flex-1">Padat</button>
                <button data-pref="spacing" data-val="normal" class="pref-btn flex-1">Normal</button>
                <button data-pref="spacing" data-val="wide" class="pref-btn flex-1">Luas</button>
            </div>
        </div>

        <div>
            <div class="settings-label">Ukuran font</div>
            <div class="flex items-center gap-1">
                <button data-pref="fontSize" data-val="small" class="pref-btn flex-1">Kecil</button>
                <button data-pref="fontSize" data-val="medium" class="pref-btn flex-1">Sedang</button>
                <button data-pref="fontSize" data-val="large" class="pref-btn flex-1">Besar</button>
            </div>
        </div>

        <div>
            <div class="settings-label">Default item selesai</div>
            <div class="flex items-center gap-1">
                <button data-pref="globalCompleted" data-val="show" class="pref-btn flex-1">Tampilkan</button>
                <button data-pref="globalCompleted" data-val="hide" class="pref-btn flex-1">Sembunyikan</button>
            </div>
        </div>

        <div>
            <div class="settings-label">Default catatan</div>
            <div class="flex items-center gap-1">
                <button data-pref="globalNotes" data-val="show" class="pref-btn flex-1">Tampilkan</button>
                <button data-pref="globalNotes" data-val="first" class="pref-btn flex-1">Baris pertama</button>
                <button data-pref="globalNotes" data-val="hide" class="pref-btn flex-1">Sembunyikan</button>
            </div>
        </div>

        <div class="settings-label">Tampilan</div>
        <label class="flex items-center gap-2.5 text-[13px] text-[#24221f]">
            <input type="checkbox" data-pref-toggle="highlightCurrent" class="rounded accent-[#d9a441]">
            Sorot item aktif
        </label>
        <label class="flex items-center gap-2.5 text-[13px] text-[#24221f]">
            <input type="checkbox" data-pref-toggle="narrow" class="rounded accent-[#d9a441]">
            Tampilan sempit (kolom dokumen lebih sempit)
        </label>
        <label class="flex items-center gap-2.5 text-[13px] text-[#24221f]">
            <input type="checkbox" data-pref-toggle="bulletZoom" class="rounded accent-[#d9a441]">
            Klik bullet = zoom ke item
        </label>
        <label class="flex items-center gap-2.5 text-[13px] text-[#24221f]">
            <input type="checkbox" data-pref-toggle="showWordCount" class="rounded accent-[#d9a441]">
            Tampilkan jumlah kata di bilah bawah
        </label>
        <label class="flex items-center gap-2.5 text-[13px] text-[#24221f]">
            <input type="checkbox" data-pref-toggle="reminderNotify" class="rounded accent-[#d9a441]">
            Notifikasi browser untuk pengingat (!tanggal)
        </label>
    </div>
</div>

{{-- Context menu --}}
<div id="ctx-menu" class="hidden fixed z-50 min-w-[200px] max-w-[260px] max-h-[min(480px,calc(100vh-96px))] overflow-y-auto bg-white rounded-lg shadow-xl border border-black/10 py-1"></div>

{{-- Toast --}}
<div id="toast" class="hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#24221f] text-white text-[13px] px-4 py-2.5 rounded-lg shadow-lg"></div>
@endsection

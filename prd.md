# PRD — Item Editor & Delete Experience (Dynalist-parity)

**Status:** Disetujui untuk dikerjakan (P0 → P1 → P3)
**Owner:** Farhan
**Target:** `https://abcdynalist-36sb.vercel.app`
**Terakhir diupdate:** 2026-09-30

---

## 1. Ringkasan

Outline Dynalist harus berperilaku sebagai **satu permukaan pengedit kontinu**, bukan kumpulan kotak per item. Ada satu caret, satu item aktif, dan `contentEditable` diturunkan dari state aplikasi — bukan diasumsikan. Setiap item adalah baris teks di dalam satu dokumen; tidak ada mode "terpilih" yang terpisah dari mode "diedit".

---

## 2. Masalah (terverifikasi di kode)

| Gejala yang dilaporkan | Penyebab | Bukti |
|---|---|---|
| Tekan Backspace sekali → satu item beserta **seluruh anaknya** lenyap; list terasa "melewati" isi | Cabang shortcut B1: Backspace polos pada item terpilih memanggil `deleteItem`, yaitu hapus seluruh subtree | `resources/js/document.js:5972-5976` |
| Menekan Backspace beruntun terasa macet di tiap ketikan | Tiap `deleteItem` menjalankan `recordUndo()` (snapshot seluruh dokumen) + `render()` (build ulang semua row, ulang render KaTeX) → O(dokumen) per ketikan | `document.js:3979`, `3987`, `4464`, `4511` |
| Setelah hapus, keyboard mati dan harus klik item lain | `nav()` / `deleteItem` / Home / End mengindeks `flat`, yang memuat item **tidak ter-render** (completed disembunyikan, anak parent yang di-collapse, tag filter) → `selectItem` dapat id tanpa row → `focus()` tidak terjadi | `document.js:3988`, `4296-4304`, `6013/6016` vs `561` |
| Item terakhir dihapus → aplikasi mati total | Paragraf `doc-empty` dibuat tapi tidak pernah di-focus | `document.js:562-577` |
| Satu item = satu langkah undo, rantai panjang butuh banyak `Ctrl+Z` | `recordUndo()` melakukan push snapshot di setiap pemanggilan | `document.js:4523` |
| Tidak ada penanda item aktif | `.item-row.selected` dipaksa `background: transparent; box-shadow: none` | `resources/css/app.css:562-565` |

---

## 3. Tujuan

- **G1** — Backspace menghapus **karakter**; item baru hilang setelah teksnya kosong.
- **G2** — Tidak ada lagi jalan buntu keyboard dalam keadaan dokumen apa pun (dokumen kosong, item tersembunyi, filter aktif).
- **G3** — Delete beruntun terasa instan dan merupakan **satu** langkah undo.
- **G4** — Tidak ada state "terpilih" yang terpisah; klik berarti masuk edit.

---

## 4. Non-tujuan

- Gaya visual item aktif (kotak atau background) — **ditolak produk**, caret adalah penanda.
- Editing inline multi-baris penuh, tabel, collaborative cursor.
- Draft lokal atau antrean offline.
- B2 (create batch 1,5 detik) — fase terpisah, lihat §12.

---

## 5. Prinsip produk

1. **Satu permukaan.** Tidak ada affordance per item; caret yang menandai posisi kerja.
2. **Teks dulu, item kemudian.** Penghapusan berjenjang: karakter → item kosong → modifier untuk item beserta anak.
3. **Tidak pernah kehilangan fokus.** Aksi apa pun harus menyisakan caret di teks yang bisa langsung diketik.
4. **Tidak pernah membangun ulang DOM yang tidak perlu.** Render penuh hanya bila struktur benar-benar berubah.

---

## 6. Model state

```
Item ber-render : NORMAL ──startEdit()──▶ EDITING ──commitEdit/cancelEdit──▶ NORMAL
                  (contenteditable=false)   (contenteditable=true, caret di dalam teks)

Item tak tampil  : HIDDEN_BY_FILTER (completed disembunyikan / parent di-collapse / tag filter)

App-wide         : selectedId — penunjuk baris ter-render, boleh null
```

**Invariant:** `editing === true` ⇔ `rows.get(selectedId).text.isContentEditable === true`.

`render()` adalah satu-satunya tempat yang membangun ulang DOM, dan **wajib** melakukan `commitEdit()` lebih dulu bila masih ada edit berjalan (`document.js:531-535`, sudah diimplementasikan).

---

## 7. Spesifikasi perilaku

### 7.1 Masuk dan keluar edit

| Aksi | Hasil | Status |
|---|---|---|
| Klik pada teks item | Masuk edit, caret di posisi klik (`caretRangeFromPoint`), seleksi teks dibersihkan | **Ubah** (revert B4) |
| Ketik karakter pada item NORMAL | Masuk edit, karakter itu tertanam di caret | Buang (type-to-edit tidak perlu lagi) |
| Double-click | Masuk edit, caret di posisi klik | Buang (redundan dengan klik) |
| `Ctrl+E` atau entri menu "Edit" | Masuk edit, caret di akhir teks | Sudah ada |
| Klik pada bullet, chevron, tanggal, atau tag | Toggle checklist, collapse, date picker, tag picker — **tidak** masuk edit | Sudah ada |
| Klik di luar outline | `commitEdit` (blur 100 ms) → NORMAL | Sudah ada |
| `Esc` | `cancelEdit`, teks dikembalikan seperti semula, caret tetap di teks | Sudah ada |
| Panah `↑`/`↓`, `Home`/`End`, `PageUp`/`PageDown` | Pindah caret ke baris ter-render **dan** masuk edit | **Ubah** |

### 7.2 Backspace / Delete — tabel keputusan (authoritative)

Dievaluasi berurutan; kondisi pertama yang cocok menang.

| # | Kondisi | Aksi |
|---|---|---|
| 1 | Autocomplete tag terbuka | `↑`/`↓`/`Enter`/`Tab` memilih, `Esc` menutup — teks tidak berubah |
| 2 | Ada seleksi lintas item | Hapus rentang lintas item, gabungkan, caret di awal hasil |
| 3 | Ada image di caret | Hapus image itu saja |
| 4 | Teks item kosong (`trim() === ''`) | `deleteItem` → item **beserta subtree** hilang; caret ke baris ter-render berikutnya, atau ke placeholder kosong |
| 5 | `Backspace`, caret di offset 0, ada previous sibling | `mergeItems(prev, cur)` — teks dan anak digabung ke item sebelumnya |
| 6 | `Backspace`, caret di offset 0, tanpa previous sibling tetapi punya parent | `unindent` satu level |
| 7 | `Delete`, caret di akhir, ada next sibling | `mergeItems(cur, next)` |
| 8 | `Backspace` dengan seleksi teks di dalam item | **Default browser** (hapus seleksi) |
| 9 | `Backspace`/`Delete` lainnya | **Default browser** (hapus satu karakter); caret tidak boleh keluar dari teks |
| 10 | `Backspace`/`Delete` dengan `multi.size > 1` | `bulkDelete` (blok seleksi) |
| 11 | `Ctrl+Shift+Backspace` | `deleteItem` seketika (shortcut resmi "Delete item"), dari keadaan mana pun |
| 12 | `Backspace` di dalam textarea note | **Default browser** — hanya note yang berubah (regression guard `isTypingTarget`) |

Aturan tambahan:

- Setelah `deleteItem`, caret **wajib** di-`startEdit` pada baris ter-render berikutnya, sehingga menahan Backspace melanjutkan ke teks item berikutnya karakter demi karakter (efek berantai tanpa menghapus isi).
- Jika tidak ada baris ter-render tersisa, caret pindah ke `.doc-empty` dan fokus diberikan ke sana.
- Tidak ada item yang boleh hilang bersama anak-anaknya melalui Backspace polos; itu harus eksplisit (baris 11).

### 7.3 Pemblokiran dan Hambatan

- Semua perpindahan caret dibatasi ke **baris yang benar-benar ter-render**, lewat `renderedFlat()` yang diturunkan dari `lastVisibleIds` (`document.js:561`).
- Shortcut dengan modifier yang tidak dikenai diabaikan di awal handler outline, sehingga tidak bocor ke editor.
- Auto-repeat: tidak ada throttle. Delete tidak boleh menumpuk request (lihat §9).

### 7.4 Penyimpanan

- Edit masuk `write-queue`: satu PATCH `/items-batch` per ledakan ketikan, `DEBOUNCE_MS = 1500`, `MAX_WAIT_MS = 5000` (`resources/js/write-queue.js`).
- Status bar: `Menyimpan…` lalu `Tersimpan` via event `dyn:save-start` / `dyn:save-end`; `dyn:save-failed` menampilkan alert **tanpa reload dokumen** (`document.js:6132`).
- Penambahan item dengan `Enter` masih `POST` per item —_phase B2, lihat §12.

### 7.5 Undo / Redo

- `Ctrl+Z` / `Ctrl+Y` tetap memakai snapshot penuh + `render()` penuh (`applySnapshotLocal`).
- Rangkaian delete yang berasal dari keyboard (jendela 1,5 detik, hanya dari handler keydown) adalah **satu** langkah undo.

---

## 8. Acceptance criteria (verifikasi manual di browser produksi)

| ID | Given | When | Then |
|---|---|---|---|
| AC-1 | dokumen dengan ≥ 3 item bertingkat | klik item 3 | caret muncul di posisi klik, bisa langsung mengetik |
| AC-2 | item 3 berisi teks dan 2 anak | tahan `Backspace` | teks item 3 habis karakter demi karakter; hanya saat kosong item 3 **dan** 2 anaknya hilang |
| AC-3 | item 3 berisi teks | `Backspace` di awal baris | item 3 gabung ke item 2, anak ikut menjadi anak item 2 |
| AC-4 | item 3 di posisi akhir | `Delete` | teks item 4 masuk ke item 3 |
| AC-5 | item punya anak | `Ctrl+Shift+Backspace` | item beserta anak hilang dalam satu ketikan, tanpa mengosongkan teks lebih dulu |
| AC-6 | note terbuka di item | `Backspace` di dalam textarea note | hanya karakter note yang terhapus, item tetap ada |
| AC-7 | "sembunyikan yang selesai" aktif | tekan `↓` berulang melewati item completed | caret tidak pernah hilang, tidak ada item yang terlewat |
| AC-8 | dokumen hanya berisi 1 item | hapus item itu | placeholder ter-focus, mengetik langsung membuat item baru |
| AC-9 | 5 item dihapus beruntun | `Ctrl+Z` sekali | kelima item kembali dengan urutan benar |
| AC-10 | dokumen berisi 60 item | tekan `Backspace` beruntun | tiap ketikan di bawah 50 ms, tidak ada freeze |
| AC-11 | dokumen berisi 500 item | tekan `↓` 20 kali | hanya aksi struktural eksplisit (filter, zoom, collapse) yang memicu `render()` penuh |
| AC-12 | apa pun | muat ulang halaman | tidak ada item hilang atau duplikat, status `Tersimpan` tampil |

---

## 9. Kebutuhan non-fungsional

- **Performa** — delete bedah (P3): hapus elemen DOM subtree item yang dihapus, lalu sinkronkan `rows`, `lastVisibleIds`, word count, dan reminder badge. `render()` penuh hanya sebagai fallback, yaitu saat dokumen menjadi kosong, `tagFilter` aktif, atau item yang dihapus adalah leluhur zoom root. Target: hapus item di bawah 16 ms pada dokumen 500 item.
- **Konsistensi state** — invariant pada §6 harus selalu berlaku; tidak boleh ada kondisi di mana aplikasi mengira sedang edit sementara teksnya inert.
- **Aksesibilitas** — caret selalu terlihat; item yang sedang diedit tidak boleh dibedakan hanya dengan warna.
- **i18n** — teks shortcut di UI berbahasa Indonesia, mengikuti gaya yang sudah dipakai (`document.js:830`, `2505`).

---

## 10. Pemetaan shortcut (hasil akhir)

| Aksi | Shortcut | Sumber |
|---|---|---|
| Hapus item beserta anak | `Ctrl+Shift+Backspace` | Dynalist |
| Hapus satu karakter | `Backspace` | perilaku editor |
| Gabung ke item sebelumnya | `Backspace` di offset 0 | perilaku editor |
| Item kosong menjadi hilang | `Backspace` | §7.2 baris 4 |
| Masuk edit eksplisit | `Ctrl+E`, klik, entri menu | tambahan produk |
| Catatan | `Shift+Enter` | Dynalist |
| Tandai selesai | `Ctrl+Enter` | Dynalist |
| Indent / unindent | `Tab` / `Shift+Tab` | Dynalist |
| Kolaps | `Ctrl+.` | Dynalist |
| Bold / italic / code | `Ctrl+B` / `Ctrl+I` / `` Ctrl+` `` | Dynalist |
| Blok seleksi | `Shift+↑`/`↓`, `Ctrl`+klik | Dynalist |
| Zoom | `Ctrl+]` / `Ctrl+[` | Dynalist |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` | Dynalist |

---

## 11. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Revert B1/B4: user sempat terbiasa dengan "Backspace hapus item cepat" | Itu memang permintaannya sekarang; penghapusan subtree menjadi eksplisit lewat `Ctrl+Shift+Backspace` dan menu konteks, dan rantai delete bisa dibatalkan dengan satu `Ctrl+Z` |
| Delete bedah (P3) meninggalkan `rows` atau `lastVisibleIds` tidak sinkron | `render()` penuh sebagai fallback pada tiga kondisi struktural; `undo`/`redo` selalu render penuh; verifikasi lewat AC-9 dan AC-11 |
| Jendela undo 1,5 detik menggabungkan dua delete yang dimaksud terpisah | Jendela pendek dan hanya berlaku untuk delete yang dipicu keyboard; `recordUndo` menerima flag eksplisit |
| Fokus hilang di jalur filter atau collapse lain | Semua jalur caret melewati `renderedFlat()`; `selectItem` menolak id tanpa row |
| Belum ada test runner JS | `package.json` hanya punya `build` dan `dev`; verifikasi manual memakai AC-1 sampai AC-12 |

---

## 12. Fase berikutnya (di luar lingkup PRD ini)

- **B2 — create batch.** `queueCreate()` di `write-queue.js` dengan jendela 1,5 detik (sudah diputuskan). Create dikirim sebelum patch, dan `tmp_id → real_id` dari `ItemController::createBatch` di-remap ke seluruh operasi berikutnya (`patch`, `move`, `delete`) serta ke state aplikasi. Saat unload, patch terakhir digabung ke payload create. `ItemController::updateBatch` membuang id temp secara senyap, jadi urutan create-lalu-patch bersifat wajib.
- **P1a — `ItemController::index`.** Belum memfilter `user_id` dan belum ada paginasi → IDOR.
- **P1b — validasi image.** Endpoint image yang tidak ada-op, ukuran, dan MIME; sekalian pakai `NormalizesDateAttributes` untuk tanggal.
- **Test suite PHP.** Masih terblokir `.env` yang rusak dan `phpunit.xml` yang belum dikonfigurasi.

---

## 13. Rilis

Trunk-based, `public/build` ikut di-commit. Urutan: **P0** → build → deploy → verifikasi manual → **P1 + P3** → build → deploy. Rollback dengan `git revert` commit P0/P3, lalu satu build untuk mengembalikan bundle lama. Deploy selalu lewat push ke `main`; verifikasi lewat endpoint `/up` dan referensi bundle di HTML.

---

## Lampiran A — Peta kode

| Konsep | Lokasi |
|---|---|
| Render dokumen, `lastVisibleIds`, paragraf `doc-empty` | `resources/js/document.js:531-582` |
| `buildRow`, elemen teks, `contentEditable` default | `document.js:782-807` |
| Judul tombol hapus | `document.js:830` |
| Handler klik baris | `document.js:~915-932` |
| Handler `dblclick` (akan dibuang) | `document.js:1085-1091` |
| `isTypingTarget`, `isPrintableKey` (akan dibuang) | `document.js:1236-1250` |
| `refreshHighlights` | `document.js:1416` |
| `menuItemsFor` (entri Edit dan Delete) | `document.js:2436-2505` |
| `startEdit`, `ensureEditing`, `commitEdit`, `cancelEdit` | `document.js:3221-3295` |
| `handleEditKey` | `document.js:3325-3575` |
| `scheduleLiveRender` | `document.js:3815` |
| `deleteItem`, `removeNodeLocally` | `document.js:3976-3994`, `4117` |
| `nav`, `navInto`, `navOut` | `document.js:4296-4320` |
| `captureSnapshot`, `applySnapshotLocal`, `recordUndo` | `document.js:4464-4528` |
| Handler keydown outline (blok Ctrl dan blok selection) | `document.js:5857-6067` |
| Styling item terpilih | `resources/css/app.css:562-570`, `1100`, `1192`, `1451` |
| Kursor item yang sedang diedit | `resources/css/app.css:656` |
| Antrean tulis | `resources/js/write-queue.js` |
| Substitusi temp id hanya di path | `resources/js/api.js` |
| Endpoint batch item | `app/Http/Controllers/API/ItemController.php` (`createBatch`, `updateBatch`, `destroy`) |

---

## 14. Backlog — Dynalist-parity lanjutan (di luar §1-13)

**Status:** Dibuka 2026-09-30. Belum punya spesifikasi rinci — perlu detail konkret dari Owner (referensi/screenshot/link/deskripsi perilaku spesifik) sebelum tiap baris bisa naik jadi PRD tersendiri seperti §1-13. Dikerjakan satu area per sesi, bukan sekaligus.

### 14.1 Visual/tampilan

| Area | Gejala/beda yang dirasakan | Status |
|---|---|---|
| Spacing antar item | — | Perlu detail dari user |
| Font (family, ukuran, weight) | — | Perlu detail dari user |
| Warna (light/dark/sepia) | — | Perlu detail dari user |
| Gaya bullet (bentuk, ukuran, hover state) | — | Perlu detail dari user |

### 14.2 Keyboard shortcut & navigasi lain

*(Di luar Backspace/Delete/masuk-keluar-edit yang sudah dicakup §7-10.)*

| Area | Gejala/beda yang dirasakan | Status |
|---|---|---|
| — | — | Perlu daftar shortcut spesifik yang dirasa beda dari Dynalist.io |

### 14.3 Fitur outline struktural

| Area | Gejala/beda yang dirasakan | Status |
|---|---|---|
| Zoom in/out | — | Perlu detail dari user |
| Breadcrumb navigasi | — | Perlu detail dari user |
| Collapse/expand | — | Perlu detail dari user |
| Drag handle / reorder | — | Perlu detail dari user |

### 14.4 Mobile/touch

| Area | Gejala/beda yang dirasakan | Status |
|---|---|---|
| Tap | — | Perlu detail dari user |
| Long-press | — | Perlu detail dari user |
| Gesture (swipe, dll) | — | Perlu detail dari user |

### Cara mengisi backlog ini

Asisten (Claude) tidak punya akses ke Dynalist.io versi login untuk mencocokkan pixel-by-pixel, jadi tiap baris di atas butuh salah satu dari: (a) screenshot/rekaman layar Dynalist.io asli yang menunjukkan perilaku yang dimaksud, (b) link dokumentasi resmi Dynalist, atau (c) deskripsi tertulis yang cukup spesifik (elemen apa, kondisi apa, hasil yang diharapkan apa). Setelah salah satu area terisi detailnya, area itu ditulis ulang sebagai section PRD baru (mengikuti format §1-13: Ringkasan, Masalah, Tujuan, Spesifikasi, Acceptance Criteria) sebelum dieksekusi.

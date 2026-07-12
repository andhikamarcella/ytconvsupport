# YTConv Support

Website dukungan mandiri untuk YTConv dengan tampilan bersih bergaya aplikasi percakapan modern, tetapi tetap berfokus pada layanan bantuan manusia.

## Fitur

- Form tiket: nama, email, ID acak, kategori, dan deskripsi.
- ID tiket aman dengan format `TKT-XXXXXXXXXXXX`.
- Tiket tersimpan di PostgreSQL.
- Notifikasi tiket baru ke `help.ytconv@proton.me` melalui EmailJS.
- Email konfirmasi pengguna dan email perubahan status bersifat opsional.
- Halaman status publik: `/ticket-status.html?ticket_id=TKT-XXXXXXXXXXXX`.
- Panel admin di `/admin` untuk mencari tiket, mengubah status, dan menulis catatan publik.
- Cloudflare Turnstile, rate limit tiket, limit login admin, cookie admin HttpOnly, tema gelap, dan tampilan mobile.
- Halaman status tidak membocorkan nama, email, atau deskripsi laporan.

## Peringatan keamanan penting

Credential yang pernah ditempel ke chat, forum, screenshot, atau repository publik harus dianggap telah bocor. **Rotasi atau cabut semuanya sebelum memakai proyek ini**, terutama:

- password database dan URL PostgreSQL;
- Firebase service account/private key;
- Google OAuth client secret;
- Cloudinary API secret;
- Groq atau API key layanan AI;
- Spotify client secret;
- Turnstile secret;
- admin bearer, password, JWT/session secret;
- worker shared secret dan internal API key.

Proyek ini sengaja tidak menyimpan satu pun credential tersebut di source code.

## Struktur

```text
.
├── index.html                  # Form tiket
├── ticket-status.html          # Pelacakan tiket
├── admin.html                  # Panel admin
├── assets/                     # CSS dan JavaScript browser
├── api/                        # Vercel Functions
├── lib/                        # Database, keamanan, EmailJS, validasi
├── migrations/                 # Skema SQL manual
├── .env.example
├── package.json
└── vercel.json
```

## 1. Siapkan EmailJS

Buat satu Email Service di EmailJS, lalu siapkan template berikut.

### Template admin — wajib

Isi penerima atau **To Email** dengan:

```text
{{to_email}}
```

Subject:

```text
{{subject}}
```

Contoh isi:

```text
Tiket baru: {{ticket_id}}
Nama: {{customer_name}}
Email: {{customer_email}}
Kategori: {{category}}
Dibuat: {{created_at}}

Deskripsi:
{{description}}

Cek status:
{{status_url}}
```

Variabel yang tersedia:

```text
app_name
ticket_id
customer_name
customer_email
reply_to
category
description
status_url
created_at
support_email
to_email
subject
```

### Template konfirmasi pengguna — opsional

Gunakan `{{to_email}}` sebagai penerima. Variabelnya sama dengan template admin.

### Template perubahan status — opsional

Variabel tambahan:

```text
status
public_note
```

## 2. Atur Environment Variables

Salin `.env.example`, lalu isi nilainya di **Vercel → Project Settings → Environment Variables**.

Variabel utama:

```env
APP_NAME=YTConv
APP_ENV=production
PUBLIC_BASE_URL=https://domain-support-kamu.vercel.app
MAIN_APP_URL=https://ytconv.onrender.com
SUPPORT_EMAIL=help.ytconv@proton.me

DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_SSL=true

EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_ADMIN_TEMPLATE_ID=template_admin
EMAILJS_USER_TEMPLATE_ID=template_user_optional
EMAILJS_STATUS_TEMPLATE_ID=template_status_optional
EMAILJS_PUBLIC_KEY=xxxxxxxx
EMAILJS_PRIVATE_KEY=xxxxxxxx
EMAIL_REQUIRED=false

TURNSTILE_SITE_KEY=0x4AAAA...
TURNSTILE_SECRET_KEY=0x4AAAA...
TURNSTILE_STRICT=true

TICKET_RATE_LIMIT_MAX=5
TICKET_RATE_LIMIT_WINDOW_MS=300000

ADMIN_USER_HASH=sha256_username
ADMIN_PASS_HASH=sha256_password
ADMIN_JWT_SECRET=random-minimum-64-characters
ADMIN_SESSION_TTL_SECONDS=86400
ADMIN_LOGIN_MAX_ATTEMPTS=5
ADMIN_LOGIN_WINDOW_MS=900000
SESSION_SECRET=random-minimum-64-characters
```

`PUBLIC_BASE_URL` harus berisi domain website support, **bukan** domain YTConv utama. Nilai ini dipakai untuk membuat tautan status di email.

### Membuat hash username dan password admin

Jalankan di terminal:

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('USERNAME_BARU').digest('hex'))"
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('PASSWORD_BARU').digest('hex'))"
```

Masukkan hasilnya ke `ADMIN_USER_HASH` dan `ADMIN_PASS_HASH`. Setelah itu, variabel plaintext `ADMIN_USERNAME` dan `ADMIN_PASSWORD` tidak diperlukan.

### Membuat secret acak

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Gunakan secret berbeda untuk `ADMIN_JWT_SECRET` dan `SESSION_SECRET`.

## 3. Database

Tabel dibuat otomatis ketika API pertama kali dipanggil. Bila akun database tidak memiliki izin `CREATE TABLE`, jalankan file berikut secara manual:

```text
migrations/001_support_tickets.sql
```

Website ini dapat memakai `DATABASE_URL`, `DATABASE_SSL`, `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS`, dan `DB_IDLE_TIMEOUT_MS` yang pola namanya sama dengan environment YTConv.

## 4. Deploy ke Vercel

### Melalui GitHub

1. Upload folder ini ke repository baru.
2. Import repository tersebut di Vercel.
3. Tambahkan Environment Variables.
4. Deploy.

Tidak perlu menentukan framework atau build command. Folder `api/` akan dijalankan sebagai Vercel Functions dan file HTML akan disajikan sebagai halaman statis.

### Melalui terminal

```bash
npm install
npx vercel
```

Untuk production:

```bash
npx vercel --prod
```

## 5. Pengujian

Setelah deploy, buka:

```text
https://domain-support-kamu.vercel.app/api/health
```

Respons sehat:

```json
{"ok":true,"service":"ytconv-support"}
```

Lalu uji:

1. Buat tiket dari halaman utama.
2. Pastikan email masuk ke `help.ytconv@proton.me`.
3. Buka tautan status yang diberikan.
4. Masuk ke `/admin` dan ubah status tiket.
5. Pastikan status publik berubah.

## Status yang tersedia

- `open` — Tiket diterima
- `in_review` — Sedang diperiksa
- `waiting_user` — Menunggu balasan pengguna
- `resolved` — Selesai
- `closed` — Ditutup

## Catatan integrasi dengan YTConv utama

Proyek ini berjalan mandiri sehingga tidak bergantung pada CORS milik `ytconv.onrender.com`. Tombol “Kembali ke YTConv” tetap mengarah ke aplikasi utama. Jika kelak ingin memakai domain yang sama, file halaman dan API dapat dipindahkan ke repository YTConv lalu route-nya dipertahankan.

## Perbaikan deployment Vercel

Proyek memaksa npm menggunakan registry publik melalui `.npmrc` dan `installCommand`. Node.js dipatok ke `20.x` agar tidak otomatis berpindah ke major baru.

# YTConv Support — Cloudinary Edition

Website tiket dukungan YTConv untuk Vercel. Versi ini **tidak memakai PostgreSQL**. Setiap tiket disimpan sebagai satu file raw JSON terenkripsi di Cloudinary.

## Fitur

- Buat tiket: nama, email, ID tiket acak, kategori, dan deskripsi.
- Cek status melalui `/ticket-status.html?ticket_id=TKT-XXXXXXXXXXXX`.
- Dashboard admin di `/admin` untuk mencari dan memperbarui status tiket.
- EmailJS untuk notifikasi ke tim support dan pengguna.
- Cloudflare Turnstile untuk form tiket.
- Data sensitif tiket dienkripsi AES-256-GCM sebelum dikirim ke Cloudinary.

## Environment Variables wajib

```env
PUBLIC_BASE_URL=https://domain-support.vercel.app
MAIN_APP_URL=https://ytconv.onrender.com
SUPPORT_EMAIL=help.ytconv@proton.me

CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
CLOUDINARY_TICKET_FOLDER=ytconv/tickets
TICKET_ENCRYPTION_KEY=SECRET_ACAK_MINIMAL_32_KARAKTER

ADMIN_USER_HASH=HASH_SHA256_USERNAME
ADMIN_PASS_HASH=HASH_SHA256_PASSWORD
ADMIN_JWT_SECRET=SECRET_ACAK_MINIMAL_64_KARAKTER
SESSION_SECRET=SECRET_ACAK_MINIMAL_64_KARAKTER
```

Gunakan `CLOUDINARY_URL` utama. `CLOUDINARY_AUDIO_URL` tidak diperlukan untuk sistem tiket.

### Membuat secret enkripsi

```bash
openssl rand -base64 32
```

Simpan hasilnya sebagai `TICKET_ENCRYPTION_KEY`. **Jangan mengganti atau menghapus key ini setelah tiket dibuat**, karena tiket lama tidak akan bisa didekripsi.

### Membuat hash admin

```bash
printf '%s' 'username-admin' | sha256sum
printf '%s' 'password-admin-kuat' | sha256sum
```

Masukkan hasil hash pertama ke `ADMIN_USER_HASH` dan hasil kedua ke `ADMIN_PASS_HASH`.

## EmailJS

Environment yang didukung:

```env
EMAILJS_SERVICE_ID=service_xxxxx
EMAILJS_ADMIN_TEMPLATE_ID=template_admin
EMAILJS_USER_TEMPLATE_ID=template_user_optional
EMAILJS_STATUS_TEMPLATE_ID=template_status_optional
EMAILJS_PUBLIC_KEY=xxxxxxxx
EMAILJS_PRIVATE_KEY=xxxxxxxx
EMAIL_REQUIRED=false
```

Template admin sebaiknya mengirim ke `help.ytconv@proton.me` dan menerima parameter `ticket_id`, `name`, `email`, `category`, `description`, `created_at`, dan `status_url`.

## Deploy ke Vercel

```bash
npm install
npm run check
vercel --prod --force
```

Proyek dipatok ke Node.js `22.x` untuk runtime Vercel.

Setelah deploy, periksa:

```text
https://domain-support.vercel.app/api/health
```

Hasil normal:

```json
{
  "ok": true,
  "storage": {
    "ok": true,
    "provider": "cloudinary",
    "encrypted": true
  }
}
```

## Lokasi tiket di Cloudinary

Tiket berada pada folder yang ditentukan oleh `CLOUDINARY_TICKET_FOLDER`, default `ytconv/tickets`. Isinya adalah ciphertext JSON, bukan data pengguna dalam bentuk terbaca.

## Batasan

Cloudinary adalah media asset storage, bukan database transaksional. Versi ini cocok untuk sistem dukungan kecil hingga menengah. Dashboard membaca aset tiket dari Cloudinary dan batas jumlah yang dipindai dapat diatur melalui `CLOUDINARY_TICKET_LIST_MAX`.

## Keamanan

- Jangan memasukkan `CLOUDINARY_URL`, API secret, EmailJS private key, atau secret admin ke JavaScript browser.
- Rotasi seluruh credential yang pernah ditempel di chat, log, repository, atau screenshot.
- Simpan salinan aman `TICKET_ENCRYPTION_KEY`; kehilangan key berarti kehilangan akses ke isi tiket lama.


## Perbaikan email wajib

Cloudinary hanya menyimpan tiket; Cloudinary tidak mengirim email. Agar email terkirim, buat **Email Service** dan **Email Template** di EmailJS, lalu isi Environment Variables Vercel.

Pada template admin EmailJS, atur:

- **To Email:** `{{to_email}}`
- **Reply-To:** `{{reply_to}}`
- **Subject:** `{{subject}}`
- Isi pesan dapat memakai `{{ticket_id}}`, `{{name}}`, `{{email}}`, `{{category}}`, `{{description}}`, dan `{{status_url}}`.

Sesudah deploy, buka `/api/health`. Bagian `email.configured` harus `true`. Login `/admin`, kemudian tekan **Uji pengiriman email**. Tiket yang sebelumnya gagal memiliki tombol **Coba kirim email**.

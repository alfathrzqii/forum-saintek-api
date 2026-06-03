# Forum SAINTEK API

## Ringkasan Proyek
**Forum SAINTEK API** adalah RESTful API yang dibangun menggunakan Node.js dan Express untuk menggerakkan platform forum yang dirancang khusus untuk fakultas Sains dan Teknologi (SAINTEK). Platform ini memiliki fitur autentikasi pengguna, kontrol akses berbasis peran (role-based access control), subforum, thread (topik), komentar bersarang (nested), dan sistem pemungutan suara (voting).

### Fitur Utama
- **Manajemen Pengguna:** Registrasi, login, dan manajemen profil dengan peran (USER, MODERATOR, ADMIN).
- **Struktur Forum:** Subforum yang berisi berbagai thread.
- **Interaksi:** Thread mendukung penambahan gambar, posting anonim (gaya Saintekfess), dan voting.
- **Keterlibatan:** Komentar bersarang (gaya Reddit) dengan dukungan voting.
- **Keamanan:** Autentikasi berbasis JWT, hashing kata sandi menggunakan bcrypt, dan header keamanan dengan Helmet.

### Teknologi yang Digunakan
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL dengan Prisma ORM
- **Validasi:** Zod
- **Autentikasi:** JSON Web Token (JWT)
- **Logging:** Pino & Pino-http
- **Pengujian:** Jest & Supertest

---

## Panduan Instalasi dan Menjalankan Proyek

### Prasyarat
- Node.js (direkomendasikan v18+)
- Database PostgreSQL

### Instalasi
Clone repositori ini dan jalankan perintah berikut untuk menginstal semua dependensi:
```bash
npm install
```

### Setup Database
1. Buat file `.env` berdasarkan `env.example` yang tersedia (membutuhkan konfigurasi `DATABASE_URL`, `ACCESS_TOKEN_KEY`, `REFRESH_TOKEN_KEY`).
   Contoh `.env`:
   ```env
   PORT=3000
   NODE_ENV=development
   BASE_URL=http://localhost:3000

   DATABASE_URL=postgresql://user:password@localhost:5432/forum_saintek

   ACCESS_TOKEN_KEY=your_secret_access_token_key_here
   REFRESH_TOKEN_KEY=your_secret_refresh_token_key_here
   ```
2. Jalankan migrasi Prisma untuk membuat skema database:
   ```bash
   npx prisma migrate dev
   ```
3. Lakukan seeding database (untuk data awal):
   ```bash
   npm run seed
   ```

### Menjalankan Server
Untuk mode pengembangan (development):
```bash
npm run dev
```

Untuk mode produksi (production):
```bash
npm start
```

### Pengujian
Menjalankan semua pengujian:
```bash
npm test
```

Menjalankan pengujian beserta coverage:
```bash
npm run test:coverage
```

---

## Arsitektur
Proyek ini mengikuti pola **Layered Architecture**:

1.  **Routes (`src/api/routes`):** Mendefinisikan endpoint API dan menerapkan middleware (Auth, Role).
2.  **Controllers (`src/api/controllers`):** Menangani permintaan HTTP, memvalidasi input menggunakan Zod, dan mendelegasikan logika bisnis ke layanan.
3.  **Services (`src/services`):** Mengimplementasikan logika bisnis inti dan orkestrasi. Melemparkan pengecualian (exceptions) kustom untuk status kesalahan.
4.  **Repositories (`src/repositories`):** Mengabstraksi operasi database menggunakan Prisma.
5.  **Validators (`src/validators`):** Skema Zod terpusat untuk validasi body permintaan (request).
6.  **Exceptions (`src/exceptions`):** Kelas kesalahan kustom (misal, `InvariantError`, `NotFoundError`) untuk penanganan kesalahan yang konsisten.
7.  **Middlewares (`src/api/middlewares`):** Autentikasi, Otorisasi Peran, dan Penanganan Kesalahan Global.

## Konvensi Pengembangan

- **Pembaruan Kode:** Saat mengubah kode, ikuti Layered Architecture yang ada dengan ketat. Jangan melewati service atau repository.
- **Validasi:** Setiap permintaan POST/PUT harus divalidasi menggunakan skema Zod di controller sebelum mencapai service layer.
- **Penanganan Kesalahan:**
    - Gunakan pengecualian kustom dari `src/exceptions`.
    - Jangan menggunakan blok `try-catch` di controller untuk kesalahan operasional; biarkan `errorMiddleware` menanganinya melalui `next(error)`.
- **Database:** Semua interaksi database harus melalui repository di `src/repositories`.
- **Penamaan:**
    - Gunakan camelCase untuk variabel dan fungsi.
    - Penamaan file harus deskriptif (misal, `userController.js`, `userService.js`).
- **Pengujian:**
    - Pengujian integrasi lebih diutamakan dan harus ditempatkan di `tests/integration`.
    - Gunakan `supertest` untuk pengujian API.
    - Pastikan koneksi Prisma ditangani dengan benar pada `beforeAll`/`afterAll` untuk menghindari proses yang menggantung.
- **Keamanan:**
    - Selalu gunakan `authenticationMiddleware` untuk rute yang membutuhkan pengguna yang sudah masuk.
    - Gunakan `roleMiddleware(['ADMIN', 'MODERATOR'])` untuk tindakan yang dibatasi.
    - Jangan pernah mengembalikan data sensitif seperti kata sandi dalam respons API (gunakan metode `select` di Prisma untuk memfilter field).

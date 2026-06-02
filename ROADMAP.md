# 🚀 Roadmap Pengembangan Forum SAINTEK API

Laporan strategi untuk langkah-langkah selanjutnya guna meningkatkan kualitas dan skalabilitas project.

## 🟢 Fase 1: Pemantapan Testing & Robustness (Selesai)
*   [x] **Unit Testing Expansion:** Menambahkan unit test untuk seluruh `Service` (Authentication, User, Comment, Thread, Vote) dengan cakupan minimal 80%.
*   [x] **Edge Case Validation:** Melengkapi `Zod` schema untuk menangani edge case seperti format email fakultas spesifik atau limit karakter konten.
*   [x] **Error Message Localization:** Menstandarisasi pesan error agar lebih user-friendly (Bahasa Indonesia) di seluruh layer.

## 🟡 Fase 2: Optimasi Arsitektur (Prioritas Menengah)
*   **Global Service Context:** Mengimplementasikan pola `context` (userId, role) secara konsisten di semua parameter fungsi Service untuk mempermudah testing dan audit.
*   **Transaction Support:** Menambahkan mekanisme `$transaction` di layer Service untuk operasi yang bersifat atomik (contoh: posting thread yang sekaligus mencatat log aktivitas).
*   **Performance Audit:** Meninjau query Prisma untuk memastikan penggunaan `include` dan `select` yang efisien guna menghindari N+1 query problem.

## 🔵 Fase 3: Fitur Lanjutan & Dokumentasi (Prioritas Rendah)
*   **Swagger/OpenAPI Documentation:** Mengintegrasikan Swagger UI agar API memiliki dokumentasi interaktif yang selalu update.
*   **Cloudinary Integration Refinement:** Memastikan error handling saat upload gambar thread lebih tangguh.
*   **Automated CI/CD:** Menyiapkan GitHub Actions untuk menjalankan test secara otomatis setiap kali ada push atau pull request.

---
**Status Saat Ini:**
- [x] Standardisasi Controller
- [x] Parameter Validation (UUID)
- [x] Refactor Anonymous Logic ke Repository
- [x] Pembersihan Workspace (Folder `docs/`)

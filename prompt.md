Buat web app menggunakan **Next.js (App Router)** + **Tailwind CSS** + **Prisma** yang terhubung ke **Neon PostgreSQL**. Aplikasi memungkinkan grup teman mencatat expense (itemized atau per-person), mencatat pembayaran kembali, menampilkan net balance tiap anggota, dan menghasilkan recommended minimal transfers (settlement). **Autentikasi sederhana**: email + password (hash bcrypt), sesi disimpan melalui cookie HttpOnly (JWT atau session ID). Jangan pakai OAuth/Google.

---

# Acceptance Criteria (harus terpenuhi)

1. Pendaftaran (register) dengan email + password, dan login/logout sederhana.
2. User dapat membuat/bergabung group, menambah expense (itemized/per-person), dan mencatat payment.
3. Tersedia halaman group yang menunjukkan daftar member + net balances (positif = harus diterima; negatif = harus bayar).
4. Endpoint `GET /api/groups/:id/settlements` mengembalikan daftar transfer minimal.
5. Database Neon PostgreSQL terpakai via Prisma; ada script seed untuk pengujian.
6. Keamanan: password hashed (bcrypt), cookie HttpOnly + Secure, validasi input, authorization checks.
7. README berisi langkah setup (migrate, seed, run, env vars).

---

# Stack teknis & alasan

* Frontend & Backend: **Next.js (App Router)** — konsolidasi front+api.
* Styling: **Tailwind CSS** (mobile-first).
* ORM: **Prisma** (provider: postgresql).
* Database: **Neon PostgreSQL** (production).
* Auth: custom email/password + bcrypt; session cookie HttpOnly (JWT or server session).
* Deployment: **Vercel** (Next) + **Neon** (DB).

---

# Autentikasi — spesifikasi teknis

* Endpoint:

  * `POST /api/auth/register` — body `{ email, password, name? }`. Validasi email unik. Hash password pakai bcrypt (salt rounds 12). Simpan `passwordHash`.
  * `POST /api/auth/login` — body `{ email, password }`. Verifikasi bcrypt. Jika valid → buat session token (JWT signed) atau create session row -> set cookie `session` HttpOnly, Secure, SameSite=Strict, path=/, ttl 7d.
  * `POST /api/auth/logout` — hapus session (invalidate cookie / delete session row).
  * `GET /api/auth/me` — return current user dari cookie session.
* Pilihan implementasi sesi (pilih salah satu):

  * **JWT cookie**: buat JWT (id, email, exp) sign dengan `JWT_SECRET`; set cookie HttpOnly; server memverifikasi JWT setiap request. Simpel & stateless.
  * **Server session**: simpan session row di DB (`Session` table) dan gunakan cookie session id; lebih mudah untuk invalidation. Direkomendasikan jika ingin logout/invalidate globlal.
* Pastikan proteksi CSRF pada operasi berbahaya (POST/PUT/DELETE). Untuk API-only (cookie + sameSite=strict) cukup mitigasi; atau gunakan CSRF token.

---

# Skema Prisma (awal — kompatibel dengan Neon)

Berikut contoh `schema.prisma`. Pastikan `provider = "postgresql"` dan environment variable `DATABASE_URL` diarahkan ke Neon connection string.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String       @id @default(cuid())
  name         String?
  email        String       @unique
  passwordHash String
  image        String?
  createdAt    DateTime     @default(now())
  memberships  Membership[]
  expensesPaid Expense[]    @relation("payer")
  paymentsFrom Payment[]    @relation("from")
  paymentsTo   Payment[]    @relation("to")
}

model Group {
  id         String      @id @default(cuid())
  name       String
  currency   String      @default("IDR")
  createdAt  DateTime    @default(now())
  memberships Membership[]
  expenses   Expense[]
}

model Membership {
  id         String   @id @default(cuid())
  user       User     @relation(fields: [userId], references: [id])
  userId     String
  group      Group    @relation(fields: [groupId], references: [id])
  groupId    String
  role       String   @default("member")
  joinedAt   DateTime @default(now())
  // optional precomputed balance for performance
  netBalance Decimal  @db.Decimal(12,2) @default(0)
}

model Expense {
  id           String         @id @default(cuid())
  group        Group          @relation(fields: [groupId], references: [id])
  groupId      String
  title        String
  totalAmount  Decimal        @db.Decimal(12,2)
  currency     String         @default("IDR")
  payer        User           @relation("payer", fields: [payerId], references: [id])
  payerId      String
  date         DateTime       @default(now())
  notes        String?
  items        ExpenseItem[]
  shares       ExpenseShare[]
  createdAt    DateTime       @default(now())
}

model ExpenseItem {
  id         String   @id @default(cuid())
  expense    Expense  @relation(fields: [expenseId], references: [id])
  expenseId  String
  name       String
  price      Decimal  @db.Decimal(12,2)
  quantity   Int      @default(1)
  assignedTo String?  // optional userId
}

model ExpenseShare {
  id          String   @id @default(cuid())
  expense     Expense  @relation(fields: [expenseId], references: [id])
  expenseId   String
  user        User     @relation(fields: [userId], references: [id])
  userId      String
  shareAmount Decimal  @db.Decimal(12,2)
}

model Payment {
  id        String   @id @default(cuid())
  group     Group    @relation(fields: [groupId], references: [id])
  groupId   String
  from      User     @relation("from", fields: [fromId], references: [id])
  fromId    String
  to        User     @relation("to", fields: [toId], references: [id])
  toId      String
  amount    Decimal  @db.Decimal(12,2)
  date      DateTime @default(now())
  note      String?
}

model ActivityLog {
  id        String   @id @default(cuid())
  group     Group?   @relation(fields: [groupId], references: [id])
  groupId   String?
  actorId   String?
  actor     User?    @relation(fields: [actorId], references: [id])
  type      String
  payload   Json
  createdAt DateTime @default(now())
}
```

---

# API Routes (ringkas dengan contoh payload)

Autentikasi: cookie HttpOnly diperlukan untuk semua `group`-scoped routes.

* `POST /api/auth/register`
  Body: `{ "email": "...", "password": "...", "name": "..." }`
* `POST /api/auth/login`
  Body: `{ "email": "...", "password": "..." }` → set cookie session
* `POST /api/auth/logout`
  Invalidate session cookie.
* `GET /api/auth/me`
  Return current user.
* `GET /api/groups`
  List groups user member.
* `POST /api/groups`
  Create group `{ "name": "Trip ..." }`.
* `POST /api/groups/:id/invite`
  Generate invite code/link.
* `POST /api/groups/:id/expenses`
  Body example:

  ```json
  {
    "title":"Makan malam",
    "totalAmount":100000,
    "currency":"IDR",
    "payerId":"user_you",
    "date":"2026-01-01T19:00:00Z",
    "items":[
      {"name":"Nasi Goreng","price":50000,"quantity":1,"assignedTo":"user_you"},
      {"name":"Es Teh","price":50000,"quantity":1,"assignedTo":"user_friend"}
    ],
    "participants":[
      {"userId":"user_you","shareAmount":75000},
      {"userId":"user_friend","shareAmount":25000}
    ]
  }
  ```
* `GET /api/groups/:id/expenses`
* `POST /api/groups/:id/payments`
  Body: `{ "fromId":"...","toId":"...","amount":5000,"note":"settle" }`
* `GET /api/groups/:id/settlements`
  Return suggested transfers `[ { from, to, amount } ]`
* `POST /api/groups/:id/settlements/execute`
  Create Payment records for suggested transfers (transactional).

---

# Frontend pages & UX (minimal)

* `/` — Landing / auth (login / register)
* `/groups` — list grup + quick balances
* `/groups/[id]` — group dashboard: header (name, currency), members list (net balance), actions + tabs: Expenses | Activity | Settlements | Settings
* Modal: Add Expense (preview share before submit)
* Modal: Record Payment
* Settlement view: show suggested transfers + button `Record All`

UI requirements: show preview pembagian sebelum submit; indicate rounding differences.

---

# Business logic & konsistensi

* Perhitungan net: `net[user] = total_paid_by_user - total_share_of_user`.
* Settlement algorithm: greedy matching creditors vs debtors. Implement `settlement.ts` util dan unit test.
* Penyimpanan uang: gunakan Decimal (Prisma Decimal) dan round to 2 decimals (round half away from zero).
* Transactional integrity: semua create expense/payment/settlement-execute harus dalam satu DB transaction; gunakan `prisma.$transaction`.
* Untuk `netBalance` di `Membership` (opsional): update dalam transaksi agar reads cepat; sediakan periodic reconciliation.

---

# Seed script & testing

* Buat `prisma/seed.ts` yang:

  * Membuat 3-4 user dummy.
  * Membuat 1 group `Trip Contoh`.
  * Menambahkan beberapa expense (equal, custom, itemized) dan a few payments.
* Unit tests:

  * settlement util (equal/custom/rounding).
  * endpoint tests untuk `POST /api/groups/:id/expenses` dan `GET /api/groups/:id/settlements`.
* E2E: flow create group → add expense → get settlement → record payment → assert balances.

---

# Env vars (contoh `.env.example`)

```
DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>?schema=public"
NEXTAUTH_URL="http://localhost:3000"
JWT_SECRET="<secure-random>"
COOKIE_SECRET="<secure-random>"
NEXT_PUBLIC_APP_NAME="SplitBills"
NODE_ENV=development
```

(Gunakan Neon connection string sebagai `DATABASE_URL`.)

---

# Neon-specific notes (deploy)

* Neon connection string gunakan di `DATABASE_URL`. Neon mendukung connections via SSL — Prisma biasanya auto-detect.
* Neon ephemeral branch usage optional — gunakan main branch connection string for production.
* Karena serverless (Vercel) memiliki connection limits, pertimbangkan penggunaan Neon serverless-friendly config (Neon is serverless) — Neon documentation merekomendasikan using a single connection string and pooling if needed. (Developer implementer: cek dokumentasi Neon jika perlu set special params).
* Vercel + Neon common combo: set `DATABASE_URL` di Vercel environment settings.

---

# Security checklist

* Hash password pakai bcrypt (saltRounds >= 10).
* Cookie flags: HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age.
* Validate all payloads server-side (use Zod).
* Authorize: per-route check that the user is a member of the group.
* Rate-limit auth endpoints.

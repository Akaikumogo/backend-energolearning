# ElektroLearn — Analitika Data Contract

Barcha admin analitika KPIlari **Asia/Tashkent (UTC+5)** bo'yicha hisoblanadi.

## Asosiy o'lchov

| Konstanta | Qiymat | Ma'nosi |
|-----------|--------|---------|
| `DAILY_GOAL_CORRECT` | 10 | Kunlik reja: **har xil** savolga to'g'ri javoblar soni |
| `MIN_DAILY_PLAN_QUESTIONS` | 10 | Mobil reja minimum savollar |

**Kun chegarasi:** `YYYY-MM-DDT00:00:00.000+05:00` ≤ `answered_at` < keyingi kun 00:00 +05.

**Xodim:** `users.role = 'USER'` va tegishli `user_organizations` orqali filialga bog'langan.

---

## Endpointlar va formulalar

### `GET /admin/branch-analytics/executive-dashboard?date=`

| Maydon | Formula |
|--------|---------|
| `totalPlan` | `totalEmployees × 10` |
| `totalEmployees` | Barcha filiallardagi `USER` soni (scope bo'yicha) |
| `completedTotal` | Har bir `USER` uchun `min(10, distinct_correct_questions)` yig'indisi |
| `completionPercent` | `completedTotal / totalPlan × 100` (1 o'nlik) |
| `activeEmployees` | `correct > 0` bo'lgan xodimlar |
| `completedEmployees` | `distinct_correct ≥ 10` bo'lgan xodimlar |
| `remaining` | `max(0, totalPlan - completedTotal)` |

### `GET /admin/branch-analytics/branch-ranking?date=`

Filial bo'yicha: `plan = employees × 10`, `completed` = shu filial xodimlarining capped correct yig'indisi, `% = completed/plan×100`.

Status: green ≥90%, yellow ≥70%, red <70%.

### `GET /admin/branch-analytics/division-summary?orgId=&date=`

NES `nes_employees.division` bo'yicha guruhlash. Bo'limsiz → `"Bo'lim belgilanmagan"`.

### `GET /admin/branch-analytics/employee-ranking?orgId=&date=&division=`

Har xodim: `correct` = capped distinct to'g'ri, `percent = min(100, correct/10×100)`.

### `GET /admin/branch-analytics/hourly-progress?date=&orgId=`

Soat 06:00–20:00 (Toshkent). Har soat `H` da: **soat H gacha** (shu kunda) kamida 10 ta har xil to'g'ri javob bergan `USER` lar soni.

### `GET /admin/branch-analytics/daily-trend?to=&orgId=`

Oxirgi 28 kun (yoki `from`–`to`). Har kun uchun executive dashboard bilan bir xil `%`.

### `GET /admin/branch-analytics/weekday-heatmap?from=&to=&orgId=`

Dush–Juma. Har katak: shu hafta kunidagi kunlik reja % o'rtachasi (barcha xodimlar, faolsiz = 0%).

### `GET /admin/branch-analytics/summary?orgId=`

| Maydon | Formula |
|--------|---------|
| `activeTodayCount` | Bugun (Toshkent) urinish qilgan distinct `USER` |
| `planCompletedTodayCount` | Bugun (Toshkent) `distinct_correct ≥ 10` |

### `GET /admin/analytics/hearts-lost?range=&orgId=`

`heart_lost = true` urinishlar (har noto'g'ri javob). Range: Toshkent `today|month|year`.

### `GET /admin/analytics/summary?orgId=`

`activeUsers7d` = oxirgi 7 kunda yangi `refresh_tokens` olgan distinct userlar (legacy KPI).

---

## Frontend filterlar (URL)

| Param | Backendga |
|-------|-----------|
| `date` | `date` / `to` |
| `orgId` | `orgId` (qaysi endpoint qo'llab-quvvatlasa) |
| `division` | `employee-ranking.division` |
| `planType` | Faqat UI (`daily` → kunlik API, `monthly` → `branch-comparison`) |
| `userId` | Faqat client-side filter (`DepartmentEmployees`) |

**Default sana:** frontend `tashkentToday()` — backend bilan bir xil.

---

## Testlar

```bash
cd backend-energolearning
npm test -- tashkent-time.util.spec.ts
npm test -- branch-analytics.metrics.spec.ts
```

## Production tekshiruv (qo'lda)

1. Toshkent 00:30 da executive `planDate` = bugungi Toshkent sanasi.
2. Bir xodim 10 ta har xil savol to'g'ri → `completedEmployees` +1.
3. Moderator urinishlari executive KPIga kirmaydi.
4. `hourly-progress` bir savolni ikki soatda to'g'ri qilsa ham 1 marta hisoblanadi.

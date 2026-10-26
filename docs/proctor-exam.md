# Attestatsiya imtihoni

Mavjud o‘quv imtihonlari (`exams`, `exam_attempts`) o‘zgarmaydi. Yangi jadvallar `proctor_*`.

## Migratsiya

`0053-proctor-exam`. `npm run db:migrate`.

`proctor_policies` har bir safety bo‘limi uchun cutoff saqlaydi. Dastlabki sana `2026-12-01`. `MEDICAL_EXAM` default bo‘yicha test talab qilmaydi. Superadmin `PUT /api/admin/proctor/policies/:code` orqali o‘zgartiradi.

Shu sanadan keyingi yozuvni tasdiqlash uchun shu yozuvga bog‘langan yakunlangan xona kerak. Eski yozuvlar tegilmaydi.

## Muhit

- `PROCTOR_RECORDINGS_DIR` — serverdagi yozuv papkasi
- `PROCTOR_STUN_URL`
- `PROCTOR_TURN_URL`, `PROCTOR_TURN_USERNAME`, `PROCTOR_TURN_CREDENTIAL` — NAT ortida jonli video uchun

Yozuvlar bazada emas, shu papkada:

`recordings/{yil}/{filial}/{oy}/{bolim}/{ism}_{login}_{roomId}/`

## Vaqt

Server qolgan vaqtni saqlaydi. Tok o‘chsa yoki dastur yiqilsa vaqt muzlaydi. Xodim shu xonaga qaytsa o‘sha savol va o‘sha qolgan vaqtdan davom etadi. `Qayta boshlash` faqat `SUPERADMIN` va yangi urinish ochadi. Yakunlangan xona qayta yozilmaydi.

## Desktop

`ELEKTRO LEARN/exam-desktop`. `ELEKTRO_API_BASE` API manzili. Token operatsion tizim `safeStorage` da. Javob kalitlari mijozda saqlanmaydi.

Klik, imtihon oynasidagi tugma va Alt-Tab serverdagi `proctor_events` ga yoziladi. AnyDesk, Zoom, Telegram va brauzerdagi Meet har 15 soniyada tekshiriladi va faqat superadmin `Xona qoidabuzarliklari` sahifasida ko‘rinadi.

Kompyuter o‘chiq bo‘lsa jonli video yo‘q. Moderator oxirgi ulanish vaqtini ko‘radi.

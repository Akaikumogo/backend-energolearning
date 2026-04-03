# Keyingi bosqich: role template va online status

## 1. Role-by-permission (shablon)

- `role_permission_templates` jadvali: `role_key` + `permissions` (jsonb, `ModeratorPermissions` strukturasi).
- Moderator yaratilganda tanlangan shablon `mergeModeratorPermissions` bilan nusxalanadi.
- Superadmin alohida UI orqali shablonlarni tahrir qiladi; har bir moderatorning joriy `moderator_permissions` qatori mustaqil override bo‘lib qoladi.

## 2. Moderator online / offline (WebSocket)

- NestJS `@WebSocketGateway` + JWT handshake (query yoki `Authorization`).
- Ulanish: `Role.MODERATOR` bo‘lsa `presence` xonasiga qo‘shish.
- `disconnect` yoki heartbeat timeout: ro‘yxatdan olib tashlash.
- Ko‘p server: Redis `SET` / `SADD` bilan umumiy holat.
- Admin-panel: `socket.io-client` yoki native WebSocket; `Moderators` / `Permissions` jadvalida status indikator.

Bu hujjat reja uchun; implementatsiya keyingi iteratsiyada.

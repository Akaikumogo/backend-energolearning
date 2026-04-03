# ModeratorPermissionsGuard — HTTP → modul mapping

Guard faqat `Role.MODERATOR` uchun ishlaydi. `GET` / `HEAD` / `OPTIONS` uchun mapping yo‘q (read cheklovsiz).

## Modullar (`permissions` JSON kalitlari)

| Modul | Mazmuni |
|--------|---------|
| `contentLevels` | `/admin/levels` (POST, PUT, DELETE) |
| `contentTheories` | `/admin/theories` (POST, PUT, DELETE) |
| `contentQuestions` | `/admin/questions`, `/admin/question-options/:id` (DELETE) |
| `organizations` | `/admin/organizations` CRUD; `.../:orgId/users` POST; `.../:orgId/users/:userId` DELETE |
| `exams` | `positions`, `exams`, `exam-questions`, `exam-assignments/:id/schedule`, `basket/.../restore|purge` |
| `students` | Kelajakdagi write endpointlar |
| `users` | `DELETE /admin/users/:id`; `POST /users/:userId/avatar` |
| `moderators` | `POST /admin/users/moderators` |
| `profile` | `PATCH\|PUT /auth/me`, `POST /auth/change-password` |

Kod: [`src/common/guards/moderator-permissions.guard.ts`](../src/common/guards/moderator-permissions.guard.ts).

## SuperAdmin-only route’lar

Ba’zi endpointlar `@Roles(Role.SUPERADMIN)` — moderator ularga umuman yetib olmaydi; guard mapping ular uchun ixtiyoriy (kelajakda rol kengayganda foydali).

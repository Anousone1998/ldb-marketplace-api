# Internal Corporate Marketplace API

Backend for an employee-to-employee marketplace (second-hand goods, food pre-orders, household goods, free items), built with NestJS 11, TypeORM, Supabase Postgres and Storage, and Socket.io.

## Quick start

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, SUPABASE_*, JWT_SECRET
npm run seed                # applies migrations, seeds 4 employees and 5 items, prints their logins
npm run start:dev           # http://localhost:3000/api/v1
```

| Script | Purpose |
| --- | --- |
| `npm run build` / `npm run start:prod` | Compile to `dist/` and run it |
| `npm run start:dev` | Watch mode |
| `npm run seed` | Run migrations, then upsert the seed data. Safe to re-run. |
| `npm run seed:clean` | Run migrations, **TRUNCATE all marketplace tables**, then re-seed |
| `npm run migration:run` / `migration:revert` / `migration:show` | TypeORM migrations |

The schema is managed by migrations in `src/database/migrations`. The app also applies pending migrations on boot when `DB_MIGRATIONS_RUN=true`. Keep `DB_SYNCHRONIZE=false`.

**Supabase connection:** use either the Direct URL (port 5432) or the Pooler URL (port 6543). TLS is enabled with `ssl: { rejectUnauthorized: false }`. The migration enables RLS on every table, which blocks access through Supabase's public REST API. The backend connects as the table owner, so RLS doesn't affect it.

## Docker

```bash
cp .env.example .env                                  # Supabase DB + Storage credentials
docker compose up -d --build                          # builds the image and starts it on :3000 (HOST_PORT to change)
docker compose run --rm api node dist/database/seed.js          # optional: seed sample data
docker compose run --rm api node dist/database/seed.js --clean  # optional: wipe and re-seed
docker compose logs -f api
docker compose down
```

- **Image:** a multi-stage build on `node:22-alpine`, about 260 MB. It contains only production dependencies and compiled JavaScript.
- **Hardening:** the app runs as the non-root `node` user, with a read-only root filesystem and `no-new-privileges`.
- **Health check:** Docker checks `GET /api/v1/health` (with a database ping) every 30 seconds.
- **Migrations** run automatically when the container starts (`DB_MIGRATIONS_RUN=true`).
- **Shutdown:** `tini` passes the stop signal to Node, so `docker stop` closes database connections cleanly.
- **Logs:** Compose sets `NODE_ENV=production` regardless of `.env`, which hides debug-level logs.
- **Without Compose:** `docker build -t corporate-marketplace-api . && docker run --env-file .env -p 3000:3000 corporate-marketplace-api`

### Public URL: Cloudflare Quick Tunnel (no domain needed)

The `tunnel` service runs `cloudflared` and publishes the API at a random `https://<name>.trycloudflare.com` address. It needs no Cloudflare account and no domain.

```bash
docker compose up -d --build     # starts api, then tunnel once api is healthy
npm run tunnel:url               # → https://noted-clearly-stem-conservative.trycloudflare.com
```

- **What it serves:** REST at `<url>/api/v1/...` and Socket.io at `<url>/chat`, where WebSockets work through the tunnel. HTTPS is handled by Cloudflare.
- **The URL changes** every time the tunnel container is recreated (`docker compose up --force-recreate tunnel`, `down`/`up`). Check it again with `npm run tunnel:url`.
- **Real client IP:** Compose sets `TRUST_PROXY=true` on the API, so the per-IP login rate limit uses the client IP Cloudflare forwards, not the tunnel's.
- **Health:** the tunnel has its own health check (`cloudflared tunnel ready`).
- **Limits:** Cloudflare offers Quick Tunnels for testing and demos, with no uptime guarantee and a cap on concurrent requests. For a permanent URL, use a named tunnel with a token (`cloudflared tunnel run --token ...`), which requires a free Cloudflare account and a domain.
- **Direct access:** the API's port (`HOST_PORT`, default 3000) is still published on the host. With `TRUST_PROXY=true`, a client connecting to that port directly could fake `X-Forwarded-For` to get around the rate limit. If only the tunnel should be public, bind it to localhost: `"127.0.0.1:${HOST_PORT:-3000}:3000"`.

## Response format

Every HTTP response uses the same envelope.

**Success** (`meta` appears only on list endpoints):

```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Items retrieved",
  "data": [ { "itemId": "5", "title": "Free Books: ..." } ],
  "meta": { "page": 1, "size": 20, "total": 5, "totalPages": 1 },
  "timestamp": "2026-09-24T14:32:03.103Z",
  "path": "/api/v1/items?size=20"
}
```

**Error** (`errors` appears only on validation failures):

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [ { "field": "itemId", "messages": ["itemId must be an integer number"] } ],
  "data": null,
  "timestamp": "2026-09-24T14:32:03.168Z",
  "path": "/api/v1/orders"
}
```

- `ResponseEnvelopeInterceptor` builds success responses and `AllExceptionsFilter` builds error responses. Database errors are mapped to 400 or 409 without exposing SQL.
- To set a custom success message on an endpoint, use `@ResponseMessage('...')`. Otherwise the message defaults to `Success` or `Created`.
- Chat history uses cursor pagination, so its `meta` is `{ itemId, peerId, hasMore, nextBeforeId }` instead of page counts.
- Socket.io acknowledgements use the same shape without `timestamp` and `path`: `{ status, statusCode, message, data }` or `{ status: 'error', statusCode, message, errors?, data: null }`.

## Authentication

Employees log in with their employee ID and the phone number stored for them in the `users` table. Every other route requires `Authorization: Bearer <accessToken>`.

| Method & path | Body | Notes |
| --- | --- | --- |
| `POST /auth/login` | `{ "userId": "EMP00101", "phoneNumber": "+856 20 5555 0101" }` | Returns `{ accessToken, tokenType, expiresIn, user }`. Wrong ID or phone returns 401. |
| `GET /auth/me` | | The authenticated employee |

- **Phone matching** ignores spaces, dashes, brackets and `+`, so `8562055550101` matches `+856 20 5555 0101`. The digits must otherwise match exactly, including the country code. Employees with no phone number on file can't log in.
- **Employee IDs** are case-insensitive at login (`emp00101` → `EMP00101`).
- **Rate limit:** 10 login attempts per minute per client IP. If the app runs behind a reverse proxy, enable Express `trust proxy` so the real client IP is used.
- **Changing the phone number:** employees can change it with `PATCH /users/me` but can't clear it, because it is their login credential.
- **Access tokens** are HS256 JWTs signed with `JWT_SECRET` and valid for `JWT_EXPIRES_IN` seconds. The Socket.io handshake accepts the same token.
- **Seeded accounts:** `npm run seed` prints each seeded employee's ID and phone number.

## REST API (`/api/v1`)

| Method & path | Description |
| --- | --- |
| `POST /storage/image?folder=items` | Upload one image (multipart field `file`) |
| `POST /storage/images?folder=items` | Upload up to 10 images (field `files`). Returns `{ urls, files }` |
| `GET /items?q=&itemType=&status=&sellerId=&page=1&size=20` | Search and filter. By default SOLD items are hidden. |
| `POST /items` | `{ title, description?, price?, quantity?, itemType, pickupLocation, images? }`. `quantity` is units in stock (default 1). |
| `GET /items/:id` | Item detail, including the seller's contact and payment QR |
| `PATCH /items/:id/status` | `{ status: AVAILABLE \| RESERVED \| SOLD }`. Seller only. Blocked while an order is pending. |
| `POST /orders` | `{ itemId, quantity? }`. `quantity` cannot exceed the item's stock. Locks the item (`SELECT … FOR UPDATE`) and sets it to RESERVED. |
| `GET /orders?role=buyer\|seller&status=` | My orders |
| `GET /orders/:id` | Order detail. Only the buyer and seller can see it. |
| `PATCH /orders/:id/status` | `{ status: COMPLETED }` (seller) reduces the item's stock by the order quantity; the item becomes SOLD at 0, otherwise AVAILABLE. `{ status: CANCELLED }` (buyer or seller) sets it back to AVAILABLE. |
| `PATCH /orders/:id/payment-slip` | `{ paymentSlipUrl }`. Buyer only. |
| `GET /notifications?unreadOnly=&page=1&size=20` | My notifications, newest first |
| `GET /notifications/unread-count` | `{ count }` for badges |
| `PATCH /notifications/:id/read` | Mark one as read |
| `PATCH /notifications/read-all` | Mark all as read. Returns `{ count }` |
| `GET /chats/history?itemId=&withUserId=&limit=50&beforeId=` | Conversation messages, oldest first, paginated with a cursor |
| `GET /chats/conversations` | Inbox: last message and unread count per conversation |
| `PATCH /chats/read` | `{ itemId, withUserId? }`. Marks the peer's messages as read. |
| `GET /users/me`, `PATCH /users/me`, `GET /users/:id` | Profile (`phoneNumber`, `qrPaymentUrl`) |
| `PATCH /users/me/fcm-token` | `{ fcmToken }`. Saves this device's Firebase push token; send after login and on token refresh. The token moves off any other employee who used it before. |
| `DELETE /users/me/fcm-token` | Removes the token. Call on logout. |
| `GET /health` | Liveness check plus a database ping |

Rules:

- **Uploads:** JPG, PNG and WEBP only, up to 5 MB each. The file's content is checked, not just its extension. Image URLs sent to the API must come from this app's bucket.
- **Prices:** FREE items cost 0. Other item types need a price above 0.
- **Chat participants:** buyers can omit `withUserId`, since it defaults to the seller. Sellers must pass the buyer's ID. `peerId` is accepted as an alias for `withUserId` in chat queries, bodies and Socket.io events; sending both with different values is rejected.

## Push notifications (FCM)

Firebase is used **only** for Cloud Messaging, which is free. The app doesn't use Firestore, Firebase Storage or any other paid Firebase service.

- Set `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json` or put the JSON inline in `FIREBASE_SERVICE_ACCOUNT_JSON` (easier for Docker, because the key file is excluded from the image). If neither is set, push is turned off and notifications still go out over Socket.io.
- The app sends a device's token with `PATCH /users/me/fcm-token`. Every notification (see `/notifications`) is also pushed to that token, with `data: { notificationId, type, itemId, orderId }`.
- Tokens that FCM rejects as expired or unregistered are removed automatically.

## Socket.io: namespace `/chat`

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000/chat', { auth: { token: accessToken } });

socket.on('newMessage', (msg) => console.log(msg));
socket.on('messagesRead', (e) => console.log(e));

await socket.emitWithAck('joinChat', { itemId: 1 });                 // buyer
await socket.emitWithAck('joinChat', { itemId: 1, withUserId: 'EMP00102' }); // seller
const res = await socket.emitWithAck('sendMessage', {
  itemId: 1, receiverId: 'EMP00101', messageText: 'Is this still available?',
});
// res = { status: 'success', statusCode: 200, message: 'Message sent', data: Message }
//    or { status: 'error', statusCode, message, errors?, data: null }
```

- Each socket joins its own `user:<id>` room when it connects. `newMessage` goes to the conversation room and to both participants' user rooms, so the receiver gets it even without opening the chat.
- Order notifications are pushed to the recipient's `user:<id>` room as `notification` (a Notification row). Marking them read emits `notificationsRead` `{ notificationId | null, unreadCount }` so other tabs and devices update their badges.
- `senderId` is always taken from the token. If a payload includes a different `senderId`, it is rejected.
- To run more than one app instance, add `@socket.io/redis-adapter` in `src/common/adapters/socket-io.adapter.ts`.

## Project layout

```
src/
  auth/        login (userId + phone), JWT guard (global), @CurrentUser(), @Public()
  users/       profile
  storage/     Supabase Storage uploads and validation
  items/       listings
  orders/      transactional ordering with row locks
  chats/       gateway, REST history and inbox
  database/    entities, migration, data source, seeder
  common/      enums, pagination, DB error filter, Socket.io adapter
```

# Integración WhatsApp (vía n8n)

Documento de referencia para conectar el ticketing con WhatsApp Cloud API a
través de n8n: arquitectura, API de entrada (n8n → ticketing), eventos
salientes (ticketing → n8n), firma HMAC, variables de entorno, seed de
desarrollo y checklist de deploy.

## Arquitectura

```
 Cliente ──WhatsApp──▶ Meta Cloud API ──webhook──▶ n8n ──X-Integration-Key──▶ /api/v1/integrations/whatsapp/*
                                                     ▲                                  │
                                                     │                                  ▼ misma transacción
 Cliente ◀──WhatsApp── Meta Cloud API ◀──n8n ◀──POST firmado (HMAC)── dispatcher ◀── EventOutbox
```

- **Una sola app Next.js** (`apps/web`): Route Handlers para la API de
  integración, Server Actions para la UI, Prisma 7 sobre SQLite.
- **Entrada**: n8n recibe el mensaje de Meta, normaliza el teléfono, consulta
  `/contacts/lookup`, decide con el estado guardado en `/conversations/{phone}`
  y llama a los endpoints de tickets. Todos exigen API key + scope.
- **Salida**: cada cambio relevante inserta un evento en `EventOutbox` dentro
  de la misma transacción; un scheduler en el propio proceso de Next
  (`instrumentation.ts`) y la entrega inmediata con `after()` lo envían a los
  `WebhookEndpoint` activos con firma HMAC y reintentos.
- **Flag maestro** `WHATSAPP_INTEGRATION_ENABLED`: en `false` la API responde
  404, no se emiten eventos y el scheduler no arranca. La UI de administración
  sigue disponible para preparar keys y endpoints.
- **UI**: Admin → Usuarios (número, opt-in y verificación manual), detalle de
  ticket (canal de cada comentario y adjunto, ventana de 24 h) y Admin →
  Integraciones (API keys, webhooks, log del outbox).

Código: `apps/web/lib/integrations/*` (phone, auth, signing, rate-limit,
contacts, whatsapp-tickets, conversations, outbox, outbox-dispatcher,
outbox-scheduler), rutas en `apps/web/app/api/v1/integrations/whatsapp/*`,
acciones de UI en `apps/web/lib/actions/integrations.ts`.

Toda la funcionalidad queda detrás de `WHATSAPP_INTEGRATION_ENABLED=true`.
Con el flag en `false` los endpoints responden `404` como si no existieran.

## Modelo

| Concepto del plan | En el ticketing |
|---|---|
| Contacto | `User` con `whatsappPhone` (E.164), `whatsappOptIn`, `whatsappVerifiedAt`, `whatsappVerifiedById` |
| Comentario | `Comment` con `channel` (`WEB`, `EMAIL`, `WHATSAPP`, `SYSTEM`), `externalMessageId` único e `isInternal` |
| Adjunto | `Attachment` con `source` y `externalMediaId` |
| Ticket | `Ticket` con `sourceChannel`, `lastCustomerActivityAt` y `externalMessageId` único |
| Conversación | `WhatsappConversation` (una por teléfono) |
| API key | `IntegrationApiKey` (solo hash SHA-256) |
| Outbox / webhooks | `EventOutbox`, `WebhookEndpoint` (Fase 4) |

Un número de WhatsApp solo puede operar si pertenece a un usuario **activo** y
un administrador lo marcó como **verificado**. El contacto ve y modifica
exactamente los tickets que vería en la web con su rol:

- `CLIENT_USER`: los suyos y aquellos donde es colaborador.
- `CLIENT_ADMIN` / `CLIENT_SUPERVISOR`: todos los de su empresa.
- `AGENT`: los de las empresas que atiende.

## Autenticación

Header `X-Integration-Key: mbk_...`. Las keys se crean desde la UI de
administración (Fase 5); mientras tanto se insertan a mano (ver abajo).

Scopes: `contacts:read`, `tickets:read`, `tickets:write`, `conversations:write`.

Límites: 60 peticiones por minuto por key (`INTEGRATION_RATE_LIMIT_PER_MIN`) y
20 mensajes por minuto por teléfono en los endpoints de escritura
(`WHATSAPP_PHONE_RATE_LIMIT_PER_MIN`). Respuesta `429` con `Retry-After`.

## Formato de errores

```json
{ "error": { "code": "CONTACT_NOT_VERIFIED", "message": "…", "details": { "field": "phone" } } }
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Campo faltante o inválido (`details.field`), teléfono inválido, JSON mal formado |
| 401 | `UNAUTHORIZED` | Sin key, key desconocida o revocada |
| 403 | `FORBIDDEN_SCOPE` | La key no tiene el scope del endpoint |
| 403 | `CONTACT_NOT_VERIFIED` | El contacto existe pero no está verificado |
| 404 | `NOT_FOUND` | Recurso inexistente **o fuera del alcance del teléfono** (nunca 403, para no revelar que existe); también cuando el flag está apagado |
| 409 | `INVALID_TRANSITION` | Cambio de estado no permitido (p. ej. reabrir tras `TICKET_REOPEN_MAX_DAYS`) |
| 409 | `CONFLICT` | `external_message_id` ya usado en otro ticket |
| 413 | `PAYLOAD_TOO_LARGE` | Adjunto mayor a `ATTACHMENT_MAX_MB` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Tipo de archivo no permitido |
| 429 | `RATE_LIMITED` | Límite por key o por teléfono |
| 500 | `INTERNAL_ERROR` | Error no controlado (queda en el log del servidor) |

## Teléfonos

Todos los teléfonos se normalizan a E.164 con `lib/integrations/phone.ts`.
Se aceptan `5512345678`, `+52 55 1234 5678`, `5215512345678` (como lo manda
Meta, con el "1" de móvil antiguo) y `+5215512345678`; todos resultan en
`+525512345678`. En la URL de conversaciones el `+` debe ir codificado (`%2B`).

## Endpoints

Prefijo: `/api/v1/integrations/whatsapp`. Variables de los ejemplos:

```bash
export BASE="https://tickets.mirmiapps.com/api/v1/integrations/whatsapp"
export KEY="mbk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export PHONE="5215512345678"
```

### GET /contacts/lookup?phone= · `contacts:read`

Único endpoint que responde para contactos no verificados: n8n lo usa para
decidir si saluda, pide verificación o deriva al administrador.

```bash
curl -s "$BASE/contacts/lookup?phone=$PHONE" -H "X-Integration-Key: $KEY"
```

```json
{
  "contact": {
    "id": "cm…", "name": "Carla Cliente", "email": "cliente@acme.com", "role": "CLIENT_USER",
    "is_active": true, "whatsapp_phone": "+525512345678", "opt_in": true,
    "verified": true, "verified_at": "2026-10-01T12:00:00.000Z",
    "client": { "id": "cm…", "name": "Acme", "slug": "acme" }
  },
  "client": { "id": "cm…", "name": "Acme", "slug": "acme" },
  "verified": true,
  "opt_in": true
}
```

### GET /contacts/{id}/tickets?status=open|closed|all · `tickets:read`

Máximo 10, ordenados por última actualización. `open` incluye `OPEN`,
`IN_PROGRESS`, `PENDING` y `RESOLVED`. `whatsapp_rows` ya respeta los límites
de la lista interactiva de Meta (título ≤ 24, descripción ≤ 72).

```bash
curl -s "$BASE/contacts/cm…/tickets?status=open" -H "X-Integration-Key: $KEY"
```

```json
{
  "contact_id": "cm…", "filter": "open", "count": 2,
  "tickets": [
    { "id": "cm…", "folio": "ACM-0012", "title": "La impresora no imprime", "status": "IN_PROGRESS",
      "status_label": "En progreso", "priority": "MEDIUM", "priority_label": "Media",
      "category": "Soporte técnico", "assignee": { "id": "cm…", "name": "Tomás" },
      "requester": { "id": "cm…", "name": "Carla Cliente" }, "source_channel": "WHATSAPP",
      "created_at": "…", "updated_at": "…", "last_customer_activity_at": "…",
      "url": "https://tickets.mirmiapps.com/tickets/cm…" }
  ],
  "whatsapp_rows": [
    { "id": "cm…", "title": "ACM-0012", "description": "En progreso · La impresora no imprime" }
  ]
}
```

### GET /tickets/by-folio/{folio}?phone= · `tickets:read`

`phone` es obligatorio: el ticket debe ser visible para ese contacto.

```bash
curl -s "$BASE/tickets/by-folio/ACM-0012?phone=$PHONE" -H "X-Integration-Key: $KEY"
```

```json
{
  "ticket": { "…igual que arriba…" },
  "public_comment_count": 3,
  "last_public_comment": { "id": "cm…", "body": "Ya quedó instalado", "channel": "WEB",
    "author": { "id": "cm…", "name": "Tomás" }, "created_at": "…" }
}
```

### POST /tickets · `tickets:write`

Crea un ticket a nombre del contacto, en su empresa, con `sourceChannel=WHATSAPP`.
`external_message_id` (el `wamid` del mensaje) hace la llamada idempotente:
`201` al crear, `200` con el mismo ticket si se repite. Sin `category_id` se
usa `WHATSAPP_DEFAULT_CATEGORY`.

```bash
curl -s -X POST "$BASE/tickets" -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{
  "phone": "'"$PHONE"'",
  "title": "No tengo internet",
  "description": "Desde las 9 am no carga nada en piso 2",
  "external_message_id": "wamid.HBgNNTIxNTUxMjM0NTY3OBUCABIYFjNFQjBDMUM3RjY5RTdEODk2QUU5NjcA",
  "priority": "HIGH"
}'
```

```json
{ "created": true, "ticket": { "id": "cm…", "folio": "ACM-0013", "status": "OPEN", "…": "…" } }
```

### POST /tickets/{id}/comments · `tickets:write`

Comentario público del cliente. Idempotente por `external_message_id`. Si el
ticket estaba `PENDING` (esperando al cliente) pasa a `IN_PROGRESS` y
`status_changed` viene en `true`.

```bash
curl -s -X POST "$BASE/tickets/cm…/comments" -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{
  "phone": "'"$PHONE"'",
  "body": "Ya probé reiniciar y sigue igual",
  "external_message_id": "wamid.HBgN…"
}'
```

```json
{
  "created": true,
  "comment": { "id": "cm…", "ticket_id": "cm…", "body": "Ya probé reiniciar y sigue igual",
    "channel": "WHATSAPP", "is_internal": false, "external_message_id": "wamid.HBgN…",
    "author": { "id": "cm…", "name": "Carla Cliente" }, "created_at": "…" },
  "ticket_status": "IN_PROGRESS",
  "status_changed": true
}
```

### POST /tickets/{id}/attachments · `tickets:write`

Dos variantes. Multipart (recomendada: n8n descarga el medio de Meta con su
token y lo reenvía):

```bash
curl -s -X POST "$BASE/tickets/cm…/attachments" -H "X-Integration-Key: $KEY" \
  -F "phone=$PHONE" -F "external_media_id=1234567890" -F "file=@captura.png;type=image/png"
```

JSON con URL pública https (el servidor la descarga; se rechazan hosts privados):

```bash
curl -s -X POST "$BASE/tickets/cm…/attachments" -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{
  "phone": "'"$PHONE"'",
  "media_url": "https://cdn.ejemplo.com/archivo.pdf",
  "mime_type": "application/pdf",
  "filename": "cotizacion.pdf",
  "external_media_id": "1234567890"
}'
```

```json
{ "created": true, "attachment": { "id": "cm…", "ticket_id": "cm…", "filename": "captura.png",
  "mime_type": "image/png", "size_bytes": 48213, "source": "WHATSAPP", "external_media_id": "1234567890",
  "created_at": "…", "url": "https://tickets.mirmiapps.com/api/attachments/cm…" } }
```

Tipos permitidos: los del formulario web más `audio/ogg`, `audio/mpeg`,
`audio/mp4`, `audio/aac`, `audio/amr`, `video/mp4`, `video/3gpp`. Límite
`ATTACHMENT_MAX_MB` (default 16).

### POST /tickets/{id}/status · `tickets:write`

Solo acciones del cliente:

- `close`: desde `OPEN`, `IN_PROGRESS`, `PENDING` o `RESOLVED` → `CLOSED`.
- `reopen`: desde `RESOLVED` o `CLOSED`, si el cierre ocurrió hace menos de
  `TICKET_REOPEN_MAX_DAYS` → `IN_PROGRESS` si tiene asignado, `OPEN` si no.

```bash
curl -s -X POST "$BASE/tickets/cm…/status" -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "phone": "'"$PHONE"'", "action": "close" }'
```

```json
{ "action": "close", "previous_status": "RESOLVED", "ticket": { "status": "CLOSED", "…": "…" } }
```

### GET / PUT /conversations/{phone} · `conversations:write`

Estado de la conversación que n8n necesita entre mensajes. `GET` nunca da 404:
si no hay registro devuelve `exists=false` y `state=IDLE`. `PUT` es parcial
(solo cambia lo enviado); `active_ticket_id: null` quita el ticket activo.
`within_24h_window` se calcula desde `last_inbound_at`.

```bash
curl -s "$BASE/conversations/%2B525512345678" -H "X-Integration-Key: $KEY"

curl -s -X PUT "$BASE/conversations/%2B525512345678" -H "X-Integration-Key: $KEY" -H "Content-Type: application/json" -d '{
  "state": "CHOOSING_TICKET",
  "active_ticket_id": "cm…",
  "context": { "offeredTicketIds": ["cm…", "cm…"], "pendingAction": "comment" },
  "last_inbound_at": "2026-11-07T18:00:00Z"
}'
```

```json
{
  "phone": "+525512345678", "exists": true, "state": "CHOOSING_TICKET",
  "context": { "offeredTicketIds": ["cm…", "cm…"], "pendingAction": "comment" },
  "active_ticket_id": "cm…", "active_ticket": { "folio": "ACM-0012", "…": "…" },
  "contact_id": "cm…", "last_inbound_at": "2026-11-07T18:00:00.000Z",
  "within_24h_window": true, "expires_at": null, "updated_at": "…"
}
```

Estados: `IDLE`, `CHOOSING_TICKET`, `CREATING_TICKET`, `AWAITING_CONFIRMATION`.

## Efectos secundarios

Cada ticket, comentario, adjunto o cambio de estado por WhatsApp:

- Actualiza `Ticket.lastCustomerActivityAt`.
- Registra `AuditLog` (con `channel: "WHATSAPP"` y el `apiKeyId` en `metadataJson`) y `TicketActivity` con el contacto como actor.
- Dispara los mismos correos que la acción equivalente en la web (nunca al autor del cambio).
- Inserta el evento correspondiente en `EventOutbox` (ver abajo).

## Eventos salientes (ticketing → n8n)

Patrón outbox: el evento se inserta **en la misma transacción** que el cambio
de negocio (tanto en las acciones de la web como en la API de WhatsApp) y un
dispatcher lo entrega después a cada `WebhookEndpoint` activo suscrito.

| Evento | Cuándo |
|---|---|
| `ticket.created` | Al crear un ticket, por cualquier canal |
| `ticket.status_changed` | Cualquier cambio de estado, incluidos los que hace el propio cliente (close/reopen y la reactivación `PENDING → IN_PROGRESS` al responder) |
| `ticket.comment_added` | Solo comentarios públicos cuyo autor **no** es el solicitante |
| `ticket.assigned` | Al asignar, reasignar o desasignar un técnico |

El destinatario es siempre el solicitante del ticket. Si no tiene
`whatsappPhone` o `whatsappOptIn`, o está inactivo, **no se inserta** el evento
(la auditoría ya queda en `AuditLog` y `TicketActivity`). Con el flag apagado
tampoco se emite nada. `actor.is_customer` permite a n8n no hacer eco al
cliente de sus propias acciones.

### Payload

```json
{
  "event_id": "7f1d…",
  "event_type": "ticket.comment_added",
  "occurred_at": "2026-11-07T18:00:00.000Z",
  "ticket": { "id": "cm…", "folio": "ACM-0012", "title": "…", "status": "IN_PROGRESS", "previous_status": null,
              "url": "https://tickets.mirmiapps.com/tickets/cm…" },
  "contact": { "id": "cm…", "name": "Carla Cliente", "whatsapp_phone": "+525512345678", "opt_in": true },
  "comment": { "id": "cm…", "body": "Ya lo revisé", "author_name": "Tomás Técnico", "channel": "WEB" },
  "assignee": { "id": "cm…", "name": "Tomás Técnico" },
  "actor": { "id": "cm…", "name": "Tomás Técnico", "channel": "WEB", "is_customer": false },
  "whatsapp": { "last_inbound_at": "2026-11-07T17:30:00.000Z", "within_24h_window": true }
}
```

`previous_status` viene en `status_changed` y `assigned`; `comment` solo en
`comment_added`; `assignee` solo en `assigned` (`null` al desasignar).
`within_24h_window` se calcula desde el último mensaje entrante registrado en
`WhatsappConversation.lastInboundAt`: si es `false`, n8n debe usar una plantilla
aprobada en vez de texto libre.

### Headers y firma

```
Content-Type: application/json
X-Mirmibug-Signature: sha256=<hex>
X-Mirmibug-Timestamp: <unix seconds>
X-Mirmibug-Event-Id: <event_id>
```

`hex = HMAC-SHA256(secret, timestamp + "." + body)`. Validación en un nodo
Code de n8n (modo "Run once for all items"):

```js
const crypto = require("crypto");
const secret = $env.MIRMIBUG_WEBHOOK_SECRET;
const headers = $input.first().json.headers;
const body = $input.first().json.rawBody ?? JSON.stringify($input.first().json.body);
const ts = headers["x-mirmibug-timestamp"];
const sig = headers["x-mirmibug-signature"] ?? "";

if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new Error("timestamp fuera de tolerancia");
const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
  throw new Error("firma inválida");
}
return $input.all();
```

El nodo Webhook de n8n debe tener activada la opción **Raw Body** para que la
firma se calcule sobre los bytes exactos. Responde `2xx` rápido y procesa
después: el ticketing espera `WEBHOOK_TIMEOUT_SECONDS` (10 s) como máximo.

### Entrega y reintentos

- Scheduler dentro del proceso de Next (`instrumentation.ts` →
  `lib/integrations/outbox-scheduler.ts`), cada `OUTBOX_POLL_INTERVAL_SECONDS`
  (30 s). Además, cada cambio intenta entregar su evento justo después de
  responder (`after()` de Next; se desactiva con `OUTBOX_IMMEDIATE_DISPATCH=false`).
- Estados: `PENDING` → `PROCESSING` (reclamado) → `DELIVERED`, o `FAILED` con
  `nextAttemptAt` programado. Backoff: 1 min, 5 min, 15 min, 1 h, 6 h. Tras el
  5.º intento fallido → `DEAD`.
- `DELIVERED` exige `2xx` de todos los endpoints suscritos; cualquier otro
  resultado guarda `lastError`. Sin endpoints activos suscritos → `DEAD` con
  explicación.
- Un `PROCESSING` con más de 5 min (proceso caído a media entrega) se vuelve a
  reclamar.
- Al arrancar, si existen `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_SECRET`, se crea el
  endpoint de n8n suscrito a todos los eventos (una sola vez; después se
  administra desde la UI).

Reprocesar eventos `DEAD`:

```bash
cd apps/web
npm run outbox:retry-dead -- --dry-run
npm run outbox:retry-dead
npm run outbox:retry-dead -- --ids=<id1>,<id2> --dispatch
```

## Crear una API key a mano (hasta que exista la UI)

```bash
cd apps/web
npx tsx -e 'import("./lib/integrations/auth").then(async ({ generateApiKey }) => { const k = generateApiKey(); const { PrismaClient } = await import("@prisma/client"); const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3"); const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) }); await prisma.integrationApiKey.create({ data: { name: "n8n", keyPrefix: k.keyPrefix, keyHash: k.keyHash, scopesJson: JSON.stringify(["contacts:read","tickets:read","tickets:write","conversations:write"]) } }); console.log("Guarda esta key, no se vuelve a mostrar:", k.key); await prisma.$disconnect(); })'
```

## Variables de entorno

Todas opcionales salvo el flag. Ver `apps/web/.env.example`.

| Variable | Default | Uso |
|---|---|---|
| `WHATSAPP_INTEGRATION_ENABLED` | `false` | Interruptor maestro |
| `INTEGRATION_RATE_LIMIT_PER_MIN` | `60` | Peticiones por minuto por API key |
| `WHATSAPP_PHONE_RATE_LIMIT_PER_MIN` | `20` | Escrituras por minuto por teléfono |
| `ATTACHMENT_MAX_MB` | `16` | Tamaño máximo de adjuntos recibidos por WhatsApp |
| `TICKET_REOPEN_MAX_DAYS` | `7` | Días tras el cierre en que el cliente aún puede reabrir |
| `WEBHOOK_TIMEOUT_SECONDS` | `10` | Timeout del POST a cada webhook |
| `WHATSAPP_DEFAULT_CATEGORY` | `Soporte técnico` | Categoría de tickets creados por WhatsApp sin `category_id` |
| `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET` | vacío | Semilla del primer `WebhookEndpoint` (se crea al arrancar si no existe) |
| `OUTBOX_POLL_INTERVAL_SECONDS` | `30` | Frecuencia del scheduler |
| `OUTBOX_BATCH_SIZE` | `20` | Eventos por pasada |
| `OUTBOX_IMMEDIATE_DISPATCH` | `true` | Intentar entregar justo después de cada cambio |
| `SETTINGS_ENC_KEY` | requerida | Cifra los secretos de los webhooks (ya se usaba para SMTP). No cambiarla una vez en uso |
| `NEXTAUTH_URL` | `http://localhost:3000` | Base de `ticket.url` en los payloads |

## Seed de desarrollo

`npx prisma db seed` (o `npx tsx prisma/seed.ts`) desde `apps/web` deja, además
de lo que ya cargaba:

- Segunda empresa **Comercial del Bajío** (prefijo `CB`) con la usuaria
  `lucia@comercialbajio.com`.
- Tres contactos con WhatsApp verificado: `cliente@demoindustrial.com`
  (+525512345678, opt-in), `admin@demoindustrial.com` (+525523456789, opt-in) y
  `lucia@comercialbajio.com` (+524771234567, **sin** opt-in, para probar que no
  se emiten eventos).
- Conversación de Cliente Demo con mensaje hace 2 h (ventana de 24 h abierta).
- Tickets `MB-0002` (PENDING), `CB-0001` (creado por WhatsApp, con comentario
  por WhatsApp), `CB-0002` (RESOLVED) y `CB-0003` (CLOSED hace 2 días), además
  del `MB-0001` existente. No se tocan tickets ya existentes con esos folios.
- API key `n8n (seed dev)` con todos los scopes; se imprime una sola vez (fíjala
  con `SEED_INTEGRATION_API_KEY` si quieres un valor estable).

## Checklist de deploy (VPS, PM2, SQLite)

1. **Respaldo de la BD**: `cp prisma/dev.db prisma/dev.db.bak-$(date +%F)` en
   el directorio real de la app (`/var/www/apps/tickets/app/apps/web`).
2. `git pull` de la rama con la integración.
3. `npm install` (nuevas dependencias: `libphonenumber-js`; `vitest` y
   `@vitest/coverage-v8` son de desarrollo).
4. **Resolver el drift previo**: en producción las tablas `TicketCollaborator`,
   `EmailSettings` y el catálogo global se aplicaron con `db push`, así que
   antes de migrar hay que marcar esas migraciones como aplicadas:

   ```bash
   npx prisma migrate resolve --applied 20260924000001_add_ticket_collaborators_and_email_settings
   npx prisma migrate resolve --applied 20260924000002_global_categories
   ```

   Verifica primero con `npx prisma migrate status`; si `20260318174304_add_token_invalidated_at`
   también aparece como pendiente pero la columna ya existe, resuélvela igual.
5. `npx prisma migrate deploy` (aplica las cuatro migraciones nuevas).
6. Variables en `.env`: `WHATSAPP_INTEGRATION_ENABLED=true`, `SETTINGS_ENC_KEY`
   (ya existe), y opcionalmente `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET`.
7. `npm run build` y `pm2 restart tickets-mirmiapps` (el scheduler del outbox
   vive en el mismo proceso; no hay un worker aparte).
8. En Admin → Integraciones: crear la API key para n8n (copiarla una sola vez)
   y registrar el webhook endpoint de n8n si no se sembró desde `.env`. Usar
   "Enviar evento de prueba" para comprobar la firma del lado de n8n.
9. Prueba de humo:

   ```bash
   curl -s "https://tickets.mirmiapps.com/api/v1/integrations/whatsapp/contacts/lookup?phone=5215512345678" -H "X-Integration-Key: $KEY"
   ```

   Debe responder `200` con el contacto o `404` si el número no existe; `401`
   significa key incorrecta y `404` en **todos** los endpoints, flag apagado.
10. Revisar `pm2 logs tickets-mirmiapps` buscando `[outbox] scheduler iniciado`.

Para reprocesar eventos muertos: `npm run outbox:retry-dead` o el botón de
Admin → Integraciones.

## Pendiente para la etapa de n8n (fuera de este alcance)

- Verificar Meta Business y registrar el número en WhatsApp Cloud API.
- Mandar a aprobación las plantillas `ticket_creado`, `ticket_actualizado`,
  `ticket_resuelto` y `verificacion_numero`.
- Flujos de n8n: webhook de Meta → `normalizar teléfono` → `GET /contacts/lookup`
  → enrutar por `GET /conversations/{phone}` → llamadas a tickets → `PUT
  /conversations/{phone}`; y webhook de salida → validar firma → enviar texto
  libre o plantilla según `whatsapp.within_24h_window`.
- Verificación del número por OTP vía plantilla (hoy la hace un admin a mano).
- Interpretación de la intención del mensaje con IA.

## Tests

```bash
cd apps/web
npm test
```

`tests/global-setup.ts` crea `.vitest/test.db`, aplica las migraciones y carga
los fixtures de `tests/fixtures.ts`. Los tests de la API están en
`tests/integration/whatsapp-api.test.ts`.

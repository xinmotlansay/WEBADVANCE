# Tích hợp chat AI: Backend ↔ n8n ↔ Gemini

Tài liệu này mô tả luồng chat AI đã triển khai trong `server/src/modules/chat` và cách import workflow n8n.

## 1. Luồng tổng thể

```
Khách (customer-web)
  ├─ Trợ lý AI công khai: POST /api/v1/chat/ai/ask  (không cần đăng nhập, không lưu DB)
  │    └─ gọi webhook n8n → Gemini → trả reply + suggestedProducts (stateless)
  └─ Chat CSKH (đã đăng nhập): POST /api/v1/chat/sessions/:id/messages
       ├─ Lưu tin nhắn khách vào MongoDB (senderType = CUSTOMER)
       ├─ Gọi webhook n8n  ──► Gemini (kèm catalog + chính sách)
       ├─ Lưu câu trả lời (senderType = AI)
       └─ Trả JSON + phát Socket.IO `chat:message`
```

- Luồng AI công khai không tạo phiên và không ghi MongoDB: lịch sử do client gửi lên trong `history`, refresh trang là mất.
- Luồng CSKH lưu đầy đủ vào `chatsessions` / `chatmessages`.

- Tin nhắn của khách **luôn được lưu trước** khi gọi n8n, nên n8n lỗi không làm mất tin.
- Nếu n8n lỗi/timeout: backend ghi tin `SYSTEM` thông báo trợ lý đang bận, chuyển phiên sang CSKH (`mode = SUPPORT`, `status = WAITING`).
- Nếu chưa cấu hình `N8N_CHAT_WEBHOOK_URL`: backend chạy **chế độ demo**, trả lời theo bộ chính sách có sẵn để kiểm thử giao diện.

## 2. Import workflow n8n

Có 2 bản, cùng logic và cùng contract, chỉ khác cách lấy secret/key:

| Bản               | File                                                           | Dùng khi                                                                    |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Self-hosted (env) | `docs/integrations/caraveso-ai-chat-workflow.v2.json`          | Bạn có quyền sửa server/Docker để set biến môi trường                       |
| Credential        | `docs/integrations/caraveso-ai-chat-workflow.credentials.json` | Bạn **không có quyền vào server** (VPS của người khác), hoặc dùng n8n Cloud |

Cả 2 file sinh từ `scripts/build-n8n-chat-workflow.mjs` và được test bằng `scripts/verify-n8n-chat-workflow.mjs`.

> Không có quyền SSH/dashboard VPS thì dùng bản **Credential**: mọi secret/key nằm trong credential của n8n, không cần đọc `$env`. Đây là trường hợp của instance `https://n8n.ba-ailab.com`.

> File `docs/integrations/n8n-chat-workflow.json` là bản nháp ban đầu, không dùng nữa.

### 2.1 Self-hosted

1. Mở n8n → **Workflows** → **Import from File** → chọn `caraveso-ai-chat-workflow.v2.json`.
2. Khai báo biến môi trường cho n8n rồi restart:
   ```
   CARAVESO_WEBHOOK_SECRET=<chuỗi bí mật, trùng N8N_WEBHOOK_SECRET của backend>
   GEMINI_API_KEY=<key thật>
   GEMINI_CHAT_MODEL=gemini-2.5-flash
   ```
   Workflow tự so sánh header `x-webhook-secret` với `CARAVESO_WEBHOOK_SECRET` ở node **02 - Verify Secret** (không cần tạo credential Header Auth).
   Nếu n8n báo không cho đọc biến môi trường, đặt `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
3. Bật **Active** và lấy URL:
   - Production: `https://<host>/webhook/caraveso-chat`
   - Test: `https://<host>/webhook-test/caraveso-chat` (chỉ dùng khi bấm Execute Workflow)

### 2.2 Bản dùng credential (không cần quyền server)

Bản này không đọc `$env`, nên chạy được cả trên n8n Cloud và self-hosted do người khác quản trị. Nó bỏ node **Verify Secret** và **Respond 401**: việc xác thực do credential của Webhook lo (sai secret → n8n trả 403 trước khi vào workflow, backend vẫn coi là lỗi). Còn 7 node:

```
01 Webhook (Header Auth credential)
  └─ 02 Normalize Input
       └─ 03 IF Message Present
            ├─ true  → 04 Gemini (Header Auth credential) → 05 Parse Response → 06 Respond 200
            └─ false → 07 Respond Empty Message
```

1. Import `caraveso-ai-chat-workflow.credentials.json`.
2. Node **01 - Webhook CaraVeso Chat**:
   - `Authentication` đã đặt sẵn **Header Auth**.
   - **Create new credential** → Name: `x-webhook-secret`, Value: chuỗi secret bạn tự đặt (ví dụ `caraveso-2026`).
   - Giữ POST, path `caraveso-chat`, Respond = Using Respond to Webhook node.
3. Node **04 - Gemini Generate Content**:
   - `Authentication` đã đặt sẵn **Generic Credential Type → Header Auth**.
   - **Create new credential** → Name: `x-goog-api-key`, Value: key Gemini (Google AI Studio).
   - Model cố định `gemini-2.5-flash` trong URL; muốn đổi thì sửa tay URL trong node.
   - Key nằm trong credential, **không** ghi vào URL `?key=` (n8n lưu execution data nên key sẽ lộ trong log).
4. Bật workflow: n8n 2.x bấm **Publish**, bản cũ bật toggle **Active**. URL dùng thật:
   `https://<host>/webhook/caraveso-chat`
5. Test trước khi nối backend:
   ```bash
   curl -X POST "https://<host>/webhook/caraveso-chat" \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: caraveso-2026" \
     -d '{"sessionId":"test-1","message":"Sofa da phù hợp phòng khách 20m2?","history":[],"customer":{"id":"guest","fullName":"Khách"},"context":{"products":[],"policies":{},"showrooms":[],"collections":[]}}'
   ```
   Kỳ vọng: HTTP 200 với `{"sessionId":"test-1","reply":"Dạ, ...","handoff":false,"suggestedProducts":[],"error":null}`.
   Sai secret phải nhận HTTP 403 của n8n.

Cả 2 bản dùng chung cấu hình backend ở mục 2.3.

### 2.3 Cấu hình backend (dùng chung)

Thêm vào `.env` của backend:

```
N8N_CHAT_WEBHOOK_URL=https://<host>/webhook/caraveso-chat
N8N_WEBHOOK_SECRET=<secret, trùng credential/secret bên n8n>
CHAT_AI_TIMEOUT_MS=45000
```

`GEMINI_CHAT_MODEL` chỉ dùng cho bản self-hosted; bản credential cố định model trong URL.

Backend gọi workflow với timeout 45s; node Gemini trong n8n timeout 20s và retry 1 lần (tối đa 40s) nên không bị cắt giữa chừng.

### Sửa workflow

Đừng sửa trực tiếp file JSON. Sửa JS/prompt trong `scripts/build-n8n-chat-workflow.mjs`, chạy:

```bash
node scripts/build-n8n-chat-workflow.mjs   # sinh lại cả 2 file JSON
node scripts/verify-n8n-chat-workflow.mjs  # chạy thử Code node + kiểm tra cấu trúc 2 bản
```

Sau đó import lại file JSON vào n8n. Cách này tránh lỗi escape trong Code node và có test cho phần chọn sản phẩm, parse JSON, lọc `suggestedProducts`.

Khi thêm/bớt node, phải cập nhật `NODE_NAMES` trong script: các Code node gọi cứng tên node qua `$('...')`, nên tên node đổi mà không sửa map là workflow chết ở node Normalize.

## 3. Contract backend → n8n

```json
{
  "sessionId": "665f...",
  "message": "Sofa da nâu dưới 20 triệu?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "customer": { "id": "...", "fullName": "Nguyễn Văn A" },
  "context": {
    "products": [
      {
        "name": "Sofa da Milan",
        "slug": "sofa-da-milan",
        "productCode": "100.002",
        "description": "Sofa da bò 3 chỗ, khung gỗ sồi",
        "category": ["Ghế"],
        "room": ["Phòng khách"],
        "priceFrom": 32000000,
        "priceTo": 32000000,
        "colors": ["Nâu bò", "Đen"],
        "material": "Da bò",
        "dimensions": "220x95x80cm",
        "warrantyMonths": 24,
        "stockStatus": "Còn hàng",
        "variants": [
          { "color": "Nâu bò", "dimensions": "220x95x80cm", "price": 32000000, "stockQuantity": 24 }
        ]
      }
    ],
    "policies": {
      "warranty": "...",
      "return": "...",
      "shipping": "...",
      "payment": "...",
      "voucher": "...",
      "workingHours": "..."
    },
    "showrooms": [
      {
        "name": "CaraVeso Design Center",
        "city": "TP. Hồ Chí Minh",
        "address": "101 Tôn Dật Tiên, Quận 7",
        "phone": "1900 080906",
        "openTime": "09:00",
        "closeTime": "21:00"
      }
    ],
    "collections": [
      { "name": "ODA", "slogan": "...", "description": "...", "productNames": ["Sofa da Milan"] }
    ]
  }
}
```

- `context.products` do backend dựng từ MongoDB (`products` + `product_variants` + `categories`), tối đa 60 sản phẩm đang `ACTIVE`, cache 5 phút (`server/src/modules/chat/chat-catalog.service.ts`). n8n không cần đọc DB, và dữ liệu luôn khớp web.
- `showrooms` lấy từ collection `showrooms`, `collections` từ `product_collections`.
- `history` tối đa 8 lượt gần nhất (backend cắt trước khi gửi).
- Node **04 - Normalize Input** chấm điểm sản phẩm theo từ khóa câu hỏi rồi chỉ gửi 12 mẫu liên quan nhất vào prompt, kèm toàn bộ chính sách, cửa hàng, bộ sưu tập.

## 4. Contract n8n → backend

```json
{
  "sessionId": "...",
  "reply": "Dạ, ...",
  "handoff": false,
  "suggestedProducts": ["Sofa da Milan"],
  "error": null
}
```

- Luôn trả HTTP 200 với đúng schema, kể cả khi model lỗi; riêng sai `x-webhook-secret` trả 401.
- `reply` rỗng → backend coi như lỗi, hiện câu xin lỗi và (với chat CSKH) chuyển nhân viên.
- `handoff = true` → backend chuyển phiên CSKH sang nhân viên và ghi tin `SYSTEM`.
- `error` khác `null` → backend coi như AI lỗi.
- `suggestedProducts` bị lọc theo đúng tên sản phẩm trong catalog; tối đa 3. Với khung AI công khai, backend dùng danh sách này làm chip gợi ý; nếu rỗng thì hiện 3 câu gợi ý mặc định.

## 5. Test nhanh bằng curl

```bash
curl -X POST "http://localhost:5678/webhook/caraveso-chat" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "sessionId": "test-1",
    "message": "Sofa da màu nâu dưới 20 triệu?",
    "history": [],
    "customer": { "id": "u1", "fullName": "Huy" },
    "context": {
      "products": [
        {
          "name": "Sofa da Milan",
          "description": "Sofa da bò 3 chỗ",
          "category": ["Ghế"],
          "room": ["Phòng khách"],
          "priceFrom": 32000000,
          "priceTo": 32000000,
          "colors": ["Nâu bò"],
          "warrantyMonths": 24,
          "stockStatus": "Còn hàng"
        }
      ],
      "policies": {
        "warranty": "Bảo hành 24 tháng tính từ ngày giao.",
        "return": "Đổi trả trong 7 ngày.",
        "shipping": "Phí ship hiện ở bước thanh toán.",
        "payment": "COD hoặc QR.",
        "voucher": "Mỗi đơn 1 voucher.",
        "workingHours": "8:00-17:30 thứ 2 đến thứ 7."
      }
    }
  }'
```

## 6. API chat của backend

Khách (bearer access token):

| Method | Endpoint                                            | Mô tả                     |
| ------ | --------------------------------------------------- | ------------------------- |
| POST   | `/api/v1/chat/sessions`                             | Mở hoặc lấy phiên đang mở |
| GET    | `/api/v1/chat/sessions`                             | Danh sách phiên của khách |
| GET    | `/api/v1/chat/sessions/:id/messages?limit=&before=` | Lịch sử tin nhắn          |
| POST   | `/api/v1/chat/sessions/:id/messages`                | Gửi tin nhắn              |
| POST   | `/api/v1/chat/sessions/:id/handoff`                 | Yêu cầu gặp nhân viên     |
| POST   | `/api/v1/chat/sessions/:id/read`                    | Đánh dấu đã đọc           |

Admin (chỉ `SUPER_ADMIN`, `ORDER_ADMIN`):

| Method | Endpoint                                    | Mô tả          |
| ------ | ------------------------------------------- | -------------- |
| GET    | `/api/v1/admin/chat/sessions?mode=&status=` | Hộp thư CSKH   |
| GET    | `/api/v1/admin/chat/sessions/:id/messages`  | Xem hội thoại  |
| POST   | `/api/v1/admin/chat/sessions/:id/claim`     | Nhận phiên     |
| POST   | `/api/v1/admin/chat/sessions/:id/messages`  | Trả lời khách  |
| POST   | `/api/v1/admin/chat/sessions/:id/close`     | Kết thúc phiên |

## 7. Socket.IO

Kết nối: `io('/', { auth: { token: accessToken }, path: '/socket.io' })`.

| Hướng | Event                  | Payload                               |
| ----- | ---------------------- | ------------------------------------- |
| C→S   | `chat:join`            | `{ sessionId }`                       |
| C→S   | `chat:leave`           | `{ sessionId }`                       |
| C→S   | `chat:typing`          | `{ sessionId, isTyping }`             |
| S→C   | `chat:message`         | `{ sessionId, message, session }`     |
| S→C   | `chat:session-updated` | `{ session }`                         |
| S→C   | `chat:typing`          | `{ sessionId, senderType, isTyping }` |

Room: `user:<id>` (mọi thiết bị của khách), `chat:<sessionId>` (người đang mở phiên), `agents` (admin CSKH).

## 8. Nâng cấp RAG vector (sau này)

Catalog hiện tại (29 sản phẩm) được nén còn ~7.000 ký tự và gửi thẳng trong prompt, nên **chưa cần vector store**. Node **04 - Normalize Input** chấm điểm từ khóa rồi chọn 12 sản phẩm liên quan nhất.

Khi catalog lớn hơn ~200 sản phẩm hoặc có nhiều tài liệu chính sách dài:

1. Tạo workflow ingest riêng: đọc sản phẩm/chính sách → chunk → embedding (`text-embedding-004` hoặc OpenAI) → lưu Qdrant/Pinecone/pgvector.
2. Trong workflow chat, chèn node retriever giữa **04 - Normalize Input** và **05 - IF Message Present**.
3. Gộp chunk truy hồi với `context.products`; vẫn giữ allowlist `productNames` để lọc `suggestedProducts`.
4. Contract đầu vào/ra giữ nguyên, backend không cần sửa.

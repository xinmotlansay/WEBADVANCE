# Tích hợp chat AI: Backend ↔ n8n ↔ Gemini

Tài liệu này mô tả luồng chat AI đã triển khai trong `server/src/modules/chat` và cách import workflow n8n.

## 1. Luồng tổng thể

```
Khách (customer-web)
  └─ POST /api/v1/chat/sessions/:id/messages
       ├─ Lưu tin nhắn khách vào MongoDB (senderType = CUSTOMER)
       ├─ Gọi webhook n8n  ──► Gemini (kèm chính sách + sản phẩm liên quan)
       ├─ Lưu câu trả lời (senderType = AI)
       └─ Trả JSON + phát Socket.IO `chat:message`
```

- Tin nhắn của khách **luôn được lưu trước** khi gọi n8n, nên n8n lỗi không làm mất tin.
- Nếu n8n lỗi/timeout: backend ghi tin `SYSTEM` thông báo trợ lý đang bận, chuyển phiên sang CSKH (`mode = SUPPORT`, `status = WAITING`).
- Nếu chưa cấu hình `N8N_CHAT_WEBHOOK_URL`: backend chạy **chế độ demo**, trả lời theo bộ chính sách có sẵn để kiểm thử giao diện.

## 2. Import workflow n8n

1. Mở n8n → **Workflows** → **Import from File** → chọn `docs/integrations/n8n-chat-workflow.json`.
2. Vào node **Webhook** → tạo credential **Header Auth**:
   - Name: `x-webhook-secret`
   - Value: trùng với `N8N_WEBHOOK_SECRET` trong `.env` của backend.
3. Thêm biến môi trường cho n8n rồi restart:
   ```
   GEMINI_API_KEY=<key thật>
   GEMINI_CHAT_MODEL=gemini-2.5-flash
   ```
   Nếu dùng n8n Cloud (không cho `$env`), thay URL Gemini bằng model cố định và dùng credential Header Auth `x-goog-api-key`.
4. Activate workflow và lấy URL:
   - Production: `https://<host>/webhook/caraveso-chat`
   - Test: `https://<host>/webhook-test/caraveso-chat` (chỉ dùng khi bấm Execute Workflow)
5. Cấu hình backend `.env`:
   ```
   N8N_CHAT_WEBHOOK_URL=https://<host>/webhook/caraveso-chat
   N8N_WEBHOOK_SECRET=<secret>
   GEMINI_CHAT_MODEL=gemini-2.5-flash
   ```

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
        "name": "Sofa Da Milano",
        "price": 18500000,
        "material": "Da thật",
        "color": "Nâu",
        "dimensions": "220x95x80cm",
        "stockStatus": "còn hàng"
      }
    ],
    "policies": {
      "warranty": "...",
      "return": "...",
      "shipping": "...",
      "payment": "...",
      "workingHours": "..."
    }
  }
}
```

Giới hạn hiện tại: backend gửi tối đa 8 sản phẩm (khi module sản phẩm có dữ liệu) và 20 tin nhắn lịch sử gần nhất.

## 4. Contract n8n → backend

```json
{
  "sessionId": "...",
  "reply": "Dạ, ...",
  "handoff": false,
  "suggestedProducts": ["Sofa Da Milano"],
  "error": null
}
```

- `handoff = true` → backend chuyển phiên sang nhân viên CSKH và ghi tin `SYSTEM`.
- `error` khác `null` → backend coi như AI lỗi, chuyển CSKH.

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
          "name": "Sofa Da Milano",
          "price": 18500000,
          "material": "Da thật",
          "color": "Nâu",
          "dimensions": "220x95x80cm",
          "stockStatus": "còn hàng"
        }
      ]
    }
  }'
```

## 6. API chat của backend

Khách (bearer access token):

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/v1/chat/sessions` | Mở hoặc lấy phiên đang mở |
| GET | `/api/v1/chat/sessions` | Danh sách phiên của khách |
| GET | `/api/v1/chat/sessions/:id/messages?limit=&before=` | Lịch sử tin nhắn |
| POST | `/api/v1/chat/sessions/:id/messages` | Gửi tin nhắn |
| POST | `/api/v1/chat/sessions/:id/handoff` | Yêu cầu gặp nhân viên |
| POST | `/api/v1/chat/sessions/:id/read` | Đánh dấu đã đọc |

Admin (chỉ `SUPER_ADMIN`, `ORDER_ADMIN`):

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/v1/admin/chat/sessions?mode=&status=` | Hộp thư CSKH |
| GET | `/api/v1/admin/chat/sessions/:id/messages` | Xem hội thoại |
| POST | `/api/v1/admin/chat/sessions/:id/claim` | Nhận phiên |
| POST | `/api/v1/admin/chat/sessions/:id/messages` | Trả lời khách |
| POST | `/api/v1/admin/chat/sessions/:id/close` | Kết thúc phiên |

## 7. Socket.IO

Kết nối: `io('/', { auth: { token: accessToken }, path: '/socket.io' })`.

| Hướng | Event | Payload |
|---|---|---|
| C→S | `chat:join` | `{ sessionId }` |
| C→S | `chat:leave` | `{ sessionId }` |
| C→S | `chat:typing` | `{ sessionId, isTyping }` |
| S→C | `chat:message` | `{ sessionId, message, session }` |
| S→C | `chat:session-updated` | `{ session }` |
| S→C | `chat:typing` | `{ sessionId, senderType, isTyping }` |

Room: `user:<id>` (mọi thiết bị của khách), `chat:<sessionId>` (người đang mở phiên), `agents` (admin CSKH).

## 8. Nâng cấp RAG vector (sau này)

Node **Build Prompt** hiện chấm điểm KB theo từ khóa. Khi có vector store:

1. Chèn node embedding + vector store retriever giữa **Webhook** và **Build Prompt**.
2. Gộp `retrieved chunks` với `context.products` backend gửi sang.
3. Xóa mảng `KB` trong code node.

Contract đầu vào/ra giữ nguyên, backend không cần sửa.

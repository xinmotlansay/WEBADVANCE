import { z } from 'zod';
import { ChatMode, ChatSessionStatus } from '../../lib/shared-enums.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Mã không hợp lệ');

export const chatSessionParamsSchema = z.object({ id: objectId });

export const chatSendMessageSchema = z.object({
  content: z
    .string({ error: 'Nội dung tin nhắn không hợp lệ' })
    .trim()
    .min(1, 'Vui lòng nhập nội dung tin nhắn')
    .max(2000, 'Tin nhắn tối đa 2000 ký tự'),
});

export const chatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(),
});

export const chatSessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const chatAdminSessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  mode: z.nativeEnum(ChatMode).optional(),
  status: z.nativeEnum(ChatSessionStatus).optional(),
});

export type ChatSendMessageBody = z.infer<typeof chatSendMessageSchema>;

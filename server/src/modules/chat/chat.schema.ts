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

export const chatOpenSessionSchema = z.object({
  mode: z.nativeEnum(ChatMode).optional(),
});

export const chatAiAskSchema = z.object({
  message: z
    .string({ error: 'Nội dung câu hỏi không hợp lệ' })
    .trim()
    .min(1, 'Vui lòng nhập câu hỏi')
    .max(2000, 'Câu hỏi tối đa 2000 ký tự'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(10)
    .default([]),
});

export const chatAdminSessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  mode: z.nativeEnum(ChatMode).optional(),
  status: z.nativeEnum(ChatSessionStatus).optional(),
});

export type ChatSendMessageBody = z.infer<typeof chatSendMessageSchema>;
export type ChatAiAskBody = z.infer<typeof chatAiAskSchema>;
export type ChatOpenSessionBody = z.infer<typeof chatOpenSessionSchema>;

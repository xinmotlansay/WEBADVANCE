import type { RequestHandler } from 'express';
import {
  closeSession,
  listAdminMessages,
  listAdminSessions,
  listCustomerMessages,
  listCustomerSessions,
  markCustomerRead,
  openSession,
  claimSession,
  requestHandoff,
  sendAgentMessage,
  sendCustomerMessage,
  type AdminSessionFilter,
} from './chat.service.js';
import { askPublicAi } from './ai-chat.service.js';
import type { ChatAiAskBody, ChatOpenSessionBody } from './chat.schema.js';

function success<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message ? { message } : {}) };
}

export const openSessionHandler: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as ChatOpenSessionBody;
  const session = await openSession(req.user!.id, body.mode);
  res.status(200).json(success({ session }));
};

export const listSessionsHandler: RequestHandler = async (req, res) => {
  const query = res.locals.query as { limit: number };
  const sessions = await listCustomerSessions(req.user!.id, query.limit);
  res.status(200).json(success({ sessions }));
};

export const listMessagesHandler: RequestHandler = async (req, res) => {
  const query = res.locals.query as { limit: number; before?: Date };
  const result = await listCustomerMessages(String(req.params.id), req.user!.id, query.limit, query.before);
  res.status(200).json(success(result));
};

export const sendMessageHandler: RequestHandler = async (req, res) => {
  const { content } = req.body as { content: string };
  const result = await sendCustomerMessage(String(req.params.id), req.user!.id, content);
  res.status(201).json(success(result));
};

export const requestHandoffHandler: RequestHandler = async (req, res) => {
  const result = await requestHandoff(String(req.params.id), req.user!.id);
  res.status(200).json(success(result));
};

export const markReadHandler: RequestHandler = async (req, res) => {
  const session = await markCustomerRead(String(req.params.id), req.user!.id);
  res.status(200).json(success({ session }));
};

/* ----------------------------- Admin ----------------------------- */

export const adminListSessionsHandler: RequestHandler = async (_req, res) => {
  const query = res.locals.query as AdminSessionFilter;
  const sessions = await listAdminSessions(query);
  res.status(200).json(success({ sessions }));
};

export const adminListMessagesHandler: RequestHandler = async (req, res) => {
  const query = res.locals.query as { limit: number; before?: Date };
  const result = await listAdminMessages(String(req.params.id), query.limit, query.before);
  res.status(200).json(success(result));
};

export const adminClaimHandler: RequestHandler = async (req, res) => {
  const session = await claimSession(String(req.params.id), req.user!.id);
  res.status(200).json(success({ session }));
};

export const adminSendMessageHandler: RequestHandler = async (req, res) => {
  const { content } = req.body as { content: string };
  const result = await sendAgentMessage(String(req.params.id), req.user!.id, content);
  res.status(201).json(success(result));
};

export const adminCloseHandler: RequestHandler = async (req, res) => {
  const session = await closeSession(String(req.params.id));
  res.status(200).json(success({ session }));
};

/* ----------------------------- AI công khai ----------------------------- */

export const publicAiAskHandler: RequestHandler = async (req, res) => {
  const { message, history } = req.body as ChatAiAskBody;
  const answer = await askPublicAi(message, history);
  res.status(200).json(success(answer));
};

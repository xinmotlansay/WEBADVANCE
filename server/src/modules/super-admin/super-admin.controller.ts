import type { RequestHandler } from 'express';
import { sendData, sendPage } from '../../utils/response.js';
import * as accounts from './admin-accounts.service.js';
import { listAuditLogs, type AuditLogQuery } from './audit-log.service.js';
import { getOverview, type OverviewRange } from './dashboard.service.js';
import { listSystemConfigs, updateSystemConfig } from './system-config.service.js';

const id = (params: Record<string, unknown>) => String(params['id']);

export const overviewHandler: RequestHandler = async (_req, res) => {
  const { range } = res.locals['query'] as { range: OverviewRange };
  sendData(res, await getOverview(range));
};

export const listAdminsHandler: RequestHandler = async (_req, res) => {
  const result = await accounts.listAdmins(res.locals['query'] as accounts.AdminListQuery);
  res.json({ success: true, data: result.data, meta: result.meta, summary: result.summary });
};

export const createAdminHandler: RequestHandler = async (req, res) => {
  const result = await accounts.createAdmin(req, req.body as accounts.CreateAdminInput);
  res.status(201).json({ success: true, data: result, message: 'Đã tạo tài khoản và gửi liên kết đặt mật khẩu' });
};

export const updateAdminHandler: RequestHandler = async (req, res) => {
  sendData(res, await accounts.updateAdmin(req, id(req.params), req.body as accounts.UpdateAdminInput));
};

export const changeRoleHandler: RequestHandler = async (req, res) => {
  sendData(res, await accounts.changeAdminRole(req, id(req.params), (req.body as { roleName: never }).roleName));
};

export const deactivateHandler: RequestHandler = async (req, res) => {
  sendData(res, await accounts.deactivateAdmin(req, id(req.params), (req.body as { reason?: string }).reason));
};

export const activateHandler: RequestHandler = async (req, res) => {
  sendData(res, await accounts.activateAdmin(req, id(req.params)));
};

export const resendInviteHandler: RequestHandler = async (req, res) => {
  sendData(res, await accounts.resendInvite(req, id(req.params)));
};

export const listRolesHandler: RequestHandler = async (_req, res) => {
  sendData(res, await accounts.listRoles());
};

export const auditLogsHandler: RequestHandler = async (_req, res) => {
  const result = await listAuditLogs(res.locals['query'] as AuditLogQuery);
  sendPage(res, result.data, result.meta);
};

export const listConfigsHandler: RequestHandler = async (_req, res) => {
  sendData(res, await listSystemConfigs());
};

export const updateConfigHandler: RequestHandler = async (req, res) => {
  sendData(res, await updateSystemConfig(req, String(req.params['key']), (req.body as { value: unknown }).value));
};

export const setPasswordHandler: RequestHandler = async (req, res) => {
  const { token, password } = req.body as { token: string; password: string };
  const result = await accounts.setPasswordFromInvite(token, password);
  res.json({ success: true, data: result, message: 'Đã đặt mật khẩu, bạn có thể đăng nhập' });
};

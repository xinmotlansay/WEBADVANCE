import type { RequestHandler } from 'express';
import {
  approveLateCompensation,
  cancelOrder,
  confirmOrder,
  finalizeReturn,
  getOrder,
  getOrderPayment,
  listLateCompensations,
  listOrders,
  markDelivered,
  markDeliveryFailed,
  redeliver,
  rejectLateCompensation,
  returnToWarehouse,
  updateOrderStatus,
  updateShipment,
  type ActorContext,
} from './order-admin.service.js';
import type {
  CancelOrderInput,
  DeliveryFailedInput,
  FinalizeReturnInput,
  OrderListQueryInput,
  UpdateOrderStatusInput,
  UpdateShipmentInput,
} from './order-admin.schema.js';

function actorOf(req: Parameters<RequestHandler>[0]): ActorContext {
  return { userId: req.user!.id, ip: req.ip ?? null };
}

function idOf(req: Parameters<RequestHandler>[0]): string {
  return String(req.params['id']);
}

export const listOrdersHandler: RequestHandler = async (req, res) => {
  const query = res.locals['query'] as OrderListQueryInput;
  const result = await listOrders(query);
  res.json({ success: true, data: result.data, meta: result.meta });
};

export const getOrderHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await getOrder(idOf(req)) });
};

export const confirmOrderHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await confirmOrder(idOf(req), actorOf(req)) });
};

export const updateOrderStatusHandler: RequestHandler = async (req, res) => {
  const body = req.body as UpdateOrderStatusInput;
  res.json({ success: true, data: await updateOrderStatus(idOf(req), body, actorOf(req)) });
};

export const cancelOrderHandler: RequestHandler = async (req, res) => {
  const body = req.body as CancelOrderInput;
  res.json({ success: true, data: await cancelOrder(idOf(req), body, actorOf(req)) });
};

export const getOrderPaymentHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await getOrderPayment(idOf(req)) });
};

export const updateShipmentHandler: RequestHandler = async (req, res) => {
  const body = req.body as UpdateShipmentInput;
  res.json({ success: true, data: await updateShipment(idOf(req), body, actorOf(req)) });
};

export const markDeliveredHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await markDelivered(idOf(req), actorOf(req)) });
};

export const markDeliveryFailedHandler: RequestHandler = async (req, res) => {
  const body = req.body as DeliveryFailedInput;
  res.json({ success: true, data: await markDeliveryFailed(idOf(req), body, actorOf(req)) });
};

export const redeliverHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await redeliver(idOf(req), actorOf(req)) });
};

export const returnToWarehouseHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await returnToWarehouse(idOf(req), actorOf(req)) });
};

export const finalizeReturnHandler: RequestHandler = async (req, res) => {
  const body = req.body as FinalizeReturnInput;
  res.json({ success: true, data: await finalizeReturn(idOf(req), body, actorOf(req)) });
};

export const listLateCompensationsHandler: RequestHandler = async (_req, res) => {
  const query = res.locals['query'] as { status?: string };
  const status = query.status as Parameters<typeof listLateCompensations>[0];
  res.json({ success: true, data: await listLateCompensations(status) });
};

export const approveLateCompensationHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await approveLateCompensation(idOf(req), actorOf(req)) });
};

export const rejectLateCompensationHandler: RequestHandler = async (req, res) => {
  const body = req.body as { reason: string };
  res.json({
    success: true,
    data: await rejectLateCompensation(idOf(req), body.reason, actorOf(req)),
  });
};

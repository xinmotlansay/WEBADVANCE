import type { RequestHandler } from 'express';
import { getCustomer, listCustomers } from './customer.service.js';
import type { CustomerListQuery } from './customer.schema.js';

export const listCustomersHandler: RequestHandler = async (_req, res) => {
  const result = await listCustomers(res.locals['query'] as CustomerListQuery);
  res.json({ success: true, ...result });
};
export const getCustomerHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await getCustomer(String(req.params['id'])) });
};

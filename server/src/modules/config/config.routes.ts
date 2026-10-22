import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { getCheckoutConfig } from './config.service.js';
import { SystemConfigModel } from './system-config.model.js';

export const DEFAULT_STORE_INFO = {
  name: 'CaraVeso',
  logo: '',
  hotline: '',
  email: '',
  address: '',
  establishedDate: '',
  workingHours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] },
};

export const configRoutes = Router();

/** API Design 11b.6. Phần `policy`, `limits` bổ sung khi có chức năng tương ứng. */
configRoutes.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const [configs, checkout] = await Promise.all([
      SystemConfigModel.find({ _id: { $in: ['store', 'labels.newDays'] } }).lean(),
      getCheckoutConfig(),
    ]);
    const byKey = new Map(configs.map((c) => [c._id, c.value]));

    sendData(res, {
      store: { ...DEFAULT_STORE_INFO, ...(byKey.get('store') as object | undefined) },
      payment: checkout.payment,
      shipping: checkout.shipping,
      invoice: checkout.invoice,
      labels: { newDays: Number(byKey.get('labels.newDays') ?? 30) },
    });
  }),
);

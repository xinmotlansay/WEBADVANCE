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
  copyright: '',
  social: { facebook: '', youtube: '', tiktok: '', instagram: '' },
  workingHours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] },
};

function mergeStore(stored: Partial<typeof DEFAULT_STORE_INFO> | undefined) {
  return {
    ...DEFAULT_STORE_INFO,
    ...stored,
    social: { ...DEFAULT_STORE_INFO.social, ...stored?.social },
    workingHours: { ...DEFAULT_STORE_INFO.workingHours, ...stored?.workingHours },
  };
}

export const configRoutes = Router();

/** API Design 11b.6. Phần `policy`, `limits` bổ sung khi có chức năng tương ứng. */
configRoutes.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const [configs, checkout] = await Promise.all([
      SystemConfigModel.find({ _id: { $in: ['store', 'labels.newDays', 'policy.returnDays', 'policy.refundDaysMin', 'policy.refundDaysMax'] } }).lean(),
      getCheckoutConfig(),
    ]);
    const byKey = new Map(configs.map((c) => [c._id, c.value]));

    sendData(res, {
      store: mergeStore(byKey.get('store') as Partial<typeof DEFAULT_STORE_INFO> | undefined),
      payment: checkout.payment,
      shipping: checkout.shipping,
      invoice: checkout.invoice,
      labels: { newDays: Number(byKey.get('labels.newDays') ?? 30) },
      policy: { returnDays: Number(byKey.get('policy.returnDays') ?? 7), refundDaysMin: Number(byKey.get('policy.refundDaysMin') ?? 7), refundDaysMax: Number(byKey.get('policy.refundDaysMax') ?? 10) },
      limits: { maxImageSizeMb: 5 },
    });
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
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

/** Chỉ trả các khóa cấu hình trang chủ cần; phần còn lại của contract bổ sung khi có chức năng. */
configRoutes.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const configs = await SystemConfigModel.find({
      _id: { $in: ['store', 'labels.newDays'] },
    }).lean();
    const byKey = new Map(configs.map((c) => [c._id, c.value]));

    sendData(res, {
      store: { ...DEFAULT_STORE_INFO, ...(byKey.get('store') as object | undefined) },
      labels: { newDays: Number(byKey.get('labels.newDays') ?? 30) },
    });
  }),
);

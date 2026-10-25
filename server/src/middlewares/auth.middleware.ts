import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../utils/app-error.js';
import { AuthSessionModel } from '../modules/auth/auth.model.js';
import { customer } from '../modules/auth/auth.service.js';

export const requireCustomer: RequestHandler = async (req, res, next) => {
  try {
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ') || config.jwtSecret.length < 32) throw new AppError('UNAUTHORIZED', 401, 'Vui lòng đăng nhập');
    const payload = jwt.verify(bearer.slice(7), config.jwtSecret, { algorithms: ['HS256'], issuer: 'caraveso', audience: 'customer-web' });
    if (typeof payload === 'string' || typeof payload.sid !== 'string' || typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub)) throw new AppError('UNAUTHORIZED', 401, 'Phiên không hợp lệ');
    const session = await AuthSessionModel.findOne({ _id: payload.sid, userId: payload.sub, expiresAt: { $gt: new Date() } }).lean();
    if (!session) throw new AppError('UNAUTHORIZED', 401, 'Phiên đăng nhập đã kết thúc');
    res.locals['user'] = await customer(session.userId);
    res.locals['sessionId'] = session._id;
    next();
  } catch (error) { next(error instanceof AppError ? error : new AppError('UNAUTHORIZED', 401, 'Phiên đã hết hạn. Vui lòng đăng nhập lại')); }
};

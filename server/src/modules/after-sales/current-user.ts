import type { Response } from 'express';
import { Types } from 'mongoose';

/** Id khách đang đăng nhập, do `requireAuth` gán vào `res.locals['userId']`. */
export const currentUserId = (res: Response): Types.ObjectId =>
  new Types.ObjectId(res.locals['userId'] as string);

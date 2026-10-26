import { Types } from 'mongoose';
import { AppError } from './app-error.js';

export function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new AppError('NOT_FOUND', 404, 'Không tìm thấy tài nguyên');
  }
  return new Types.ObjectId(value);
}

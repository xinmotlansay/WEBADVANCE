import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => logger.info('Đã kết nối MongoDB'));
  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'Lỗi kết nối MongoDB'));
  mongoose.connection.on('disconnected', () => logger.warn('Mất kết nối MongoDB'));

  await mongoose.connect(config.MONGODB_URI);
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

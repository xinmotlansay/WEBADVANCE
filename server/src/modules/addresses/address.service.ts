import type { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { AddressModel, type AddressDoc } from './address.model.js';
import type { CreateAddressBody, UpdateAddressBody } from './address.schema.js';

export interface AddressView {
  id: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  ward: string;
  district: string | null;
  province: string;
  isDefault: boolean;
}

const toView = (a: AddressDoc): AddressView => ({
  id: String(a._id),
  recipientName: a.recipientName,
  recipientPhone: a.recipientPhone,
  addressLine: a.addressLine,
  ward: a.ward,
  district: a.district || null,
  province: a.province,
  isDefault: a.isDefault,
});

/** Mặc định đứng đầu, còn lại mới nhất trước. */
export async function listAddresses(userId: Types.ObjectId): Promise<AddressView[]> {
  const docs = await AddressModel.find({ userId }).sort({ isDefault: -1, _id: -1 }).lean();
  return docs.map(toView);
}

// ponytail: bỏ mặc định cũ rồi ghi mới không trong transaction; index unique chặn trùng nếu đua.
const clearDefault = (userId: Types.ObjectId) =>
  AddressModel.updateMany({ userId, isDefault: true }, { isDefault: false });

export async function createAddress(
  userId: Types.ObjectId,
  body: CreateAddressBody,
): Promise<AddressView> {
  // Địa chỉ đầu tiên luôn là mặc định.
  const isDefault = body.isDefault || !(await AddressModel.exists({ userId }));
  if (isDefault) await clearDefault(userId);
  const doc = await AddressModel.create({ ...body, userId, isDefault });
  return toView(doc);
}

export async function updateAddress(
  userId: Types.ObjectId,
  addressId: Types.ObjectId,
  body: UpdateAddressBody,
): Promise<AddressView> {
  const doc = await AddressModel.findOne({ _id: addressId, userId });
  if (!doc) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy địa chỉ');
  // Không bỏ mặc định trực tiếp được; muốn đổi thì đặt địa chỉ khác làm mặc định.
  if (body.isDefault === false && doc.isDefault) {
    throw new AppError('VALIDATION_ERROR', 400, 'Hãy chọn địa chỉ khác làm mặc định');
  }
  if (body.isDefault && !doc.isDefault) await clearDefault(userId);
  doc.set(body);
  await doc.save();
  return toView(doc);
}

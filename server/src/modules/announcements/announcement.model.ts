import { Schema, model, type Types } from 'mongoose';

/** Một thông báo trên thanh thông báo của website. Nhiều thông báo cùng đang chạy sẽ hiện lần lượt. */
export interface AnnouncementDoc {
  _id: Types.ObjectId;
  text: string;
  /** Rỗng = không có liên kết. */
  linkUrl: string;
  /** DRAFT = chưa đăng; LIVE = đã đăng hoặc hẹn đăng (xem `publishAt`); HIDDEN = tạm ẩn. */
  status: 'DRAFT' | 'LIVE' | 'HIDDEN';
  /** Bắt đầu hiển thị. Lớn hơn hiện tại = đã lên lịch. */
  publishAt?: Date | null;
  /** Hết hiển thị; trống = không giới hạn. */
  endAt?: Date | null;
  displayOrder: number;
  version: number;
  deletedAt?: Date | null;
}

const schema = new Schema<AnnouncementDoc>(
  {
    text: { type: String, required: true },
    linkUrl: { type: String, default: '' },
    status: { type: String, required: true, enum: ['DRAFT', 'LIVE', 'HIDDEN'], default: 'DRAFT' },
    publishAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    displayOrder: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const AnnouncementModel = model<AnnouncementDoc>('announcements', schema);

export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'HIDDEN';

/** Trạng thái hiển thị tính lúc đọc (không cần job tự chuyển). */
export function announcementStatus(
  a: Pick<AnnouncementDoc, 'status' | 'publishAt' | 'endAt'>,
  now = new Date(),
): AnnouncementStatus {
  if (a.status === 'DRAFT') return 'DRAFT';
  if (a.status === 'HIDDEN') return 'HIDDEN';
  if (a.endAt && a.endAt <= now) return 'ENDED';
  if (a.publishAt && a.publishAt > now) return 'SCHEDULED';
  return 'ACTIVE';
}

/** Điều kiện Mongo cho thông báo đang hiển thị cho khách. */
export const liveAnnouncementFilter = (now = new Date()) => ({
  deletedAt: null,
  status: 'LIVE' as const,
  $and: [
    { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
    { $or: [{ endAt: null }, { endAt: { $gt: now } }] },
  ],
});

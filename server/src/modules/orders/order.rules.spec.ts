import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../../lib/shared-enums.js';
import { AppError } from '../../lib/app-error.js';
import {
  allowedNext,
  assertCancellable,
  assertRedeliveryAllowed,
  assertTransition,
  canCancel,
  computeRefundAmount,
  isOverdueConfirmation,
} from './order.rules.js';

const ALL = Object.values(OrderStatus);

describe('order state machine', () => {
  it('chỉ cho phép đúng các bước trong bảng 11.4', () => {
    const expected: Partial<Record<OrderStatus, OrderStatus[]>> = {
      [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PENDING_CONFIRMATION, OrderStatus.CANCELLED],
      [OrderStatus.PENDING_CONFIRMATION]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.HANDED_OVER, OrderStatus.CANCELLED],
      [OrderStatus.HANDED_OVER]: [OrderStatus.SHIPPING],
      [OrderStatus.SHIPPING]: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.DELIVERY_FAILED]: [OrderStatus.SHIPPING, OrderStatus.RETURNING],
      [OrderStatus.RETURNING]: [OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
    };

    for (const from of ALL) {
      expect(allowedNext(from)).toEqual(expected[from] ?? []);
    }
  });

  it('chấp nhận mọi cặp trạng thái hợp lệ và từ chối phần còn lại', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = allowedNext(from).includes(to);
        if (allowed) {
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertTransition(from, to)).toThrowError(AppError);
        }
      }
    }
  });

  it('trả về 409 kèm allowedNext khi sai bước', () => {
    try {
      assertTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED);
      throw new Error('phải ném lỗi');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('ORDER_INVALID_STATE');
      expect(appError.status).toBe(409);
      expect(appError.details).toEqual({
        from: OrderStatus.DELIVERED,
        to: OrderStatus.CANCELLED,
        allowedNext: [],
      });
    }
  });

  it('chỉ hủy được trước khi bàn giao', () => {
    expect(canCancel(OrderStatus.PENDING_PAYMENT)).toBe(true);
    expect(canCancel(OrderStatus.PENDING_CONFIRMATION)).toBe(true);
    expect(canCancel(OrderStatus.CONFIRMED)).toBe(true);
    expect(canCancel(OrderStatus.HANDED_OVER)).toBe(false);
    expect(canCancel(OrderStatus.SHIPPING)).toBe(false);
    expect(canCancel(OrderStatus.DELIVERED)).toBe(false);
    expect(() => assertCancellable(OrderStatus.HANDED_OVER)).toThrowError(AppError);
  });

  it('giới hạn giao lại tối đa 2 lần', () => {
    expect(() => assertRedeliveryAllowed(0)).not.toThrow();
    expect(() => assertRedeliveryAllowed(1)).not.toThrow();
    expect(() => assertRedeliveryAllowed(2)).toThrowError(AppError);
    expect(() => assertRedeliveryAllowed(3)).toThrowError(AppError);
  });

  it('tính hoàn tiền sau khi trừ phí thực tế, không âm', () => {
    expect(computeRefundAmount(10_000_000, 800_000)).toBe(9_200_000);
    expect(computeRefundAmount(500_000, 800_000)).toBe(0);
    expect(computeRefundAmount(0, 0)).toBe(0);
    expect(computeRefundAmount(Number.NaN, 100)).toBe(0);
  });

  it('đánh dấu quá hạn xác nhận sau 20 giờ', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const fresh = new Date('2026-10-31T00:00:00.000Z');
    const stale = new Date('2026-10-30T12:00:00.000Z');

    expect(isOverdueConfirmation(OrderStatus.PENDING_CONFIRMATION, fresh, now)).toBe(false);
    expect(isOverdueConfirmation(OrderStatus.PENDING_CONFIRMATION, stale, now)).toBe(true);
    expect(isOverdueConfirmation(OrderStatus.CONFIRMED, stale, now)).toBe(false);
  });
});

import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { config } from '../src/config/index.js';
import {
  AuthSource,
  ChatMessageType,
  ChatMode,
  ChatSenderType,
  ChatSessionStatus,
  LateCompensationStatus,
  OrderPaymentStatus,
  OrderStatus,
  PaymentCollectionType,
  PaymentMethod,
  RecordSource,
  ReconciliationStatus,
  RefundStatus,
  RoleName,
  ShipmentStatus,
  TransactionType,
  UserStatus,
  WarrantyStatus,
} from '../src/lib/shared-enums.js';
import { logger } from '../src/lib/logger.js';
import { RoleModel, UserModel } from '../src/modules/auth/auth.model.js';
import { CustomerAddressModel } from '../src/modules/customers/customer.model.js';
import { ChatMessageModel, ChatSessionModel } from '../src/modules/chat/chat.model.js';
import { LateCompensationRequestModel } from '../src/modules/orders/late-compensation.model.js';
import { OrderModel, ShipmentModel } from '../src/modules/orders/order.model.js';
import { PaymentTransactionModel } from '../src/modules/payments/payment.model.js';
import { ReturnRequestModel } from '../src/modules/returns/return.model.js';
import { WarrantyCardModel, WarrantyRequestModel } from '../src/modules/warranty/warranty.model.js';

const DAY = 86_400_000;
const oid = (value: number): Types.ObjectId =>
  new Types.ObjectId(`67${value.toString(16).padStart(22, '0')}`);

async function seedOrderAdmin(): Promise<void> {
  const adminPassword = process.env.ORDER_ADMIN_SEED_PASSWORD;
  if (
    !adminPassword ||
    adminPassword.length < 12 ||
    !/[a-z]/.test(adminPassword) ||
    !/[A-Z]/.test(adminPassword) ||
    !/\d/.test(adminPassword)
  ) {
    throw new Error(
      'Đặt ORDER_ADMIN_SEED_PASSWORD có ít nhất 12 ký tự, gồm chữ thường, chữ hoa và chữ số trước khi chạy seed admin.',
    );
  }
  await mongoose.connect(config.MONGODB_URI);

  const roleIds = new Map<RoleName, Types.ObjectId>();
  const descriptions: Record<RoleName, string> = {
    [RoleName.CUSTOMER]: 'Khách hàng',
    [RoleName.SUPER_ADMIN]: 'Quản trị viên cấp cao',
    [RoleName.PRODUCT_ADMIN]: 'Quản trị sản phẩm',
    [RoleName.MARKETING_ADMIN]: 'Quản trị marketing',
    [RoleName.ORDER_ADMIN]: 'Quản trị đơn hàng',
  };
  for (const roleName of Object.values(RoleName)) {
    const role = await RoleModel.findOneAndUpdate(
      { name: roleName },
      { $setOnInsert: { name: roleName, description: descriptions[roleName] } },
      { upsert: true, returnDocument: 'after' },
    );
    roleIds.set(roleName, role._id);
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const adminUsers = new Map<RoleName, Types.ObjectId>();
  for (const [roleName, email, fullName] of [
    [RoleName.SUPER_ADMIN, 'super.admin@caraveso.local', 'Nguyễn Minh Anh'],
    [RoleName.ORDER_ADMIN, 'order.admin@caraveso.local', 'Trần Thu Hà'],
    [RoleName.ORDER_ADMIN, 'order@caraveso.vn', 'Order Admin CaraVeso'],
    [RoleName.PRODUCT_ADMIN, 'product.admin@caraveso.local', 'Lê Minh Khang'],
    [RoleName.MARKETING_ADMIN, 'marketing.admin@caraveso.local', 'Phạm Thảo My'],
  ] as const) {
    const user = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          roleId: roleIds.get(roleName),
          email,
          phoneNumber: null,
          passwordHash,
          authSource: AuthSource.EMAIL,
          profile: { fullName, dateOfBirth: null, birthDateEditCount: 0 },
          avatar: '',
          termsAccepted: true,
          status: UserStatus.ACTIVE,
          security: {
            failedLoginCount: 0,
            lockCount: 0,
            lockedUntil: null,
            mustChangePassword: false,
          },
          lockInfo: { reason: null, lockedBy: null, lockedAt: null },
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    adminUsers.set(roleName, user._id);
  }

  const customers = [];
  for (let index = 0; index < 12; index += 1) {
    const email = `khach.hang.${index + 1}@caraveso.local`;
    const customer = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          roleId: roleIds.get(RoleName.CUSTOMER),
          email,
          phoneNumber: `090${String(1000000 + index).slice(-7)}`,
          authSource: AuthSource.EMAIL,
          profile: {
            fullName:
              ['Nguyễn An', 'Trần Bình', 'Lê Chi', 'Phạm Dũng'][index % 4] + ` ${index + 1}`,
            dateOfBirth: null,
            birthDateEditCount: 0,
          },
          avatar: '',
          termsAccepted: true,
          status: UserStatus.ACTIVE,
          security: {
            failedLoginCount: 0,
            lockCount: 0,
            lockedUntil: null,
            mustChangePassword: false,
          },
          lockInfo: { reason: null, lockedBy: null, lockedAt: null },
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    customers.push(customer);
    await CustomerAddressModel.updateOne(
      { userId: customer._id, isDefault: true },
      {
        $set: {
          recipientName: customer.profile.fullName,
          phone: customer.phoneNumber,
          addressLine: `Số ${index + 10}, đường Nguyễn Trãi`,
          ward: 'Phường Bến Thành',
          district: 'Quận 1',
          province: 'Thành phố Hồ Chí Minh',
          isDefault: true,
        },
        $setOnInsert: { userId: customer._id },
      },
      { upsert: true },
    );
  }

  const statuses = Object.values(OrderStatus);
  const orders = [];
  for (let index = 0; index < 45; index += 1) {
    const customer = customers[index % customers.length]!;
    const status = statuses[index % statuses.length]!;
    const createdAt = new Date(Date.now() - (index + 1) * DAY);
    const deliveredAt =
      status === OrderStatus.DELIVERED ? new Date(createdAt.getTime() + 5 * DAY) : null;
    const orderId = oid(10_000 + index);
    const itemId = oid(20_000 + index);
    const total = 2_500_000 + index * 350_000;
    const paymentStatus =
      status === OrderStatus.CANCELLED
        ? OrderPaymentStatus.REFUNDED
        : status === OrderStatus.PENDING_PAYMENT
          ? OrderPaymentStatus.PENDING
          : status === OrderStatus.PENDING_CONFIRMATION || status === OrderStatus.CONFIRMED
            ? OrderPaymentStatus.UNPAID
            : OrderPaymentStatus.PAID;
    const order = {
      _id: orderId,
      orderCode: `CV-SEED-${String(index + 1).padStart(3, '0')}`,
      userId: customer._id,
      voucherId: null,
      shippingAddress: {
        recipientName: customer.profile.fullName,
        recipientPhone: customer.phoneNumber,
        email: customer.email,
        addressLine: `Số ${index + 10}, đường Nguyễn Trãi`,
        ward: 'Phường Bến Thành',
        district: 'Quận 1',
        province: 'Thành phố Hồ Chí Minh',
      },
      subtotal: total,
      promotionDiscount: 0,
      voucherDiscount: 0,
      shippingFee: 80_000,
      installationFee: 0,
      totalAmount: total + 80_000,
      status,
      note: null,
      items: [
        {
          _id: itemId,
          variantId: oid(30_000 + index),
          snapshot: {
            name: ['Sofa Oslo', 'Bàn ăn Malmo', 'Giường Nordic'][index % 3],
            sku: `100.${String(index + 1).padStart(3, '0')}.01`,
            color: 'Màu gỗ tự nhiên',
            material: 'Gỗ sồi',
            dimensions: '180 × 90 × 75 cm',
            imageUrl: null,
          },
          quantity: 1,
          unitPrice: total,
          promotionDiscount: 0,
          voucherDiscountShare: 0,
          finalAmount: total,
          shippingTier: 2,
          shippingFee: 80_000,
          hasInstallation: false,
          installationFee: 0,
          warrantyMonths: 24,
        },
      ],
      statusHistory: [
        {
          fromStatus: null,
          toStatus: status,
          note: 'Đơn hàng dữ liệu mẫu',
          changedBy: null,
          changedAt: createdAt,
        },
      ],
      payment: {
        method: index % 2 ? PaymentMethod.BANK_TRANSFER : PaymentMethod.COD,
        collectionType: PaymentCollectionType.FULL,
        status: paymentStatus,
        depositAmount: null,
        codAmount: paymentStatus === OrderPaymentStatus.UNPAID ? total + 80_000 : 0,
        dueAt: null,
        transferContent: null,
        lastTransactionCode: null,
        receiptImage: null,
        paidAt: paymentStatus === OrderPaymentStatus.PAID ? createdAt : null,
      },
      cancellation:
        status === OrderStatus.CANCELLED
          ? {
              reason: 'CUSTOMER_REQUEST',
              note: 'Dữ liệu mẫu',
              cancelledBy: 'ADMIN',
              cancelledByUserId: adminUsers.get(RoleName.ORDER_ADMIN),
              cancelledAt: createdAt,
            }
          : null,
      createdAt,
      updatedAt: deliveredAt ?? createdAt,
    };
    await OrderModel.replaceOne({ _id: orderId }, order, { upsert: true });
    const shipmentStatus =
      status === OrderStatus.DELIVERED
        ? ShipmentStatus.DELIVERED
        : status === OrderStatus.SHIPPING
          ? ShipmentStatus.SHIPPING
          : status === OrderStatus.DELIVERY_FAILED
            ? ShipmentStatus.DELIVERY_FAILED
            : status === OrderStatus.RETURNING
              ? ShipmentStatus.RETURNING
              : status === OrderStatus.HANDED_OVER
                ? ShipmentStatus.HANDED_OVER
                : ShipmentStatus.PENDING;
    await ShipmentModel.updateOne(
      { orderId },
      {
        $set: {
          status: shipmentStatus,
          carrier: index % 2 ? 'Viettel Post' : null,
          trackingCode: index % 2 ? `CVTRACK${index + 1}` : null,
          assignedTeam: index % 2 ? null : 'Đội xe CaraVeso 01',
          estimatedDeliveryDate: new Date(createdAt.getTime() + 3 * DAY),
          actualDeliveryDate: deliveredAt,
          redeliveryCount: index % 3,
          failureReason: status === OrderStatus.DELIVERY_FAILED ? 'Khách hẹn giao lại' : null,
        },
        $setOnInsert: { orderId },
      },
      { upsert: true },
    );
    orders.push({ order, itemId, customer });
  }

  const deliveredOrders = orders.filter(({ order }) => order.status === OrderStatus.DELIVERED);
  for (let index = 0; index < 5; index += 1) {
    const { order, itemId, customer } = deliveredOrders[index]!;
    const createdAt = new Date(order.createdAt);
    const returnId = oid(40_000 + index);
    await ReturnRequestModel.replaceOne(
      { _id: returnId },
      {
        _id: returnId,
        code: `RT-SEED-${String(index + 1).padStart(3, '0')}`,
        orderId: order._id,
        orderItemId: itemId,
        userId: customer._id,
        type: index % 2 ? 'EXCHANGE' : 'RETURN',
        quantity: 1,
        reason: 'Sản phẩm cần được kiểm tra thêm',
        description: null,
        evidence: [],
        status: Object.values([
          'PENDING',
          'CONFIRMED',
          'AWAITING_GOODS',
          'PROCESSING',
          'COMPLETED',
          'REJECTED',
        ])[index]!,
        rejectReason: index === 5 ? 'Ngoài thời hạn hỗ trợ' : null,
        inspectionResult: null,
        resolution: null,
        costBearer: 'CARAVESO',
        returnShippingFee: 80_000,
        disassemblyFee: 0,
        originalShippingRefund: 0,
        refundAmount: index === 4 ? 1_500_000 : null,
        pickupSchedule: null,
        customerShipment: { carrier: null, trackingCode: null },
        returnShipment: { carrier: null, trackingCode: null },
        replacement:
          index === 3
            ? {
                productName: 'Ghế bành Luna thay thế',
                sku: '100.099.01',
                unitPrice: 3_000_000,
                quantity: 1,
                variantId: oid(90_000 + index),
                trackingCode: 'CV-RETURN-TRACK-04',
                deliveredAt: null,
              }
            : {
                productName: null,
                sku: null,
                unitPrice: null,
                quantity: null,
                variantId: null,
                trackingCode: null,
                deliveredAt: null,
              },
        refund: { proofImage: null, transactionAt: null, completed: index === 4 },
        requestedAt: createdAt,
        approvedAt: index ? createdAt : null,
        completedAt: index === 4 ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      },
      { upsert: true },
    );
  }

  for (let index = 0; index < 5; index += 1) {
    const { order, itemId, customer } = deliveredOrders[index]!;
    const requestedAt = new Date(order.createdAt);
    const cardId = oid(50_000 + index);
    const requestId = oid(51_000 + index);
    const warrantyMonths = 24;
    await WarrantyCardModel.updateOne(
      { _id: cardId },
      {
        $set: {
          orderId: order._id,
          orderItemId: itemId,
          userId: customer._id,
          startsAt: new Date(requestedAt.getTime() - 150 * DAY),
          expiresAt: new Date(requestedAt.getTime() + 500 * DAY),
          warrantyMonths,
        },
      },
      { upsert: true },
    );
    const warrantyStatus = Object.values(WarrantyStatus)[index]!;
    await WarrantyRequestModel.replaceOne(
      { _id: requestId },
      {
        _id: requestId,
        code: `BH-SEED-${String(index + 1).padStart(3, '0')}`,
        warrantyCardId: cardId,
        orderId: order._id,
        orderItemId: itemId,
        userId: customer._id,
        defectDescription: 'Khách hàng đề nghị kiểm tra sản phẩm',
        condition: 'Sản phẩm đã qua sử dụng bình thường',
        evidence: [],
        status: warrantyStatus,
        rejectReason: null,
        inspectionResult: null,
        resolution: null,
        homeServiceSchedule: null,
        customerShipment: { carrier: null, trackingCode: null },
        returnShipment: { carrier: null, trackingCode: null },
        history: [{ at: requestedAt, status: warrantyStatus, note: 'Dữ liệu mẫu' }],
        requestedAt,
        approvedAt: null,
        completedAt: null,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      },
      { upsert: true },
    );
  }

  for (let index = 0; index < 4; index += 1) {
    const { order } = orders[index * 3 + 1]!;
    const transactionId = oid(60_000 + index);
    await PaymentTransactionModel.replaceOne(
      { _id: transactionId },
      {
        _id: transactionId,
        orderId: order._id,
        returnRequestId: null,
        type: TransactionType.FULL_PAYMENT,
        amount: 1_000_000 + index * 100_000,
        recordSource: RecordSource.AUTO,
        bankTransactionCode: `BANK-SEED-${index + 1}`,
        receivedContent: `NOI DUNG TEST ${index + 1}`,
        reconciliationStatus: [
          ReconciliationStatus.WRONG_CONTENT,
          ReconciliationStatus.UNDERPAID,
          ReconciliationStatus.OVERPAID,
          ReconciliationStatus.LATE,
        ][index],
        status: RefundStatus.COMPLETED,
        note: null,
        handledById: null,
        handledByName: null,
        transactionAt: new Date(order.createdAt),
        refundAccount: null,
      },
      { upsert: true },
    );
  }

  for (let index = 0; index < 2; index += 1) {
    const { order, customer } = deliveredOrders[index]!;
    const estimate = new Date(order.createdAt.getTime() + 2 * DAY);
    const actual = new Date(estimate.getTime() + 4 * DAY);
    await LateCompensationRequestModel.updateOne(
      { orderId: order._id },
      {
        $set: {
          userId: customer._id,
          daysLate: 4,
          estimatedDeliveryDate: estimate,
          actualDeliveryDate: actual,
          voucherValue: 100_000,
          status: LateCompensationStatus.PENDING,
          requestedAt: actual,
        },
        $setOnInsert: { orderId: order._id },
      },
      { upsert: true },
    );
  }

  for (let index = 0; index < 10; index += 1) {
    const customer = customers[index % customers.length]!;
    const agentId = adminUsers.get(RoleName.ORDER_ADMIN)!;
    const sessionId = oid(70_000 + index);
    const status =
      index % 3 === 0
        ? ChatSessionStatus.WAITING
        : index % 3 === 1
          ? ChatSessionStatus.IN_PROGRESS
          : ChatSessionStatus.CLOSED;
    const sentAt = new Date(Date.now() - index * 2 * 60 * 60 * 1000);
    await ChatSessionModel.updateOne(
      { _id: sessionId },
      {
        $set: {
          customerId: customer._id,
          agentId: status === ChatSessionStatus.WAITING ? null : agentId,
          mode: ChatMode.SUPPORT,
          status,
          startedAt: sentAt,
          endedAt: status === ChatSessionStatus.CLOSED ? sentAt : null,
          lastMessageAt: sentAt,
          handoffAt: sentAt,
          lastMessagePreview: 'Tôi muốn hỏi về tình trạng đơn hàng.',
          customerUnread: 0,
          agentUnread: status === ChatSessionStatus.WAITING ? 1 : 0,
        },
      },
      { upsert: true },
    );
    await ChatMessageModel.updateOne(
      { sessionId, content: 'Tôi muốn hỏi về tình trạng đơn hàng.' },
      {
        $setOnInsert: {
          senderId: customer._id,
          senderType: ChatSenderType.CUSTOMER,
          content: 'Tôi muốn hỏi về tình trạng đơn hàng.',
          messageType: ChatMessageType.TEXT,
          metadata: null,
          isRead: false,
          sentAt,
        },
      },
      { upsert: true },
    );
  }

  logger.info('Đã nạp dữ liệu mẫu Order Admin (có thể chạy lại an toàn)');
}

seedOrderAdmin()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Seed Order Admin thất bại');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

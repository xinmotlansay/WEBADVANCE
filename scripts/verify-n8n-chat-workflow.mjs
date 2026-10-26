/**
 * Chạy thử các Code node của workflow n8n bằng Node thuần (không cần n8n):
 * node scripts/verify-n8n-chat-workflow.mjs
 */
import assert from 'node:assert/strict';
import { codeNodes } from './build-n8n-chat-workflow.mjs';

function run(code, { json = {}, env = {}, nodes = {} }) {
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Node không tồn tại trong mock: ${name}`);
    return { first: () => ({ json: nodes[name] }) };
  };
  const fn = new Function('$json', '$env', '$', 'console', code);
  return fn(json, env, $, console);
}

const products = [
  {
    name: 'Sofa da Milan',
    description: 'Sofa da bò 3 chỗ, khung gỗ sồi, phù hợp phòng khách 20m2',
    category: ['Ghế'],
    room: ['Phòng khách'],
    priceFrom: 32000000,
    priceTo: 32000000,
    colors: ['Nâu bò', 'Đen'],
    material: 'Da bò',
    dimensions: '220x95x80cm',
    warrantyMonths: 24,
    stockStatus: 'Còn hàng',
    variants: [
      { color: 'Nâu bò', dimensions: '220x95x80cm', price: 32000000, stockQuantity: 24 },
      { color: 'Đen', dimensions: '220x95x80cm', price: 32000000, stockQuantity: 25 },
    ],
  },
  {
    name: 'Giường Kyoto',
    description: 'Giường gỗ sồi tự nhiên cho phòng ngủ',
    category: ['Giường'],
    room: ['Phòng ngủ'],
    priceFrom: 16900000,
    priceTo: 16900000,
    colors: ['Gỗ sồi'],
    material: 'Gỗ sồi',
    dimensions: '180x200x100cm',
    warrantyMonths: 24,
    stockStatus: 'Còn hàng',
    variants: [
      { color: 'Gỗ sồi', dimensions: '180x200x100cm', price: 16900000, stockQuantity: 25 },
    ],
  },
  {
    name: 'Bàn trà Walnut',
    description: 'Bàn trà mặt gỗ óc chó cho phòng khách',
    category: ['Bàn'],
    room: ['Phòng khách'],
    priceFrom: 5200000,
    priceTo: 5200000,
    colors: ['Óc chó'],
    material: 'Gỗ óc chó',
    dimensions: '110x60x40cm',
    warrantyMonths: 24,
    stockStatus: 'Còn hàng',
    variants: [{ color: 'Óc chó', dimensions: '110x60x40cm', price: 5200000, stockQuantity: 25 }],
  },
];

const context = {
  products,
  policies: {
    warranty: 'Bảo hành 24 tháng.',
    return: 'Đổi trả trong 7 ngày.',
    shipping: 'Phí ship hiển thị ở bước thanh toán.',
    payment: 'COD hoặc QR.',
    voucher: 'Mỗi đơn 1 voucher.',
    workingHours: '8:00-17:30 thứ 2 đến thứ 7.',
  },
  showrooms: [
    {
      name: 'CaraVeso Design Center',
      city: 'TP. Hồ Chí Minh',
      address: '101 Tôn Dật Tiên, Quận 7',
      phone: '1900 080906',
      openTime: '09:00',
      closeTime: '21:00',
    },
  ],
  collections: [
    {
      name: 'ODA',
      slogan: 'Đa dạng lựa chọn',
      description: 'Bộ sưu tập phòng khách',
      productNames: ['Sofa da Milan'],
    },
  ],
};

// 1. Xác thực header
{
  const ok = run(codeNodes.verifySecret, {
    json: { headers: { 'X-Webhook-Secret': 'abc123' }, body: { sessionId: 's1' } },
    env: { CARAVESO_WEBHOOK_SECRET: 'abc123' },
  });
  assert.equal(ok[0].json.authorized, true, 'header hoa/thường phải khớp');
  assert.equal(ok[0].json.sessionId, 's1');

  const wrong = run(codeNodes.verifySecret, {
    json: { headers: { 'x-webhook-secret': 'abc124' }, body: {} },
    env: { CARAVESO_WEBHOOK_SECRET: 'abc123' },
  });
  assert.equal(wrong[0].json.authorized, false, 'sai secret phải bị từ chối');

  const missing = run(codeNodes.verifySecret, {
    json: { headers: {}, body: {} },
    env: { CARAVESO_WEBHOOK_SECRET: 'abc123' },
  });
  assert.equal(missing[0].json.authorized, false);

  const notConfigured = run(codeNodes.verifySecret, {
    json: { headers: { 'x-webhook-secret': '' }, body: {} },
    env: {},
  });
  assert.equal(notConfigured[0].json.authorized, false, 'chưa cấu hình secret phải từ chối');
}

// 2. Chuẩn hoá input + chọn sản phẩm theo câu hỏi
{
  const body = {
    sessionId: 'public',
    message: 'Sofa da phù hợp phòng khách 20m2?',
    history: [
      { role: 'user', content: 'Chào em' },
      { role: 'assistant', content: 'Dạ em chào anh/chị' },
      { role: 'system', content: 'bỏ qua' },
    ],
    customer: { id: 'guest', fullName: 'Khách' },
    context,
  };
  const out = run(codeNodes.normalize, {
    json: {},
    nodes: { '01 - Webhook CaraVeso Chat': { body } },
  })[0].json;

  assert.equal(out.message, body.message);
  assert.equal(out.shouldCallModel, true);
  assert.deepEqual(
    out.contents.map((item) => item.role),
    ['user', 'model', 'user'],
    'history phải bỏ role lạ và nối message hiện tại',
  );
  assert.equal(
    out.productNames[0],
    'Sofa da Milan',
    'câu hỏi sofa phải xếp Sofa da Milan đầu tiên',
  );
  assert.ok(out.systemPrompt.includes('Sofa da Milan'));
  assert.ok(out.systemPrompt.includes('CaraVeso Design Center'));
  assert.ok(out.systemPrompt.includes('ODA'));
  assert.ok(out.systemPrompt.includes('Bảo hành 24 tháng.'));
  assert.ok(!out.systemPrompt.includes('undefined'));

  const bedroom = run(codeNodes.normalize, {
    json: {},
    nodes: {
      '01 - Webhook CaraVeso Chat': {
        body: { ...body, message: 'Giường gỗ cho phòng ngủ?' },
      },
    },
  })[0].json;
  assert.equal(bedroom.productNames[0], 'Giường Kyoto');

  const empty = run(codeNodes.normalize, {
    json: {},
    nodes: { '01 - Webhook CaraVeso Chat': { body: { ...body, message: '   ' } } },
  })[0].json;
  assert.equal(empty.shouldCallModel, false, 'message rỗng không được gọi model');
  assert.ok(empty.emptyReply.length > 0);

  const offTopic = run(codeNodes.normalize, {
    json: {},
    nodes: {
      '01 - Webhook CaraVeso Chat': {
        body: { ...body, message: 'Bạn nghĩ gì về bầu cử tổng thống Mỹ?' },
      },
    },
  })[0].json;
  assert.deepEqual(
    offTopic.productNames,
    [],
    'câu hỏi ngoài phạm vi không được kéo sản phẩm vào prompt',
  );
  assert.ok(offTopic.systemPrompt.includes('Không có sản phẩm nào khớp'));

  const showroomQuestion = run(codeNodes.normalize, {
    json: {},
    nodes: {
      '01 - Webhook CaraVeso Chat': {
        body: { ...body, message: 'Cửa hàng ở Đà Nẵng mở cửa mấy giờ?' },
      },
    },
  })[0].json;
  assert.ok(
    showroomQuestion.systemPrompt.includes('CaraVeso Design Center'),
    'câu hỏi cửa hàng phải có dữ liệu showroom',
  );

  const junk = run(codeNodes.normalize, {
    json: {},
    nodes: { '01 - Webhook CaraVeso Chat': { body: {} } },
  })[0].json;
  assert.equal(junk.shouldCallModel, false);
  assert.equal(junk.sessionId, 'public');
}

// 3. Parse câu trả lời của model
{
  const source = {
    sessionId: 'public',
    message: 'Sofa da?',
    productNames: ['Sofa da Milan', 'Giường Kyoto'],
  };

  const good = run(codeNodes.parseReply, {
    json: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"reply":"Dạ, Sofa da Milan phù hợp ạ.","handoff":false,"suggestedProducts":["Sofa da Milan","Không tồn tại"]}',
              },
            ],
          },
        },
      ],
    },
    nodes: { '04 - Normalize Input': source },
  })[0].json;
  assert.equal(good.reply, 'Dạ, Sofa da Milan phù hợp ạ.');
  assert.deepEqual(
    good.suggestedProducts,
    ['Sofa da Milan'],
    'phải lọc tên không có trong catalog',
  );
  assert.equal(good.error, null);

  const fenced = run(codeNodes.parseReply, {
    json: {
      candidates: [
        {
          content: {
            parts: [
              { text: '```json\n{"reply":"Nội dung","handoff":true,"suggestedProducts":[]}\n```' },
            ],
          },
        },
      ],
    },
    nodes: { '04 - Normalize Input': source },
  })[0].json;
  assert.equal(fenced.reply, 'Nội dung');
  assert.equal(fenced.handoff, true);

  const broken = run(codeNodes.parseReply, {
    json: { candidates: [{ content: { parts: [{ text: 'Dạ em không trả JSON' }] } }] },
    nodes: { '04 - Normalize Input': source },
  })[0].json;
  assert.ok(broken.reply.length > 0, 'model trả text thường vẫn phải có câu trả lời');
  assert.equal(broken.error, 'MODEL_JSON_PARSE_FAILED');

  const failed = run(codeNodes.parseReply, {
    json: { error: { message: 'quota' }, statusCode: 429 },
    nodes: { '04 - Normalize Input': source },
  })[0].json;
  assert.equal(failed.error, 'LLM_REQUEST_FAILED');
  assert.ok(failed.reply.length > 0);

  const handoffByText = run(codeNodes.parseReply, {
    json: {
      candidates: [
        {
          content: {
            parts: [
              { text: '{"reply":"Em chuyển nhân viên ạ.","handoff":false,"suggestedProducts":[]}' },
            ],
          },
        },
      ],
    },
    nodes: { '04 - Normalize Input': { ...source, message: 'Cho tôi gặp nhân viên' } },
  })[0].json;
  assert.equal(handoffByText.handoff, true, 'khách đòi gặp nhân viên phải handoff');
}

console.log('OK: 3 Code node của workflow n8n đều chạy đúng.');

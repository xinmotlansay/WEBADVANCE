import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChatAnswer, type GeminiChatContext } from './gemini.js';

vi.mock('../config/index.js', () => ({
  config: {
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_CHAT_MODEL: 'gemini-test',
    GEMINI_CHAT_FALLBACK_MODEL: 'gemini-test-fallback',
    CHAT_AI_TIMEOUT_MS: 40,
  },
}));

const context: GeminiChatContext = {
  products: [],
  policies: {},
  showrooms: [],
  collections: [],
};

function toolCallResponse() {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'load_catalog', args: { query: 'Tư vấn sofa' } } }],
          },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function jsonAnswer(reply = 'Xin chào! Em có thể giúp gì?', productSlugs: string[] = []) {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ reply, productSlugs }) }] } },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function rawTextResponse(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('generateChatAnswer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let requests: Array<{ url: string; body: Record<string, unknown> }>;

  beforeEach(() => {
    requests = [];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return requests.length % 2 === 1 ? toolCallResponse() : jsonAnswer();
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls Gemini before loading the catalog, then sends the data back for the final answer', async () => {
    const steps: string[] = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      steps.push('gemini');
      return requests.length === 1 ? toolCallResponse() : jsonAnswer('Có mẫu sofa phù hợp.');
    });

    const reply = await generateChatAnswer({
      message: 'Tư vấn sofa',
      history: [
        { role: 'user', content: 'Chào bạn' },
        { role: 'assistant', content: 'Em có thể giúp gì?' },
      ],
      loadContext: async (query) => {
        expect(steps).toEqual(['gemini']);
        expect(query).toBe('Tư vấn sofa');
        steps.push('catalog');
        return context;
      },
    });

    expect(reply).toEqual({
      text: 'Có mẫu sofa phù hợp.',
      model: 'gemini-test',
      productSlugs: [],
    });
    expect(steps).toEqual(['gemini', 'catalog', 'gemini']);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-goog-api-key')).toBe(
      'test-gemini-key',
    );
    expect(requests[0].body).toMatchObject({
      contents: [
        { role: 'user', parts: [{ text: 'Chào bạn' }] },
        { role: 'model', parts: [{ text: 'Em có thể giúp gì?' }] },
        { role: 'user', parts: [{ text: 'Tư vấn sofa' }] },
      ],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    });
    expect(JSON.stringify(requests[0].body)).not.toContain('"products"');
    expect(requests[1].body).toMatchObject({
      contents: [
        {},
        {},
        { role: 'user', parts: [{ text: 'Tư vấn sofa' }] },
        { role: 'model', parts: [{ functionCall: { name: 'load_catalog' } }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'load_catalog',
                response: { result: context },
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            reply: { type: 'STRING' },
            productSlugs: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['reply', 'productSlugs'],
        },
      },
    });
  });

  it('returns the product slugs chosen by the model, deduplicated and capped at four', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return requests.length === 1
        ? toolCallResponse()
        : jsonAnswer('Gợi ý cho anh/chị.', [
            'sofa-oslo',
            'sofa-oslo',
            'ghe-milano',
            'ban-an',
            'tu-ao',
            'giuong-queen',
          ]);
    });

    const answer = await generateChatAnswer({
      message: 'Tư vấn sofa',
      history: [],
      loadContext: async () => context,
    });

    expect(answer.productSlugs).toEqual(['sofa-oslo', 'ghe-milano', 'ban-an', 'tu-ao']);
  });

  it('keeps the reply text and drops product slugs when the model returns malformed JSON', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return requests.length === 1 ? toolCallResponse() : rawTextResponse('Xin chào!');
    });

    const answer = await generateChatAnswer({
      message: 'Chào',
      history: [],
      loadContext: async () => context,
    });

    expect(answer).toEqual({ text: 'Xin chào!', model: 'gemini-test', productSlugs: [] });
  });

  it('surfaces provider failures as a service-unavailable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    );

    await expect(
      generateChatAnswer({
        message: 'Tư vấn sofa',
        history: [],
        loadContext: async () => context,
      }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', status: 503 });
  });

  it('retries with the fallback model when the primary model is overloaded', async () => {
    const fallbackFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(toolCallResponse())
      .mockResolvedValueOnce(jsonAnswer('Có mẫu phù hợp.'));
    vi.stubGlobal('fetch', fallbackFetch);

    const answer = await generateChatAnswer({
      message: 'Tư vấn sofa',
      history: [],
      loadContext: async () => context,
    });

    expect(answer).toEqual({
      text: 'Có mẫu phù hợp.',
      model: 'gemini-test-fallback',
      productSlugs: [],
    });
    expect(fallbackFetch).toHaveBeenCalledTimes(3);
    expect(String(fallbackFetch.mock.calls[1][0])).toContain('gemini-test-fallback');
  });

  it('retries with the fallback model when the primary model times out', async () => {
    const fallbackFetch = vi
      .fn()
      .mockImplementationOnce(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      )
      .mockResolvedValueOnce(toolCallResponse())
      .mockResolvedValueOnce(jsonAnswer('Có mẫu phù hợp.'));
    vi.stubGlobal('fetch', fallbackFetch);

    await expect(
      generateChatAnswer({
        message: 'Tư vấn sofa',
        history: [],
        loadContext: async () => context,
      }),
    ).resolves.toEqual({
      text: 'Có mẫu phù hợp.',
      model: 'gemini-test-fallback',
      productSlugs: [],
    });
    expect(fallbackFetch).toHaveBeenCalledTimes(3);
  });

  it('retries the final answer with the fallback model when the primary model times out', async () => {
    const fallbackFetch = vi
      .fn()
      .mockResolvedValueOnce(toolCallResponse())
      .mockImplementationOnce(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      )
      .mockResolvedValueOnce(toolCallResponse())
      .mockResolvedValueOnce(jsonAnswer('Đây là câu trả lời từ model dự phòng.'));
    vi.stubGlobal('fetch', fallbackFetch);

    await expect(
      generateChatAnswer({
        message: 'Tư vấn sofa',
        history: [],
        loadContext: async () => context,
      }),
    ).resolves.toEqual({
      text: 'Đây là câu trả lời từ model dự phòng.',
      model: 'gemini-test-fallback',
      productSlugs: [],
    });
    expect(fallbackFetch).toHaveBeenCalledTimes(4);
    expect(String(fallbackFetch.mock.calls[2][0])).toContain('gemini-test-fallback');
  });
});

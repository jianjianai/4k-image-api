import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectOpenAIError } from "../helpers/openai-error.ts";
import {
  startViteTestServer,
  type TestViteServer,
} from "../helpers/vite-server.ts";

describe("OpenAI image routes", () => {
  let server: TestViteServer;

  beforeAll(async () => {
    server = await startViteTestServer({
      NITRO_API_KEYS: "",
      NITRO_IMAGE_CONFIG_FILE: "",
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns OpenAI JSON errors for invalid JSON", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://example.test",
      },
      body: "{",
    });

    await expectOpenAIError(response, {
      status: 400,
      code: "invalid_json",
      param: null,
      messageIncludes: "valid JSON",
    });
  });

  it("returns OpenAI JSON errors for missing providers", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://example.test",
      },
      body: JSON.stringify({
        model: "missing-image-model",
        prompt: "generate a small image",
      }),
    });

    await expectOpenAIError(response, {
      status: 404,
      code: "model_not_found",
      param: "model",
      messageIncludes: "missing-image-model",
    });
  });

  it("returns readable OpenAI JSON errors for responses image model failures", async () => {
    const response = await server.fetch("/v1/responses", {
      method: "POST",
      headers: {
        accept: "*/*",
        authorization: "Bearer test",
        "cache-control": "no-cache",
        "content-type": "application/json",
        origin: "http://example.test",
        pragma: "no-cache",
      },
      body: JSON.stringify({
        model: "missing-responses-image-model",
        input:
          "Use the following text as the complete prompt. Do not rewrite it:\n生成一张小猫的图片",
        tools: [
          {
            type: "image_generation",
            action: "generate",
            size: "2480x3328",
            output_format: "png",
            moderation: "auto",
            quality: "auto",
          },
        ],
        tool_choice: "required",
      }),
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://example.test",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");

    await expectOpenAIError(response, {
      status: 404,
      code: "model_not_found",
      param: "model",
      messageIncludes: "missing-responses-image-model",
    });
  });

  it("returns images streaming responses immediately in SSE format", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://example.test",
      },
      body: JSON.stringify({
        model: "test-image",
        prompt: "cat",
        stream: true,
      }),
    });
    const events = parseSSE(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://example.test",
    );
    expect(events[0]).toEqual({ comment: "stream-open" });
    expect(events).toContainEqual({ data: "[DONE]" });
    expect(events).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "image_generation.completed",
          b64_json: expect.any(String),
        }),
      }),
    );
  });

  it("returns responses streaming responses in SSE format", async () => {
    const response = await server.fetch("/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://example.test",
      },
      body: JSON.stringify({
        model: "test-image",
        input: "cat",
        stream: true,
        tools: [
          {
            type: "image_generation",
            model: "test-image",
          },
        ],
        tool_choice: "required",
      }),
    });
    const events = parseSSE(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "response.completed",
        data: expect.objectContaining({
          type: "response.completed",
          response: expect.objectContaining({
            status: "completed",
            output: expect.arrayContaining([
              expect.objectContaining({
                type: "image_generation_call",
                status: "completed",
                result: expect.any(String),
              }),
            ]),
          }),
        }),
      }),
    );
    expect(events).toContainEqual({ data: "[DONE]" });
  });

  it("returns OpenAI JSON errors for unknown endpoints", async () => {
    const response = await server.fetch("/v1/nope", {
      method: "POST",
      headers: {
        origin: "http://example.test",
      },
    });

    await expectOpenAIError(response, {
      status: 404,
      code: "invalid_request",
      param: null,
      messageIncludes: "endpoint not found",
    });
  });

  it("returns OpenAI JSON errors for unsupported methods", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "GET",
      headers: {
        origin: "http://example.test",
      },
    });

    await expectOpenAIError(response, {
      status: 404,
      code: "invalid_request",
      param: null,
      messageIncludes: "endpoint not found",
    });
  });

  it("keeps CORS preflight responses empty and successful", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "OPTIONS",
      headers: {
        origin: "http://example.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-methods")).toMatch(
      /(^\*$)|POST/,
    );
  });

  it("returns registered image models", async () => {
    const response = await server.fetch("/v1/models", {
      method: "GET",
      headers: {
        origin: "http://example.test",
      },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://example.test",
    );
    expect(payload.object).toBe("list");
    expect(payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "test-image",
          object: "model",
          actions: ["generate", "edit", "variation"],
          providerTypes: ["test"],
        }),
        expect.objectContaining({
          id: "gpt-image-1",
          object: "model",
        }),
      ]),
    );
  });
});

const parseSSE = (text: string): Array<Record<string, unknown>> =>
  text
    .trim()
    .split(/\n\n/)
    .filter(Boolean)
    .map((chunk) => {
      const event: Record<string, unknown> = {};
      const data: string[] = [];

      for (const line of chunk.split("\n")) {
        if (line.startsWith(":")) {
          event.comment = line.slice(1).trim();
          continue;
        }

        if (line.startsWith("event:")) {
          event.event = line.slice("event:".length).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          data.push(line.slice("data:".length).trim());
        }
      }

      if (data.length > 0) {
        const payload = data.join("\n");
        event.data = payload === "[DONE]" ? payload : JSON.parse(payload);
      }

      return event;
    });

describe("OpenAI image route API key protection", () => {
  let server: TestViteServer;

  beforeAll(async () => {
    server = await startViteTestServer({
      NITRO_API_KEYS: "client-key",
      NITRO_IMAGE_CONFIG_FILE: "",
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("rejects requests without a configured API key", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://example.test",
      },
      body: JSON.stringify({
        model: "test-image",
        prompt: "cat",
      }),
    });

    await expectOpenAIError(response, {
      status: 401,
      code: "invalid_api_key",
      param: null,
      messageIncludes: "API key",
    });
  });

  it("allows requests with a configured bearer API key", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: "Bearer client-key",
        "content-type": "application/json",
        origin: "http://example.test",
      },
      body: JSON.stringify({
        model: "missing-image-model",
        prompt: "cat",
      }),
    });

    await expectOpenAIError(response, {
      status: 404,
      code: "model_not_found",
      param: "model",
      messageIncludes: "missing-image-model",
    });
  });

  it("keeps CORS preflight unauthenticated", async () => {
    const response = await server.fetch("/v1/images/generations", {
      method: "OPTIONS",
      headers: {
        origin: "http://example.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("protects model listing with configured API keys", async () => {
    const response = await server.fetch("/v1/models", {
      method: "GET",
      headers: {
        origin: "http://example.test",
      },
    });

    await expectOpenAIError(response, {
      status: 401,
      code: "invalid_api_key",
      param: null,
      messageIncludes: "API key",
    });
  });
});

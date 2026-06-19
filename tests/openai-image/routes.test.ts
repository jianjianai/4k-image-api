import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectOpenAIError } from "../helpers/openai-error.ts";
import {
  startViteTestServer,
  type TestViteServer,
} from "../helpers/vite-server.ts";

describe("OpenAI image routes", () => {
  let server: TestViteServer;

  beforeAll(async () => {
    server = await startViteTestServer();
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
});

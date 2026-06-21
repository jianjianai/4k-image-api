import { describe, expect, it, vi } from "vitest";

describe("assertOpenAIAPIKey", () => {
  it("does nothing when no API keys are configured", async () => {
    const { assertOpenAIAPIKey } = await loadAuth("");

    expect(() => assertOpenAIAPIKey(request())).not.toThrow();
  });

  it("accepts bearer tokens from configured API keys", async () => {
    const { assertOpenAIAPIKey } = await loadAuth("key-a,key-b");

    expect(() =>
      assertOpenAIAPIKey(
        request({
          authorization: "Bearer key-b",
        }),
      ),
    ).not.toThrow();
  });

  it("accepts x-api-key from configured API keys", async () => {
    const { assertOpenAIAPIKey } = await loadAuth("key-a");

    expect(() =>
      assertOpenAIAPIKey(
        request({
          "x-api-key": "key-a",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects missing or invalid API keys when keys are configured", async () => {
    const { assertOpenAIAPIKey } = await loadAuth("key-a");

    expect(() => assertOpenAIAPIKey(request())).toThrow("Invalid or missing API key");
    expect(() =>
      assertOpenAIAPIKey(
        request({
          authorization: "Bearer wrong",
        }),
      ),
    ).toThrow("Invalid or missing API key");
  });
});

const loadAuth = async (apiKeys: string) => {
  vi.resetModules();
  vi.doMock("nitro/runtime-config", () => ({
    useRuntimeConfig: () => ({
      apiKeys,
    }),
  }));

  return import("../../server/utils/openai-image/auth.ts");
};

const request = (headers: HeadersInit = {}) =>
  new Request("http://example.test/v1/images/generations", {
    headers,
  });

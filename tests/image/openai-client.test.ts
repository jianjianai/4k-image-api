import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAIClient } from "../../server/utils/image/providers/openai-client.ts";
import type { OpenAIImagesProviderConfig } from "../../server/utils/image/provider-config.ts";

describe("createOpenAIClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a safe default user agent for compatible image gateways", async () => {
    const userAgent = await captureImagesGenerateUserAgent({
      id: "test",
      type: "openai-images",
      apiKey: "test-key",
      baseURL: "https://example.test/v1",
      models: ["gpt-image-2"],
    } satisfies OpenAIImagesProviderConfig);

    expect(userAgent).toBe("4k-image-api");
  });

  it("uses a provider-specific user agent when configured", async () => {
    const userAgent = await captureImagesGenerateUserAgent({
      id: "test",
      type: "openai-images",
      apiKey: "test-key",
      baseURL: "https://example.test/v1",
      models: ["gpt-image-2"],
      userAgent: "custom-image-client",
    } satisfies OpenAIImagesProviderConfig);

    expect(userAgent).toBe("custom-image-client");
  });
});

const captureImagesGenerateUserAgent = async (
  config: OpenAIImagesProviderConfig,
): Promise<string> => {
  let userAgent = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      userAgent = new Headers(init?.headers).get("user-agent") ?? "";

      return new Response(
        JSON.stringify({
          created: 0,
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );

  const client = createOpenAIClient(config);

  await client.images.generate({
    model: "gpt-image-2",
    prompt: "draw a red square",
  });

  return userAgent;
};

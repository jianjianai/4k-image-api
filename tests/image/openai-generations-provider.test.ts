import { describe, expect, it, vi } from "vitest";
import { createOpenAIImageGenerationProvider } from "../../server/utils/image/providers/openai-generations.ts";
import type { ImageInput } from "../../server/utils/image.ts";

const pngBase64 = Buffer.from([1, 2, 3]).toString("base64");

describe("createOpenAIImageGenerationProvider", () => {
  it("invokes SDK image generation and maps base64 images to ImageOutput", async () => {
    const generate = vi.fn().mockResolvedValue({
      output_format: "webp",
      data: [
        {
          b64_json: pngBase64,
          revised_prompt: "revised prompt",
        },
      ],
      usage: {
        input_tokens: 2,
        output_tokens: 3,
        total_tokens: 5,
      },
    });
    const provider = createOpenAIImageGenerationProvider(config(), {
      images: { generate },
      responses: { create: vi.fn() },
    } as never);

    const output = await provider.invoke({
      ...baseInput(),
      responseFormat: "url",
      n: 2,
      size: "1024x1024",
      quality: "high",
      format: "webp",
      options: {
        moderation: "low",
        outputCompression: 80,
        partialImages: 1,
        user: "user-1",
      },
    });

    expect(provider.supports?.(baseInput())).toBe(true);
    expect(
      provider.supports?.({
        ...baseInput(),
        source: {
          protocol: "openai",
          endpoint: "responses",
          raw: {},
        },
      }),
    ).toBe(false);
    expect(generate).toHaveBeenCalledWith({
      prompt: "draw a cat",
      model: "gpt-image-1",
      n: 2,
      size: "1024x1024",
      quality: "high",
      background: undefined,
      output_format: "webp",
      moderation: "low",
      output_compression: 80,
      partial_images: 1,
      response_format: undefined,
      user: "user-1",
      stream: false,
    });
    expect(output.images).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/webp",
        revisedPrompt: "revised prompt",
      },
    ]);
    expect(output.usage).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    });
  });
});

const config = () => ({
  id: "openai-generations",
  type: "openai-images" as const,
  apiKey: "sk-test",
  models: ["gpt-image-1"],
});

const baseInput = (): ImageInput => ({
  action: "generate",
  prompt: "draw a cat",
  model: "gpt-image-1",
  source: {
    protocol: "openai",
    endpoint: "images.generations",
    raw: {},
  },
});

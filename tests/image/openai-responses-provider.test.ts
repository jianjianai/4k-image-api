import { describe, expect, it, vi } from "vitest";
import { createOpenAIResponsesImageProvider } from "../../server/utils/image/providers/openai-responses.ts";
import type { ImageInput } from "../../server/utils/image.ts";

const pngBase64 = Buffer.from([1, 2, 3]).toString("base64");

describe("createOpenAIResponsesImageProvider", () => {
  it("invokes SDK responses image generation and maps image_generation_call output", async () => {
    const create = vi.fn().mockResolvedValue({
      output: [
        {
          type: "message",
        },
        {
          type: "image_generation_call",
          result: pngBase64,
          status: "completed",
        },
      ],
      usage: {
        input_tokens: 4,
        output_tokens: 5,
        total_tokens: 9,
      },
    });
    const provider = createOpenAIResponsesImageProvider(config(), {
      images: { generate: vi.fn() },
      responses: { create },
    } as never);

    const input = {
      ...baseInput(),
      size: "1024x1536",
      quality: "auto",
      format: "png",
      background: "opaque",
      options: {
        tool: {
          moderation: "auto",
          output_compression: 100,
          partial_images: 2,
        },
      },
    };
    const output = await provider.invoke(input);

    expect(provider.supports?.(input)).toBe(true);
    expect(
      provider.supports?.({
        ...input,
        source: {
          protocol: "openai",
          endpoint: "images.generations",
          raw: {},
        },
      }),
    ).toBe(false);
    expect(create).toHaveBeenCalledWith({
      model: "gpt-image-1",
      input: "draw a cat",
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1",
          size: "1024x1536",
          quality: "auto",
          output_format: "png",
          background: "opaque",
          moderation: "auto",
          output_compression: 100,
          partial_images: 2,
        },
      ],
      tool_choice: "required",
      stream: false,
    });
    expect(output.images).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
      },
    ]);
    expect(output.usage).toEqual({
      inputTokens: 4,
      outputTokens: 5,
      totalTokens: 9,
    });
  });
});

const config = () => ({
  id: "openai-responses",
  type: "openai-responses" as const,
  apiKey: "sk-test",
  models: ["gpt-image-1"],
});

const baseInput = (): ImageInput => ({
  action: "generate",
  prompt: "draw a cat",
  model: "gpt-image-1",
  source: {
    protocol: "openai",
    endpoint: "responses",
    raw: {},
  },
});

import { describe, expect, it, vi } from "vitest";
import { createOpenAIImageGenerationProvider } from "../../server/utils/image/providers/openai-generations.ts";
import type { ImageInput } from "../../server/utils/image.ts";

const pngBase64 = Buffer.from([1, 2, 3]).toString("base64");

describe("createOpenAIImageGenerationProvider", () => {
  it("invokes SDK image generation and maps base64 images to ImageOutput", async () => {
    const generate = vi.fn().mockResolvedValue(
      streamOf([
        {
          type: "image_generation.completed",
          b64_json: pngBase64,
          output_format: "webp",
          usage: {
            input_tokens: 2,
            output_tokens: 3,
            total_tokens: 5,
          },
        },
      ]),
    );
    const provider = createOpenAIImageGenerationProvider(config(), {
      images: {
        createVariation: vi.fn(),
        edit: vi.fn(),
        generate,
      },
      responses: { create: vi.fn() },
    } as never);

    expect(provider.actionSupports).toEqual(["generate", "edit"]);

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
      user: "user-1",
      stream: true,
    });
    expect(output.images).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/webp",
      },
    ]);
    expect(output.usage).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    });
  });

  it("converts edit inputs to SDK image edits", async () => {
    const edit = vi.fn().mockResolvedValue(
      streamOf([
        {
          type: "image_edit.completed",
          b64_json: pngBase64,
          output_format: "png",
        },
      ]),
    );
    const provider = createOpenAIImageGenerationProvider(config(), {
      images: {
        createVariation: vi.fn(),
        edit,
        generate: vi.fn(),
      },
      responses: { create: vi.fn() },
    } as never);

    await provider.invoke({
      ...baseInput(),
      action: "edit",
      images: [imageAsset("source.png")],
      mask: imageAsset("mask.png"),
      quality: "hd",
      options: {
        inputFidelity: "high",
        outputCompression: 90,
        user: "user-1",
      },
    });

    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "draw a cat",
        model: "gpt-image-1",
        image: [expect.any(File)],
        mask: expect.any(File),
        quality: undefined,
        input_fidelity: "high",
        output_compression: 90,
        user: "user-1",
        stream: true,
      }),
    );
  });

  it("fails before calling upstream for DALL-E streaming requests", async () => {
    const generate = vi.fn();
    const provider = createOpenAIImageGenerationProvider(
      {
        ...config(),
        models: ["dall-e-3"],
      },
      {
        images: {
          createVariation: vi.fn(),
          edit: vi.fn(),
          generate,
        },
        responses: { create: vi.fn() },
      } as never,
    );

    await expect(
      provider.invoke({
        ...baseInput(),
        model: "dall-e-3",
      }),
    ).rejects.toThrow("OpenAI Images streaming is not supported");
    expect(generate).not.toHaveBeenCalled();
  });
});

async function* streamOf(events: Record<string, unknown>[]) {
  for (const event of events) {
    yield event;
  }
}

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
});

const imageAsset = (filename: string) => ({
  data: new Uint8Array([1, 2, 3]),
  mimeType: "image/png" as const,
  filename,
});

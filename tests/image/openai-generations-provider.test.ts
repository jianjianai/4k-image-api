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

  it("converts edit inputs to SDK image edits", async () => {
    const edit = vi.fn().mockResolvedValue({
      output_format: "png",
      data: [{ b64_json: pngBase64 }],
    });
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
        stream: false,
      }),
    );
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
});

const imageAsset = (filename: string) => ({
  data: new Uint8Array([1, 2, 3]),
  mimeType: "image/png" as const,
  filename,
});

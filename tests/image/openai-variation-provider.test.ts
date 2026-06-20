import { describe, expect, it, vi } from "vitest";
import { createOpenAIImageVariationProvider } from "../../server/utils/image/providers/openai-variation.ts";
import type { ImageInput } from "../../server/utils/image.ts";

const pngBase64 = Buffer.from([1, 2, 3]).toString("base64");

describe("createOpenAIImageVariationProvider", () => {
  it("invokes SDK image variation and maps base64 images to ImageOutput", async () => {
    const createVariation = vi.fn().mockResolvedValue({
      data: [{ b64_json: pngBase64 }],
      usage: {
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
      },
    });
    const provider = createOpenAIImageVariationProvider(config(), {
      images: {
        createVariation,
        edit: vi.fn(),
        generate: vi.fn(),
      },
      responses: { create: vi.fn() },
    } as never);

    const output = await provider.invoke({
      ...baseInput(),
      images: [imageAsset("source.png")],
      n: 2,
      size: "1024x1024",
      responseFormat: "b64_json",
      options: {
        user: "user-1",
      },
    });

    expect(provider.actionSupports).toEqual(["variation"]);
    expect(createVariation).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.any(File),
        model: "dall-e-2",
        n: 2,
        size: "1024x1024",
        response_format: "b64_json",
        user: "user-1",
      }),
    );
    expect(output.images).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        revisedPrompt: undefined,
      },
    ]);
    expect(output.usage).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
    });
  });
});

const config = () => ({
  id: "openai-variation",
  type: "openai-variation" as const,
  apiKey: "sk-test",
  models: ["dall-e-2"],
});

const baseInput = (): ImageInput => ({
  action: "variation",
  model: "dall-e-2",
});

const imageAsset = (filename: string) => ({
  data: new Uint8Array([1, 2, 3]),
  mimeType: "image/png" as const,
  filename,
});

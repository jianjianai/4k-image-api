import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelslabRealEsrganSizeAdapter } from "../../server/utils/image/processors/size-adapter-modelslab-real-esrgan.ts";
import type { ImageInput, ImageOutput } from "../../server/utils/image.ts";

describe("createModelslabRealEsrganSizeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves requests and outputs unchanged when requested size is within max size", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = imageInput("512x512");
    const processedInput = await processor.processInput?.(input, context());
    const output = imageOutput();
    const processedOutput = await processor.processOutput?.(
      output,
      processedInput ?? input,
      context(),
    );

    expect(processedInput).toBe(input);
    expect(processedOutput).toBe(output);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adapts oversized requests and upscales outputs with Modelslab", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          output: ["https://example.test/output.png"],
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9, 8, 7]), {
          headers: {
            "content-type": "image/webp",
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2048x1024"), context());
    const output = await processor.processOutput?.(imageOutput(), input!, context());

    expect(input?.size).toBe("1024x512");
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://example.test/super_resolution",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          key: "key-test",
          init_image: "data:image/png;base64,AQID",
          model_id: "RealESRGAN_x2plus",
          scale: 2,
          face_enhance: true,
        }),
      },
    );
    expect(fetch).toHaveBeenNthCalledWith(2, "https://example.test/output.png");
    expect(output?.images).toEqual([
      {
        bytes: new Uint8Array([9, 8, 7]),
        mimeType: "image/webp",
      },
    ]);
  });

  it("automatically chooses the cheapest exact scale", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          output: ["https://example.test/output.png"],
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 8, 7])));
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor({
      maxWidth: 1920,
      maxHeight: 1920,
      maxPixels: 2073600,
      modelId: undefined,
      scale: undefined,
    });
    const input = await processor.processInput?.(imageInput("2480x3328"), context());

    await processor.processOutput?.(imageOutput(), input!, context());

    expect(input?.size).toBe("1240x1664");
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://example.test/super_resolution",
      expect.objectContaining({
        body: JSON.stringify({
          key: "key-test",
          init_image: "data:image/png;base64,AQID",
          model_id: "RealESRGAN_x2plus",
          scale: 2,
          face_enhance: true,
        }),
      }),
    );
  });

  it("uses 4x only when cheaper scales cannot fit within max size", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          output: ["https://example.test/output.png"],
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 8, 7])));
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor({
      maxWidth: 600,
      maxHeight: 900,
      maxPixels: undefined,
      modelId: undefined,
      scale: undefined,
    });
    const input = await processor.processInput?.(imageInput("2400x3200"), context());

    await processor.processOutput?.(imageOutput(), input!, context());

    expect(input?.size).toBe("600x800");
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://example.test/super_resolution",
      expect.objectContaining({
        body: JSON.stringify({
          key: "key-test",
          init_image: "data:image/png;base64,AQID",
          model_id: "realesr-general-x4v3",
          scale: 4,
          face_enhance: true,
        }),
      }),
    );
  });

  it("uses modelByScale before the built-in default model mapping", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          output: ["https://example.test/output.png"],
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 8, 7])));
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor({
      maxWidth: 600,
      maxHeight: 900,
      maxPixels: undefined,
      modelId: undefined,
      modelByScale: {
        "4": "ultra_resolution",
      },
      scale: undefined,
    });
    const input = await processor.processInput?.(imageInput("2400x3200"), context());

    await processor.processOutput?.(imageOutput(), input!, context());

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://example.test/super_resolution",
      expect.objectContaining({
        body: JSON.stringify({
          key: "key-test",
          init_image: "data:image/png;base64,AQID",
          model_id: "ultra_resolution",
          scale: 4,
          face_enhance: true,
        }),
      }),
    );
  });

  it("rejects sizes that cannot be produced exactly without a final resize", async () => {
    const processor = createProcessor({
      modelId: undefined,
      scale: undefined,
    });

    expect(() => processor.processInput?.(imageInput("2049x1024"), context())).toThrow(
      "without a final resize",
    );
  });
});

const createProcessor = (
  overrides: Partial<Parameters<typeof createModelslabRealEsrganSizeAdapter>[0]> = {},
) =>
  createModelslabRealEsrganSizeAdapter({
    id: "resize-modelslab",
    type: "size-adapter:modelslab:real-esrgan",
    maxWidth: 1024,
    maxHeight: 1024,
    maxPixels: 1048576,
    apiKey: "key-test",
    modelId: "RealESRGAN_x2plus",
    scale: 2,
    faceEnhance: true,
    baseURL: "https://example.test/super_resolution",
    ...overrides,
  });

const imageInput = (size: string): ImageInput => ({
  action: "generate",
  model: "test-image",
  size,
});

const imageOutput = (): ImageOutput => ({
  images: [
    {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    },
  ],
});

const context = () => ({
  providerId: "test-provider",
  providerType: "test" as const,
  model: "test-image",
  action: "generate" as const,
  processorId: "resize-modelslab",
});

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
});

const createProcessor = () =>
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

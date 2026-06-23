import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClaidUpscaleSizeAdapter } from "../../server/utils/image/processors/size-adapter-claid-upscale.ts";
import type { ImageInput, ImageOutput } from "../../server/utils/image.ts";

describe("createClaidUpscaleSizeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves requests and outputs unchanged when the output already satisfies the target", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = imageInput("512x512");
    const processedInput = await processor.processInput?.(input, context());
    const output = imageOutput(await createPng(512, 512));
    const processedOutput = await processor.processOutput?.(
      output,
      processedInput ?? input,
      context(),
    );

    expect(processedInput).toBe(input);
    expect(processedOutput).toBe(output);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adapts oversized requests and upscales outputs with Claid", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            output: {
              tmp_url: "https://example.test/output.png",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9, 8, 7]), {
          headers: {
            "content-type": "image/jpeg",
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor({
      upscaleType: "photo",
    });
    const input = await processor.processInput?.(imageInput("2048x1024"), context());
    const output = await processor.processOutput?.(
      imageOutput(await createPng(1024, 512)),
      input!,
      context(),
    );

    expect(input?.size).toBe("1024x512");
    await expectClaidRequest(fetch, {
      resizing: {
        width: 2048,
        height: "auto",
        fit: "bounds",
      },
      upscaleType: "photo",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://example.test/output.png",
      expect.any(Object),
    );
    expect(output?.images).toEqual([
      {
        bytes: new Uint8Array([9, 8, 7]),
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("uses target height when that is the smaller aspect-ratio preserving resize", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            output: {
              tmp_url: "https://example.test/output.png",
            },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 8, 7])));
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2048x2048"), context());

    await processor.processOutput?.(
      imageOutput(await createPng(1024, 512)),
      input!,
      context(),
    );

    await expectClaidRequest(fetch, {
      resizing: {
        width: "auto",
        height: 2048,
        fit: "bounds",
      },
      upscaleType: "smart_enhance",
    });
  });

  it("returns the generated image when post-generation Claid processing fails", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response("unavailable", {
        status: 503,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2880x2880"), context());
    const image = imageOutput(await createPng(960, 960));

    const output = await processor.processOutput?.(image, input!, context());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(output?.images[0]?.bytes).toBe(image.images[0]?.bytes);
    expect(output?.images[0]?.mimeType).toBe("image/png");
  });

  it("adapts uneven sizes instead of rejecting after exact-scale planning fails", async () => {
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2049x1024"), context());

    expect(input?.size).toBe("1024x511");
  });
});

const createProcessor = (
  overrides: Partial<Parameters<typeof createClaidUpscaleSizeAdapter>[0]> = {},
) =>
  createClaidUpscaleSizeAdapter({
    id: "resize-claid",
    type: "size-adapter:claid:upscale",
    maxWidth: 1024,
    maxHeight: 1024,
    maxPixels: 1048576,
    apiKey: "claid-key-test",
    baseURL: "https://example.test/image/edit/upload",
    timeoutMs: 120000,
    ...overrides,
  });

const imageInput = (size: string): ImageInput => ({
  action: "generate",
  model: "test-image",
  size,
});

const imageOutput = (bytes: Uint8Array = new Uint8Array([1, 2, 3])): ImageOutput => ({
  images: [
    {
      bytes,
      mimeType: "image/png",
    },
  ],
});

const createPng = async (width: number, height: number): Promise<Uint8Array> =>
  new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: "red",
      },
    })
      .png()
      .toBuffer(),
  );

const expectClaidRequest = async (
  fetch: ReturnType<typeof vi.fn>,
  expected: {
    resizing: { width: number | "auto"; height: number | "auto"; fit: "bounds" };
    upscaleType: string;
  },
): Promise<void> => {
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    "https://example.test/image/edit/upload",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer claid-key-test",
      }),
      body: expect.any(Blob),
    }),
  );

  const init = fetch.mock.calls[0]?.[1] as {
    headers: Record<string, string>;
    body: Blob;
  };
  const contentType = init.headers["content-type"];
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];

  expect(boundary).toBeDefined();
  expect(contentType).toMatch(/^multipart\/form-data; boundary=/);

  const text = await init.body.text();

  expect(text).toContain(`--${boundary}`);
  expect(text).toContain('Content-Disposition: form-data; name="file"; filename="image.png"');
  expect(text).toContain("Content-Type: image/png");
  expect(text).toContain('Content-Disposition: form-data; name="data"');
  expect(text).toContain("Content-Type: application/json");
  expect(readMultipartJson(text, boundary!)).toEqual({
    operations: {
      restorations: {
        upscale: expected.upscaleType,
      },
      resizing: expected.resizing,
    },
  });
};

const readMultipartJson = (text: string, boundary: string): unknown => {
  const dataHeader = 'Content-Disposition: form-data; name="data"';
  const headerStart = text.indexOf(dataHeader);
  const jsonStart = text.indexOf("\r\n\r\n", headerStart) + 4;
  const jsonEnd = text.indexOf(`\r\n--${boundary}--`, jsonStart);

  return JSON.parse(text.slice(jsonStart, jsonEnd)) as unknown;
};

const context = () => ({
  providerId: "test-provider",
  providerType: "test" as const,
  model: "test-image",
  action: "generate" as const,
  processorId: "resize-claid",
});

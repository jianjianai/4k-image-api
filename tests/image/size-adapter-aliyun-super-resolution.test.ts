import { afterEach, describe, expect, it, vi } from "vitest";
import { createAliyunSuperResolutionSizeAdapter } from "../../server/utils/image/processors/size-adapter-aliyun-super-resolution.ts";
import type { ImageInput, ImageOutput } from "../../server/utils/image.ts";

const mocks = vi.hoisted(() => {
  const makeSuperResolutionImageAdvance = vi.fn();
  const clientConstructor = vi.fn(function (
    this: { makeSuperResolutionImageAdvance: typeof makeSuperResolutionImageAdvance },
  ) {
    this.makeSuperResolutionImageAdvance = makeSuperResolutionImageAdvance;
  });

  return {
    clientConstructor,
    makeSuperResolutionImageAdvance,
  };
});

vi.mock("@alicloud/imageenhan20190930", () => ({
  default: {
    default: mocks.clientConstructor,
  },
  MakeSuperResolutionImageAdvanceRequest: class {
    mode?: string;
    outputFormat?: string;
    outputQuality?: number;
    upscaleFactor?: number;
    urlObject?: unknown;

    constructor(value: {
      mode?: string;
      outputFormat?: string;
      outputQuality?: number;
      upscaleFactor?: number;
      urlObject?: unknown;
    }) {
      Object.assign(this, value);
    }
  },
}));

describe("createAliyunSuperResolutionSizeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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
    expect(mocks.clientConstructor).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adapts oversized requests and upscales outputs with Aliyun", async () => {
    mocks.makeSuperResolutionImageAdvance.mockResolvedValueOnce({
      body: {
        data: {
          url: "https://example.test/output.png",
        },
      },
    });
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response(new Uint8Array([9, 8, 7]), {
        headers: {
          "content-type": "image/jpeg",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2048x1024"), context());
    const output = await processor.processOutput?.(imageOutput(), input!, context());

    expect(input?.size).toBe("1024x512");
    expect(mocks.clientConstructor).toHaveBeenCalledWith({
      accessKeyId: "access-key-id-test",
      accessKeySecret: "access-key-secret-test",
      regionId: "cn-shanghai",
      endpoint: "imageenhan.cn-shanghai.aliyuncs.com",
    });
    expect(mocks.makeSuperResolutionImageAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "base",
        outputFormat: "png",
        outputQuality: 95,
        upscaleFactor: 2,
        urlObject: expect.any(Object),
      }),
      {
        connectTimeout: 120000,
        readTimeout: 120000,
      },
    );
    expect(fetch).toHaveBeenCalledWith("https://example.test/output.png");
    expect(output?.images).toEqual([
      {
        bytes: new Uint8Array([9, 8, 7]),
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("automatically chooses the cheapest exact scale", async () => {
    mocks.makeSuperResolutionImageAdvance.mockResolvedValueOnce({
      body: {
        data: {
          url: "https://example.test/output.png",
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([9, 8, 7]))),
    );
    const processor = createProcessor({
      maxWidth: 1920,
      maxHeight: 1920,
      maxPixels: 2073600,
      scale: undefined,
    });
    const input = await processor.processInput?.(imageInput("2480x3328"), context());

    await processor.processOutput?.(imageOutput(), input!, context());

    expect(input?.size).toBe("1240x1664");
    expect(mocks.makeSuperResolutionImageAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        upscaleFactor: 2,
      }),
      expect.any(Object),
    );
  });

  it("uses 4x only when cheaper scales cannot fit within max size", async () => {
    mocks.makeSuperResolutionImageAdvance.mockResolvedValueOnce({
      body: {
        data: {
          url: "https://example.test/output.png",
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([9, 8, 7]))),
    );
    const processor = createProcessor({
      maxWidth: 600,
      maxHeight: 900,
      maxPixels: undefined,
      scale: undefined,
    });
    const input = await processor.processInput?.(imageInput("2400x3200"), context());

    await processor.processOutput?.(imageOutput(), input!, context());

    expect(input?.size).toBe("600x800");
    expect(mocks.makeSuperResolutionImageAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        upscaleFactor: 4,
      }),
      expect.any(Object),
    );
  });

  it("rejects sizes that cannot be produced exactly without a final resize", async () => {
    const processor = createProcessor({
      scale: undefined,
    });

    expect(() => processor.processInput?.(imageInput("2049x1024"), context())).toThrow(
      "without a final resize",
    );
  });
});

const createProcessor = (
  overrides: Partial<Parameters<typeof createAliyunSuperResolutionSizeAdapter>[0]> = {},
) =>
  createAliyunSuperResolutionSizeAdapter({
    id: "resize-aliyun",
    type: "size-adapter:aliyun:super-resolution",
    maxWidth: 1024,
    maxHeight: 1024,
    maxPixels: 1048576,
    accessKeyId: "access-key-id-test",
    accessKeySecret: "access-key-secret-test",
    regionId: "cn-shanghai",
    endpoint: "imageenhan.cn-shanghai.aliyuncs.com",
    scale: 2,
    mode: "base",
    outputFormat: "png",
    outputQuality: 95,
    timeoutMs: 120000,
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
  processorId: "resize-aliyun",
});

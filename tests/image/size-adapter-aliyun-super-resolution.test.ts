import sharp from "sharp";
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
    const output = imageOutput(await createPng(512, 512));
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
    const output = await processor.processOutput?.(
      imageOutput(await createPng(1024, 512)),
      input!,
      context(),
    );

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
    });
    const input = await processor.processInput?.(imageInput("2480x3328"), context());

    await processor.processOutput?.(
      imageOutput(await createPng(620, 832)),
      input!,
      context(),
    );

    expect(input?.size).toBe("1243x1668");
    expect(mocks.makeSuperResolutionImageAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        upscaleFactor: 4,
      }),
      expect.any(Object),
    );
  });

  it("maximizes provider input size without applying Aliyun upload limits", async () => {
    const processor = createProcessor({
      maxWidth: 1920,
      maxHeight: 1920,
      maxPixels: 2073600,
    });
    const input = await processor.processInput?.(imageInput("2480x3328"), context());

    expect(input?.size).toBe("1243x1668");
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
    });
    const input = await processor.processInput?.(imageInput("2400x3200"), context());

    await processor.processOutput?.(
      imageOutput(await createPng(600, 800)),
      input!,
      context(),
    );

    expect(input?.size).toBe("600x800");
    expect(mocks.makeSuperResolutionImageAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        upscaleFactor: 4,
      }),
      expect.any(Object),
    );
  });

  it("resizes provider output by actual dimensions before Aliyun upload", async () => {
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
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2880x2880"), context());
    const source = await sharp({
      create: {
        width: 1280,
        height: 1280,
        channels: 4,
        background: "red",
      },
    })
      .png()
      .toBuffer();

    await processor.processOutput?.(
      imageOutput(new Uint8Array(source)),
      input!,
      context(),
    );

    const request = mocks.makeSuperResolutionImageAdvance.mock.calls[0]?.[0] as {
      urlObject?: AsyncIterable<Uint8Array>;
      upscaleFactor?: number;
    };
    const upload = await readableToBuffer(request.urlObject!);
    const metadata = await sharp(upload).metadata();

    expect(input?.size).toBe("1024x1024");
    expect(request.upscaleFactor).toBe(3);
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
  });

  it("preserves provider output aspect ratio when resizing before Aliyun upload", async () => {
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
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2880x2880"), context());
    const source = await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 4,
        background: "red",
      },
    })
      .png()
      .toBuffer();

    await processor.processOutput?.(
      imageOutput(new Uint8Array(source)),
      input!,
      context(),
    );

    const request = mocks.makeSuperResolutionImageAdvance.mock.calls[0]?.[0] as {
      urlObject?: AsyncIterable<Uint8Array>;
    };
    const upload = await readableToBuffer(request.urlObject!);
    const metadata = await sharp(upload).metadata();

    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(768);
  });

  it("uses best-effort 4x when actual provider output is too small for the target", async () => {
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
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2880x2880"), context());

    await processor.processOutput?.(
      imageOutput(await createPng(500, 500)),
      input!,
      context(),
    );

    const request = mocks.makeSuperResolutionImageAdvance.mock.calls[0]?.[0] as {
      upscaleFactor?: number;
    };

    expect(input?.size).toBe("1024x1024");
    expect(request.upscaleFactor).toBe(4);
  });

  it("shrinks oversized actual output to the largest Aliyun-accepted size", async () => {
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
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("3840x2160"), context());

    await processor.processOutput?.(
      imageOutput(await createPng(864, 1821)),
      input!,
      context(),
    );

    const request = mocks.makeSuperResolutionImageAdvance.mock.calls[0]?.[0] as {
      urlObject?: AsyncIterable<Uint8Array>;
      upscaleFactor?: number;
    };
    const upload = await readableToBuffer(request.urlObject!);
    const metadata = await sharp(upload).metadata();

    expect(input?.size).toBe("1024x576");
    expect(request.upscaleFactor).toBe(4);
    expect(metadata.width).toBe(486);
    expect(metadata.height).toBe(1024);
  });

  it("does not process oversized actual output when it already satisfies the target", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("3840x2160"), context());
    const image = imageOutput(await createPng(3840, 2160));

    const output = await processor.processOutput?.(image, input!, context());

    expect(output).toBe(image);
    expect(mocks.clientConstructor).not.toHaveBeenCalled();
    expect(mocks.makeSuperResolutionImageAdvance).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the generated image when post-generation Aliyun processing fails", async () => {
    mocks.makeSuperResolutionImageAdvance.mockRejectedValueOnce(
      new Error("upstream unavailable"),
    );
    vi.stubGlobal("fetch", vi.fn());
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2880x2880"), context());
    const image = imageOutput(await createPng(960, 960));

    const output = await processor.processOutput?.(image, input!, context());

    expect(mocks.makeSuperResolutionImageAdvance).toHaveBeenCalled();
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

const readableToBuffer = async (
  readable: AsyncIterable<Uint8Array>,
): Promise<Buffer> => {
  const chunks: Uint8Array[] = [];

  for await (const chunk of readable) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

const context = () => ({
  providerId: "test-provider",
  providerType: "test" as const,
  model: "test-image",
  action: "generate" as const,
  processorId: "resize-aliyun",
});

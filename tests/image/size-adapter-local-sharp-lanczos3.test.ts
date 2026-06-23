import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createLocalSharpLanczos3SizeAdapter } from "../../server/utils/image/processors/size-adapter-local-sharp-lanczos3.ts";
import type { ImageInput, ImageOutput } from "../../server/utils/image.ts";

describe("createLocalSharpLanczos3SizeAdapter", () => {
  it("leaves requests and outputs unchanged when requested size is within max size", async () => {
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
  });

  it("adapts oversized requests and upscales the output back to requested size", async () => {
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2048x1024"), context());
    const source = await sharp({
      create: {
        width: 1024,
        height: 512,
        channels: 4,
        background: "red",
      },
    })
      .png()
      .toBuffer();

    const output = await processor.processOutput?.(
      imageOutput(new Uint8Array(source)),
      input!,
      context(),
    );
    const metadata = await sharp(output!.images[0]!.bytes).metadata();

    expect(input?.size).toBe("1024x512");
    expect(metadata.width).toBe(2048);
    expect(metadata.height).toBe(1024);
    expect(output?.images[0]?.mimeType).toBe("image/png");
  });

  it("upscales from actual output dimensions without distorting aspect ratio", async () => {
    const processor = createProcessor();
    const input = await processor.processInput?.(imageInput("2048x1024"), context());
    const output = await processor.processOutput?.(
      imageOutput(await createPng(1000, 1000)),
      input!,
      context(),
    );
    const metadata = await sharp(output!.images[0]!.bytes).metadata();

    expect(metadata.width).toBe(2048);
    expect(metadata.height).toBe(2048);
  });

  it("also satisfies requested size when the request was within max size", async () => {
    const processor = createProcessor();
    const input = imageInput("1024x512");
    const processedInput = await processor.processInput?.(input, context());
    const output = await processor.processOutput?.(
      imageOutput(await createPng(512, 512)),
      processedInput ?? input,
      context(),
    );
    const metadata = await sharp(output!.images[0]!.bytes).metadata();

    expect(processedInput).toBe(input);
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
  });

  it("respects maxPixels for square requests", async () => {
    const processor = createProcessor({
      maxWidth: 1920,
      maxHeight: 1920,
      maxPixels: 2073600,
    });
    const input = await processor.processInput?.(imageInput("4096x4096"), context());

    expect(input?.size).toBe("1440x1440");
  });

  it("keeps common and uncommon aspect ratios within all max constraints", async () => {
    const processor = createProcessor({
      maxWidth: 1920,
      maxHeight: 1920,
      maxPixels: 2073600,
    });

    await expectAdaptedSize(processor, "4096x2304", "1920x1080");
    await expectAdaptedSize(processor, "4096x3072", "1662x1247");
    await expectAdaptedSize(processor, "4096x1024", "1920x480");
    await expectAdaptedSize(processor, "1024x4096", "480x1920");
    await expectAdaptedSize(processor, "3000x1700", "1912x1083");
  });
});

const createProcessor = (
  overrides: Partial<Parameters<typeof createLocalSharpLanczos3SizeAdapter>[0]> = {},
) =>
  createLocalSharpLanczos3SizeAdapter({
    id: "resize-local",
    type: "size-adapter:local:sharp-lanczos3",
    maxWidth: 1024,
    maxHeight: 1024,
    fit: "fill",
    ...overrides,
  });

const expectAdaptedSize = async (
  processor: ReturnType<typeof createLocalSharpLanczos3SizeAdapter>,
  requestedSize: string,
  expectedSize: string,
): Promise<void> => {
  const input = await processor.processInput?.(imageInput(requestedSize), context());

  expect(input?.size).toBe(expectedSize);
};

const imageInput = (size: string): ImageInput => ({
  action: "generate",
  model: "test-image",
  size,
});

const imageOutput = (bytes: Uint8Array): ImageOutput => ({
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

const context = () => ({
  providerId: "test-provider",
  providerType: "test" as const,
  model: "test-image",
  action: "generate" as const,
  processorId: "resize-local",
});

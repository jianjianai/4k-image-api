import sharp from "sharp";
import { imageWarn, summarizeError } from "../logger.ts";
import type { LocalSharpLanczos3SizeAdapterConfig } from "../provider-config.ts";
import type { ImageInput, ImageMimeType, ImageProcessor } from "../types.ts";
import {
  adaptInputSize,
  getSizeAdapterState,
  parseImageSize,
  type ImageSize,
} from "./size-adapter.ts";

export const createLocalSharpLanczos3SizeAdapter = (
  config: LocalSharpLanczos3SizeAdapterConfig,
): ImageProcessor => ({
  id: config.id,
  type: config.type,
  processInput: (input) =>
    adaptInputSize(input, {
      width: config.maxWidth,
      height: config.maxHeight,
      maxPixels: config.maxPixels,
    }),
  processOutput: async (output, input) => {
    const target = getOutputTarget(input);

    if (!target) {
      return output;
    }

    const images = await Promise.all(
      output.images.map(async (image) => {
        let resized: {
          bytes: Uint8Array;
          mimeType: ImageMimeType;
        };

        try {
          resized = await resizeImage(
            image.bytes,
            image.mimeType,
            target,
          );
        } catch (error) {
          imageWarn("local sharp size adapter returned original image", {
            processorId: config.id,
            reason: "post-generation processing failed",
            error: summarizeError(error),
          });
          return image;
        }

        if (resized.bytes === image.bytes && resized.mimeType === image.mimeType) {
          return image;
        }

        return {
          ...image,
          bytes: resized.bytes,
          mimeType: resized.mimeType,
        };
      }),
    );

    if (images.every((image, index) => image === output.images[index])) {
      return output;
    }

    return {
      ...output,
      images,
    };
  },
});

const getOutputTarget = (input: ImageInput): ImageSize | undefined =>
  getSizeAdapterState(input)?.target ?? parseImageSize(input.size);

const resizeImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  target: ImageSize,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const dimensions = await getProportionalResizeDimensions(bytes, target);

  if (!dimensions) {
    return { bytes, mimeType };
  }

  let pipeline = sharp(bytes).resize({
    ...dimensions,
    kernel: sharp.kernel.lanczos3,
  });

  if (mimeType === "image/jpeg") {
    pipeline = pipeline.jpeg();
  } else if (mimeType === "image/webp") {
    pipeline = pipeline.webp();
  } else {
    pipeline = pipeline.png();
  }

  return {
    bytes: new Uint8Array(await pipeline.toBuffer()),
    mimeType,
  };
};

const getProportionalResizeDimensions = async (
  bytes: Uint8Array,
  target: ImageSize,
): Promise<{ width: number } | { height: number } | undefined> => {
  const metadata = await sharp(bytes).metadata();

  if (
    typeof metadata.width !== "number" ||
    !Number.isFinite(metadata.width) ||
    typeof metadata.height !== "number" ||
    !Number.isFinite(metadata.height)
  ) {
    return undefined;
  }

  if (metadata.width >= target.width && metadata.height >= target.height) {
    return undefined;
  }

  const widthScale = target.width / metadata.width;
  const heightScale = target.height / metadata.height;

  return widthScale >= heightScale
    ? { width: target.width }
    : { height: target.height };
};

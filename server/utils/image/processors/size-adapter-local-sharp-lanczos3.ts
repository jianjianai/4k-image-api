import sharp from "sharp";
import type { LocalSharpLanczos3SizeAdapterConfig } from "../provider-config.ts";
import type { ImageInput, ImageMimeType, ImageProcessor } from "../types.ts";
import {
  adaptInputSize,
  getSizeAdapterState,
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
    const state = getSizeAdapterState(input);

    if (!state) {
      return output;
    }

    return {
      ...output,
      images: await Promise.all(
        output.images.map(async (image) => {
          const resized = await resizeImage(
            image.bytes,
            image.mimeType,
            input,
            config,
          );

          return {
            ...image,
            bytes: resized.bytes,
            mimeType: resized.mimeType,
          };
        }),
      ),
    };
  },
});

const resizeImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  input: ImageInput,
  config: LocalSharpLanczos3SizeAdapterConfig,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const state = getSizeAdapterState(input);

  if (!state) {
    return { bytes, mimeType };
  }

  let pipeline = sharp(bytes).resize({
    width: state.target.width,
    height: state.target.height,
    fit: config.fit ?? "fill",
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

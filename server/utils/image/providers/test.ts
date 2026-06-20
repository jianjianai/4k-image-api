import type { ImageMimeType, ImageProvider } from "../types.ts";

const pngBytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
  120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const jpegBytes = new Uint8Array([
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 96, 0, 96, 0, 0,
  255, 219, 0, 67, 0, 3, 2, 2, 3, 2, 2, 3, 3, 3, 3, 4, 3, 3, 4, 5, 8, 5, 5,
  4, 4, 5, 10, 7, 7, 6, 8, 12, 10, 12, 12, 11, 10, 11, 11, 13, 14, 18, 16,
  13, 14, 17, 14, 11, 11, 16, 22, 16, 17, 19, 20, 21, 21, 21, 12, 15, 23, 24,
  22, 20, 24, 18, 20, 21, 20, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 34, 0, 2,
  17, 1, 3, 17, 1, 255, 196, 0, 20, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 8, 255, 196, 0, 20, 16, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 255, 218, 0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 191,
  128, 255, 217,
]);

const webpBytes = new Uint8Array([
  82, 73, 70, 70, 26, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 76, 13, 0, 0, 0,
  47, 0, 0, 0, 16, 7, 16, 17, 17, 136, 136, 254, 7, 0,
]);

export const testImageProvider: ImageProvider = {
  id: "test-image-provider",
  actionSupports: ["generate", "edit", "variation"],
  models: [
    "test-image",
    "gpt-image-1",
    "gpt-image-2",
    "dall-e-2",
    "dall-e-3",
    "gpt-4.1-mini",
    "gpt-5.5",
  ],
  invoke: async (input) => {
    const count = Math.max(1, Math.min(input.n ?? 1, 10));
    const mimeType = imageFormatToMimeType(input.format);
    const bytes = getFixtureBytes(mimeType);

    return {
      images: Array.from({ length: count }, (_, index) => ({
        bytes,
        mimeType,
        revisedPrompt:
          input.prompt === undefined
            ? undefined
            : `${input.prompt}${index === 0 ? "" : ` #${index + 1}`}`,
      })),
      usage: {
        inputTokens: input.prompt?.length ?? 0,
        outputTokens: count,
        totalTokens: (input.prompt?.length ?? 0) + count,
      },
      raw: {
        provider: "test-image-provider",
        action: input.action,
        imageCount: input.images?.length ?? 0,
        hasMask: Boolean(input.mask),
      },
    };
  },
};

const getFixtureBytes = (mimeType: ImageMimeType): Uint8Array => {
  if (mimeType === "image/jpeg") {
    return jpegBytes;
  }

  if (mimeType === "image/webp") {
    return webpBytes;
  }

  return pngBytes;
};

const imageFormatToMimeType = (format: unknown): ImageMimeType => {
  if (format === "jpeg" || format === "jpg") {
    return "image/jpeg";
  }

  if (format === "webp") {
    return "image/webp";
  }

  return "image/png";
};

import type { ImageMimeType } from "./types.ts";

export const imageFormatToMimeType = (format: unknown): ImageMimeType => {
  if (format === "jpeg" || format === "jpg") {
    return "image/jpeg";
  }

  if (format === "webp") {
    return "image/webp";
  }

  return "image/png";
};

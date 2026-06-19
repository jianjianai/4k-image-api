import type { ImageAsset, ImageMimeType } from "../image.ts";

const defaultMimeType: ImageMimeType = "image/png";
const supportedMimeTypes = new Set<ImageMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const getImageAssets = async (
  value: unknown,
): Promise<ImageAsset[] | undefined> => {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  return Promise.all(values.map(toImageAsset));
};

export const getOptionalImageAsset = async (
  value: unknown,
): Promise<ImageAsset | undefined> => {
  if (value === undefined) {
    return undefined;
  }

  return toImageAsset(value);
};

export const toImageAsset = async (value: unknown): Promise<ImageAsset> => {
  if (value instanceof File) {
    return {
      data: new Uint8Array(await value.arrayBuffer()),
      mimeType: normalizeImageMimeType(value.type),
      filename: value.name || undefined,
    };
  }

  if (typeof value === "string") {
    return {
      data: base64ToBytes(value),
      mimeType: defaultMimeType,
    };
  }

  throw new Error("Image file must be a multipart file or base64 string.");
};

export const normalizeImageMimeType = (value: unknown): ImageMimeType => {
  if (typeof value === "string" && supportedMimeTypes.has(value as ImageMimeType)) {
    return value as ImageMimeType;
  }

  return defaultMimeType;
};

export const bytesToBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

export const base64ToBytes = (base64: string): Uint8Array => {
  const value = base64.includes(",") ? base64.split(",").at(-1)! : base64;
  return new Uint8Array(Buffer.from(value, "base64"));
};

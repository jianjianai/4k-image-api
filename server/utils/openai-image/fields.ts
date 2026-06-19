import type { ImageResponseFormat } from "../image.ts";

export const defaultImageModel = "test-image";

export const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const getNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const getBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
};

export const getResponseFormat = (
  value: unknown,
): ImageResponseFormat | undefined => {
  if (value === "url" || value === "b64_json") {
    return value;
  }

  return undefined;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

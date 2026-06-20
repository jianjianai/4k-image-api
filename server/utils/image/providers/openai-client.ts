import OpenAI, { toFile } from "openai";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import { base64ToBytes } from "../../openai-image/assets.ts";
import type { Uploadable } from "openai/uploads";
import type { OpenAIProviderConfig } from "../provider-config.ts";
import type { ImageAsset, ImageMimeType, ImageOutput } from "../types.ts";

export type OpenAIImageClient = Pick<OpenAI, "images" | "responses">;

export const createOpenAIClient = (config: OpenAIProviderConfig): OpenAI =>
  new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization,
    project: config.project,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
  });

export const base64ImageToBytes = (base64: string): Uint8Array =>
  base64ToBytes(base64);

export const imageAssetToFile = async (asset: ImageAsset): Promise<Uploadable> =>
  toFile(asset.data, asset.filename ?? "image", {
    type: asset.mimeType,
  });

export const imageAssetToDataURL = (asset: ImageAsset): string =>
  `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`;

export const usageToImageUsage = (
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null | undefined,
): ImageOutput["usage"] => {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
};

export const imageFormatToMimeType = (format: unknown): ImageMimeType => {
  if (format === "jpeg" || format === "jpg") {
    return "image/jpeg";
  }

  if (format === "webp") {
    return "image/webp";
  }

  return "image/png";
};

export const normalizeString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const normalizeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const normalizeImageFormat = (
  value: unknown,
): "png" | "jpeg" | "webp" | undefined => {
  if (value === "png" || value === "jpeg" || value === "webp") {
    return value;
  }

  if (value === "jpg") {
    return "jpeg";
  }

  return undefined;
};

export const normalizeImageQuality = (
  value: unknown,
):
  | "standard"
  | "hd"
  | "low"
  | "medium"
  | "high"
  | "auto"
  | undefined => {
  if (
    value === "standard" ||
    value === "hd" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
  ) {
    return value;
  }

  return undefined;
};

export const normalizeResponseImageQuality = (
  value: unknown,
): "low" | "medium" | "high" | "auto" | undefined => {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
  ) {
    return value;
  }

  return undefined;
};

export const normalizeBackground = (
  value: unknown,
): "transparent" | "opaque" | "auto" | undefined => {
  if (value === "transparent" || value === "opaque" || value === "auto") {
    return value;
  }

  return undefined;
};

export const normalizeModeration = (
  value: unknown,
): "low" | "auto" | undefined => {
  if (value === "low" || value === "auto") {
    return value;
  }

  return undefined;
};

export const usesDallEImageModel = (model: unknown): boolean =>
  typeof model === "string" && model.startsWith("dall-e-");

export const missingBase64ImageDataError = (message: string): OpenAIClientError =>
  new OpenAIClientError(message);

import type { ImageInput, ImageOutput } from "./types.ts";

export const imageLog = (
  message: string,
  details: Record<string, unknown> = {},
): void => {
  console.log(`[image-api] ${message}`, sanitizeLogValue(details));
};

export const imageWarn = (
  message: string,
  details: Record<string, unknown> = {},
): void => {
  console.warn(`[image-api] ${message}`, sanitizeLogValue(details));
};

export const imageError = (
  message: string,
  details: Record<string, unknown> = {},
): void => {
  console.error(`[image-api] ${message}`, sanitizeLogValue(details));
};

export const nowMs = (): number => Date.now();

export const elapsedMs = (startedAt: number): number => Date.now() - startedAt;

export const summarizeInput = (input: ImageInput): Record<string, unknown> => ({
  action: input.action,
  model: input.model,
  size: input.size,
  n: input.n,
  quality: input.quality,
  format: input.format,
  background: input.background,
  responseFormat: input.responseFormat,
  hasPrompt: typeof input.prompt === "string" && input.prompt.length > 0,
  promptLength: typeof input.prompt === "string" ? input.prompt.length : undefined,
  imageCount: input.images?.length ?? 0,
  mask: input.mask ? summarizeAsset(input.mask) : undefined,
  images: input.images?.map(summarizeAsset),
});

export const summarizeOutput = (output: ImageOutput): Record<string, unknown> => ({
  imageCount: output.images.length,
  images: output.images.map((image) => ({
    bytes: image.bytes.byteLength,
    mimeType: image.mimeType,
    hasRevisedPrompt:
      typeof image.revisedPrompt === "string" && image.revisedPrompt.length > 0,
    revisedPromptLength:
      typeof image.revisedPrompt === "string"
        ? image.revisedPrompt.length
        : undefined,
  })),
  usage: output.usage,
});

export const summarizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    const withMetadata = error as Error & {
      status?: unknown;
      code?: unknown;
      param?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      status: withMetadata.status,
      code: withMetadata.code,
      param: withMetadata.param,
    };
  }

  return {
    message: String(error),
  };
};

export const summarizeURL = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
};

const summarizeAsset = (asset: {
  data: Uint8Array;
  mimeType: string;
  filename?: string;
}): Record<string, unknown> => ({
  bytes: asset.data.byteLength,
  mimeType: asset.mimeType,
  filename: asset.filename,
});

const sanitizeLogValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeLogValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = sanitizeLogValue(item);
  }

  return sanitized;
};

const isSensitiveKey = (key: string): boolean =>
  /key|secret|token|authorization|signature|password|credential/i.test(key);

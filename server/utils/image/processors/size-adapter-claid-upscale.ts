import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import {
  elapsedMs,
  imageError,
  imageLog,
  imageWarn,
  nowMs,
  summarizeError,
  summarizeURL,
} from "../logger.ts";
import type { ClaidUpscaleSizeAdapterConfig } from "../provider-config.ts";
import type { ImageInput, ImageMimeType, ImageProcessor } from "../types.ts";
import {
  adaptInputSize,
  formatImageSize,
  getSizeAdapterState,
  parseImageSize,
} from "./size-adapter.ts";

const defaultBaseURL = "https://api.claid.ai/v1/image/edit/upload";
const defaultUpscaleType = "smart_enhance";

type ClaidResizing = {
  width: number | "auto";
  height: number | "auto";
  fit: "bounds";
};

export const createClaidUpscaleSizeAdapter = (
  config: ClaidUpscaleSizeAdapterConfig,
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
      imageLog("claid size adapter skipped", {
        processorId: config.id,
        reason: "missing target size",
      });
      return output;
    }

    const images = await Promise.all(
      output.images.map(async (image) => {
        try {
          const request = await prepareClaidRequest(image.bytes, target, config);

          if (!request) {
            return image;
          }

          const result = await upscaleImage(
            image.bytes,
            image.mimeType,
            config,
            request,
          );

          return {
            ...image,
            bytes: result.bytes,
            mimeType: result.mimeType,
          };
        } catch (error) {
          imageWarn("claid size adapter returned original image", {
            processorId: config.id,
            reason: "post-generation processing failed",
            error: summarizeError(error),
          });
          return image;
        }
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

const getOutputTarget = (input: ImageInput): { width: number; height: number } | undefined =>
  getSizeAdapterState(input)?.target ?? parseImageSize(input.size);

const prepareClaidRequest = async (
  bytes: Uint8Array,
  target: { width: number; height: number },
  config: ClaidUpscaleSizeAdapterConfig,
): Promise<{
  resizing: ClaidResizing;
  actualSize: { width: number; height: number };
} | undefined> => {
  const actualSize = await getImageSize(bytes);

  if (satisfiesTarget(actualSize, target)) {
    imageLog("claid size adapter skipped", {
      processorId: config.id,
      reason: "actual output already satisfies requested size",
      actualSize: formatImageSize(actualSize),
      targetSize: formatImageSize(target),
    });
    return undefined;
  }

  const resizing = getClaidResizing(actualSize, target);

  imageLog("claid size adapter planned", {
    processorId: config.id,
    actualSize: formatImageSize(actualSize),
    targetSize: formatImageSize(target),
    resizing,
    upscaleType: config.upscaleType ?? defaultUpscaleType,
  });

  return {
    resizing,
    actualSize,
  };
};

const getImageSize = async (
  bytes: Uint8Array,
): Promise<{ width: number; height: number }> => {
  const metadata = await sharp(bytes).metadata();

  if (
    typeof metadata.width === "number" &&
    Number.isFinite(metadata.width) &&
    typeof metadata.height === "number" &&
    Number.isFinite(metadata.height)
  ) {
    return {
      width: metadata.width,
      height: metadata.height,
    };
  }

  throw new OpenAIClientError("Claid size adapter could not read image dimensions.");
};

const satisfiesTarget = (
  actualSize: { width: number; height: number },
  target: { width: number; height: number },
): boolean =>
  actualSize.width >= target.width &&
  actualSize.height >= target.height;

const getClaidResizing = (
  actualSize: { width: number; height: number },
  target: { width: number; height: number },
): ClaidResizing => {
  const widthScale = target.width / actualSize.width;
  const heightScale = target.height / actualSize.height;

  return widthScale >= heightScale
    ? {
        width: target.width,
        height: "auto",
        fit: "bounds",
      }
    : {
        width: "auto",
        height: target.height,
        fit: "bounds",
      };
};

const upscaleImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  config: ClaidUpscaleSizeAdapterConfig,
  request: {
    resizing: ClaidResizing;
    actualSize: { width: number; height: number };
  },
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const startedAt = nowMs();
  const requestURL = config.baseURL ?? defaultBaseURL;

  try {
    imageLog("claid upscale request", {
      processorId: config.id,
      url: summarizeURL(requestURL),
      upscaleType: config.upscaleType ?? defaultUpscaleType,
      resizing: request.resizing,
      actualSize: formatImageSize(request.actualSize),
      inputBytes: bytes.byteLength,
      inputMimeType: mimeType,
    });

    const multipart = createMultipartRequest(
      bytes,
      mimeType,
      createClaidPayload(config, request),
    );
    const response = await fetchWithTimeout(
      requestURL,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
        },
        body: multipart.body,
      },
      config.timeoutMs,
    );

    if (!response.ok) {
      imageError("claid upscale failed", {
        processorId: config.id,
        url: summarizeURL(requestURL),
        status: response.status,
        elapsedMs: elapsedMs(startedAt),
      });
      throw new OpenAIClientError(
        `Claid size adapter request failed with status ${response.status}.`,
        {
          code: "invalid_request",
          status: response.status,
        },
      );
    }

    const payload = (await response.json()) as unknown;
    const imageURL = getClaidOutputURL(payload);

    imageLog("claid upscale response", {
      processorId: config.id,
      elapsedMs: elapsedMs(startedAt),
      outputURL: summarizeURL(imageURL),
    });

    if (!imageURL) {
      throw new OpenAIClientError(
        "Claid size adapter response did not include an output image URL.",
      );
    }

    return downloadImage(imageURL, mimeType, config.timeoutMs);
  } catch (error) {
    imageError("claid upscale failed", {
      processorId: config.id,
      url: summarizeURL(requestURL),
      elapsedMs: elapsedMs(startedAt),
      error: summarizeError(error),
    });
    throw error;
  }
};

const createMultipartRequest = (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  payload: unknown,
): { boundary: string; body: Blob } => {
  const boundary = `----4k-image-api-claid-${randomId()}`;
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const json = JSON.stringify(payload);
  const filename = getInputFilename(mimeType);

  return {
    boundary,
    body: new Blob([
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
      body,
      `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="data"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${json}\r\n` +
        `--${boundary}--\r\n`,
    ]),
  };
};

const randomId = (): string =>
  randomUUID();


const createClaidPayload = (
  config: ClaidUpscaleSizeAdapterConfig,
  request: { resizing: ClaidResizing },
): Record<string, unknown> => ({
  operations: {
    restorations: {
      upscale: config.upscaleType ?? defaultUpscaleType,
    },
    resizing: request.resizing,
  },
});

const getInputFilename = (mimeType: ImageMimeType): string => {
  if (mimeType === "image/jpeg") {
    return "image.jpg";
  }

  if (mimeType === "image/webp") {
    return "image.webp";
  }

  return "image.png";
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
): Promise<Response> => {
  if (timeoutMs === undefined) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const getClaidOutputURL = (payload: unknown): string | undefined => {
  if (!isObject(payload)) {
    return undefined;
  }

  const data = payload.data;

  if (!isObject(data)) {
    return undefined;
  }

  const output = data.output;

  if (!isObject(output)) {
    return undefined;
  }

  return typeof output.tmp_url === "string" ? output.tmp_url : undefined;
};

const downloadImage = async (
  url: string,
  fallbackMimeType: ImageMimeType,
  timeoutMs: number | undefined,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const startedAt = nowMs();

  imageLog("claid output download request", {
    url: summarizeURL(url),
  });
  const response = await fetchWithTimeout(url, {}, timeoutMs);

  if (!response.ok) {
    imageError("claid output download failed", {
      url: summarizeURL(url),
      status: response.status,
      elapsedMs: elapsedMs(startedAt),
    });
    throw new OpenAIClientError(
      `Claid size adapter output download failed with status ${response.status}.`,
      {
        code: "invalid_request",
        status: response.status,
      },
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = normalizeMimeType(
    response.headers.get("content-type"),
    fallbackMimeType,
  );

  imageLog("claid output download response", {
    url: summarizeURL(url),
    status: response.status,
    elapsedMs: elapsedMs(startedAt),
    bytes: bytes.byteLength,
    mimeType,
  });

  return {
    bytes,
    mimeType,
  };
};

const normalizeMimeType = (
  value: string | null,
  fallbackMimeType: ImageMimeType,
): ImageMimeType => {
  const mimeType = value?.split(";")[0]?.trim();

  if (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
  ) {
    return mimeType;
  }

  return fallbackMimeType;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

import { bytesToBase64 } from "../../openai-image/assets.ts";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import sharp from "sharp";
import {
  elapsedMs,
  imageError,
  imageLog,
  imageWarn,
  nowMs,
  summarizeError,
  summarizeURL,
} from "../logger.ts";
import type { ModelslabRealEsrganSizeAdapterConfig } from "../provider-config.ts";
import type { ImageInput, ImageMimeType, ImageProcessor } from "../types.ts";
import {
  fitWithin,
  fitsWithin,
  formatImageSize,
  getSizeAdapterState,
  parseImageSize,
  withSizeAdapterState,
} from "./size-adapter.ts";

const defaultBaseURL = "https://modelslab.com/api/v6/image_editing/super_resolution";
const scale2ModelId = "RealESRGAN_x2plus";
const generalModelId = "realesr-general-x4v3";
export const createModelslabRealEsrganSizeAdapter = (
  config: ModelslabRealEsrganSizeAdapterConfig,
): ImageProcessor => ({
  id: config.id,
  type: config.type,
  processInput: (input) => adaptModelslabInputSize(input, config),
  processOutput: async (output, input) => {
    const target = getOutputTarget(input);

    if (!target) {
      imageLog("modelslab size adapter skipped", {
        processorId: config.id,
        reason: "missing target size",
      });
      return output;
    }

    const images = await Promise.all(
      output.images.map(async (image) => {
        try {
          const request = await prepareModelslabRequest(
            image.bytes,
            image.mimeType,
            target,
            config,
          );

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
          imageWarn("modelslab size adapter returned original image", {
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

const adaptModelslabInputSize = (
  input: ImageInput,
  config: ModelslabRealEsrganSizeAdapterConfig,
): ImageInput => {
  const requestedSize = parseImageSize(input.size);

  if (
    !requestedSize ||
    fitsWithin(requestedSize, {
      width: config.maxWidth,
      height: config.maxHeight,
      maxPixels: config.maxPixels,
    })
  ) {
    return input;
  }

  const maxSize = {
    width: config.maxWidth,
    height: config.maxHeight,
    maxPixels: config.maxPixels,
  };
  const adaptedSize = fitWithin(requestedSize, maxSize);
  const plannedScale = getOutputScale(adaptedSize, requestedSize);

  imageLog("modelslab size adapter planned", {
    processorId: config.id,
    originalSize: input.size,
    adaptedSize: formatImageSize(adaptedSize),
    modelId: getModelIdForScale(plannedScale, config),
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    maxPixels: config.maxPixels,
  });

  return withSizeAdapterState(input, {
    originalSize: input.size!,
    adaptedSize: formatImageSize(adaptedSize),
    target: requestedSize,
    modelId: getModelIdForScale(plannedScale, config),
  });
};

const getOutputTarget = (input: ImageInput): { width: number; height: number } | undefined =>
  getSizeAdapterState(input)?.target ?? parseImageSize(input.size);

const getModelIdForScale = (
  scale: number,
  config: ModelslabRealEsrganSizeAdapterConfig,
): NonNullable<ModelslabRealEsrganSizeAdapterConfig["modelId"]> => {
  if (config.modelId !== undefined) {
    return config.modelId;
  }

  const configuredModelId = config.modelByScale?.[String(scale) as "2" | "3" | "4"];

  if (configuredModelId !== undefined) {
    return configuredModelId;
  }

  return scale <= 2 ? scale2ModelId : generalModelId;
};

const prepareModelslabRequest = async (
  bytes: Uint8Array,
  _mimeType: ImageMimeType,
  target: { width: number; height: number },
  config: ModelslabRealEsrganSizeAdapterConfig,
): Promise<{
  modelId: string;
  scale: number;
} | undefined> => {
  const actualSize = await getImageSize(bytes);

  if (
    actualSize.width >= target.width &&
    actualSize.height >= target.height
  ) {
    imageLog("modelslab size adapter skipped", {
      processorId: config.id,
      reason: "actual output already satisfies requested size",
      actualSize: formatImageSize(actualSize),
      targetSize: formatImageSize(target),
    });
    return undefined;
  }

  const scale = getOutputScale(actualSize, target);

  return {
    modelId: config.modelId ?? getModelIdForScale(scale, config),
    scale,
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

  throw new OpenAIClientError("Modelslab size adapter could not read image dimensions.");
};

const getOutputScale = (
  actualSize: { width: number; height: number },
  target: { width: number; height: number },
): number => {
  return Math.min(4, Math.max(2, chooseScaleForSize(actualSize, target, 2)));
};

const chooseScaleForSize = (
  source: { width: number; height: number },
  target: { width: number; height: number },
  minScale: number,
): number =>
  Math.max(
    minScale,
    Math.ceil(target.width / source.width),
    Math.ceil(target.height / source.height),
  );

const upscaleImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  config: ModelslabRealEsrganSizeAdapterConfig,
  request: {
    modelId: string;
    scale: number;
  },
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const startedAt = nowMs();
  const requestURL = config.baseURL ?? defaultBaseURL;

  try {
    imageLog("modelslab super resolution request", {
      processorId: config.id,
      url: summarizeURL(requestURL),
      modelId: request.modelId,
      scale: request.scale,
      faceEnhance: config.faceEnhance ?? false,
      inputBytes: bytes.byteLength,
      inputMimeType: mimeType,
    });
    const response = await fetch(requestURL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: config.apiKey,
        init_image: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
        model_id: request.modelId,
        scale: request.scale,
        face_enhance: config.faceEnhance ?? false,
      }),
    });

    if (!response.ok) {
      imageError("modelslab super resolution failed", {
        processorId: config.id,
        url: summarizeURL(requestURL),
        status: response.status,
        elapsedMs: elapsedMs(startedAt),
      });
      throw new OpenAIClientError(
        `Modelslab size adapter request failed with status ${response.status}.`,
        {
          code: "invalid_request",
          status: response.status,
        },
      );
    }

    const payload = (await response.json()) as unknown;
    const imageURL = getModelslabOutputURL(payload);

    imageLog("modelslab super resolution response", {
      processorId: config.id,
      elapsedMs: elapsedMs(startedAt),
      outputURL: summarizeURL(imageURL),
    });

    if (!imageURL) {
      throw new OpenAIClientError(
        "Modelslab size adapter response did not include an output image URL.",
      );
    }

    return downloadImage(imageURL);
  } catch (error) {
    imageError("modelslab super resolution failed", {
      processorId: config.id,
      url: summarizeURL(requestURL),
      elapsedMs: elapsedMs(startedAt),
      error: summarizeError(error),
    });
    throw error;
  }
};

const getModelslabOutputURL = (payload: unknown): string | undefined => {
  if (!isObject(payload)) {
    return undefined;
  }

  if (typeof payload.output === "string") {
    return payload.output;
  }

  if (
    Array.isArray(payload.output) &&
    typeof payload.output[0] === "string"
  ) {
    return payload.output[0];
  }

  if (typeof payload.proxy_links === "string") {
    return payload.proxy_links;
  }

  if (
    Array.isArray(payload.proxy_links) &&
    typeof payload.proxy_links[0] === "string"
  ) {
    return payload.proxy_links[0];
  }

  return undefined;
};

const downloadImage = async (
  url: string,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const startedAt = nowMs();

  imageLog("modelslab output download request", {
    url: summarizeURL(url),
  });
  const response = await fetch(url);

  if (!response.ok) {
    imageError("modelslab output download failed", {
      url: summarizeURL(url),
      status: response.status,
      elapsedMs: elapsedMs(startedAt),
    });
    throw new OpenAIClientError(
      `Modelslab size adapter output download failed with status ${response.status}.`,
      {
        code: "invalid_request",
        status: response.status,
      },
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = normalizeMimeType(response.headers.get("content-type"));

  imageLog("modelslab output download response", {
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

const normalizeMimeType = (value: string | null): ImageMimeType => {
  const mimeType = value?.split(";")[0]?.trim();

  if (mimeType === "image/jpeg" || mimeType === "image/webp") {
    return mimeType;
  }

  return "image/png";
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

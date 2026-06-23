import { bytesToBase64 } from "../../openai-image/assets.ts";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import {
  elapsedMs,
  imageError,
  imageLog,
  nowMs,
  summarizeURL,
} from "../logger.ts";
import type { ModelslabRealEsrganSizeAdapterConfig } from "../provider-config.ts";
import type { ImageInput, ImageMimeType, ImageProcessor } from "../types.ts";
import {
  formatImageSize,
  getSizeAdapterState,
  parseImageSize,
  withSizeAdapterState,
} from "./size-adapter.ts";

const defaultBaseURL = "https://modelslab.com/api/v6/image_editing/super_resolution";
const scale2ModelId = "RealESRGAN_x2plus";
const generalModelId = "realesr-general-x4v3";
const defaultScales = [2, 3, 4] as const;

export const createModelslabRealEsrganSizeAdapter = (
  config: ModelslabRealEsrganSizeAdapterConfig,
): ImageProcessor => ({
  id: config.id,
  type: config.type,
  processInput: (input) => adaptModelslabInputSize(input, config),
  processOutput: async (output, input) => {
    const state = getSizeAdapterState(input);

    if (!state) {
      imageLog("modelslab size adapter skipped", {
        processorId: config.id,
        reason: "input size within max size or missing size",
      });
      return output;
    }

    return {
      ...output,
      images: await Promise.all(
        output.images.map(async (image) => {
          const result = await upscaleImage(image.bytes, image.mimeType, config, {
            modelId: state.modelId ?? getModelIdForScale(state.scale ?? 4, config),
            scale: state.scale ?? 4,
          });

          return {
            ...image,
            bytes: result.bytes,
            mimeType: result.mimeType,
          };
        }),
      ),
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
  const plan = chooseUpscalePlan(requestedSize, maxSize, config);

  imageLog("modelslab size adapter planned", {
    processorId: config.id,
    originalSize: input.size,
    adaptedSize: formatImageSize(plan.adaptedSize),
    scale: plan.scale,
    modelId: getModelIdForScale(plan.scale, config),
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    maxPixels: config.maxPixels,
  });

  return withSizeAdapterState(input, {
    originalSize: input.size!,
    adaptedSize: formatImageSize(plan.adaptedSize),
    target: requestedSize,
    scale: plan.scale,
    modelId: getModelIdForScale(plan.scale, config),
  });
};

const chooseUpscalePlan = (
  size: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
  config: ModelslabRealEsrganSizeAdapterConfig,
): {
  scale: number;
  adaptedSize: { width: number; height: number };
} => {
  const scales = config.scale === undefined ? defaultScales : [config.scale];

  for (const scale of scales) {
    const adaptedSize = getExactScaledSize(size, scale);

    if (adaptedSize && fitsWithin(adaptedSize, maxSize)) {
      return { scale, adaptedSize };
    }
  }

  throw new OpenAIClientError(
    `Requested image size '${formatImageSize(size)}' cannot be produced by Modelslab size adapter without a final resize. Use a size divisible by ${scales.join(", ")} and within configured max size after scaling.`,
    {
      code: "invalid_request",
      param: "size",
    },
  );
};

const getExactScaledSize = (
  size: { width: number; height: number },
  scale: number,
): { width: number; height: number } | undefined => {
  if (
    !Number.isInteger(scale) ||
    scale <= 1 ||
    size.width % scale !== 0 ||
    size.height % scale !== 0
  ) {
    return undefined;
  }

  return {
    width: size.width / scale,
    height: size.height / scale,
  };
};

const fitsWithin = (
  size: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
): boolean =>
  size.width <= maxSize.width &&
  size.height <= maxSize.height &&
  (maxSize.maxPixels === undefined ||
    size.width * size.height <= maxSize.maxPixels);

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

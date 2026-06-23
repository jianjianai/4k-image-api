import { Readable } from "node:stream";
import AliyunImageEnhancement, {
  MakeSuperResolutionImageAdvanceRequest,
} from "@alicloud/imageenhan20190930";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import {
  elapsedMs,
  imageError,
  imageLog,
  nowMs,
  summarizeError,
  summarizeURL,
} from "../logger.ts";
import type { AliyunSuperResolutionSizeAdapterConfig } from "../provider-config.ts";
import type { ImageInput, ImageMimeType, ImageProcessor } from "../types.ts";
import {
  formatImageSize,
  getSizeAdapterState,
  parseImageSize,
  withSizeAdapterState,
} from "./size-adapter.ts";

const defaultRegionId = "cn-shanghai";
const defaultScales = [1, 2, 3, 4] as const;

type AliyunImageEnhancementClient = {
  makeSuperResolutionImageAdvance: (
    request: MakeSuperResolutionImageAdvanceRequest,
    runtime: { readTimeout?: number; connectTimeout?: number },
  ) => Promise<{ body?: { data?: { url?: string } } }>;
};

type AliyunImageEnhancementClientConstructor = new (config: {
  accessKeyId: string;
  accessKeySecret: string;
  regionId: string;
  endpoint?: string;
}) => AliyunImageEnhancementClient;

export const createAliyunSuperResolutionSizeAdapter = (
  config: AliyunSuperResolutionSizeAdapterConfig,
): ImageProcessor => ({
  id: config.id,
  type: config.type,
  processInput: (input) => adaptAliyunInputSize(input, config),
  processOutput: async (output, input) => {
    const state = getSizeAdapterState(input);

    if (!state) {
      imageLog("aliyun size adapter skipped", {
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
            scale: state.scale ?? config.scale ?? 4,
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

const adaptAliyunInputSize = (
  input: ImageInput,
  config: AliyunSuperResolutionSizeAdapterConfig,
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

  imageLog("aliyun size adapter planned", {
    processorId: config.id,
    originalSize: input.size,
    adaptedSize: formatImageSize(plan.adaptedSize),
    scale: plan.scale,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    maxPixels: config.maxPixels,
  });

  return withSizeAdapterState(input, {
    originalSize: input.size!,
    adaptedSize: formatImageSize(plan.adaptedSize),
    target: requestedSize,
    scale: plan.scale,
  });
};

const chooseUpscalePlan = (
  size: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
  config: AliyunSuperResolutionSizeAdapterConfig,
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
    `Requested image size '${formatImageSize(size)}' cannot be produced by Aliyun size adapter without a final resize. Use a size divisible by ${scales.join(", ")} and within configured max size after scaling.`,
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
    scale < 1 ||
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

const upscaleImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  config: AliyunSuperResolutionSizeAdapterConfig,
  request: { scale: number },
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const startedAt = nowMs();
  const client = createAliyunClient(config);
  let imageURL: string | undefined;

  try {
    imageLog("aliyun super resolution request", {
      processorId: config.id,
      regionId: config.regionId ?? defaultRegionId,
      endpoint: config.endpoint,
      scale: request.scale,
      mode: config.mode,
      outputFormat: config.outputFormat,
      outputQuality: config.outputQuality,
      inputBytes: bytes.byteLength,
      inputMimeType: mimeType,
    });
    const response = await client.makeSuperResolutionImageAdvance(
      new MakeSuperResolutionImageAdvanceRequest({
        mode: config.mode,
        outputFormat: config.outputFormat,
        outputQuality: config.outputQuality,
        upscaleFactor: request.scale,
        urlObject: Readable.from(Buffer.from(bytes)),
      }),
      {
        connectTimeout: config.timeoutMs,
        readTimeout: config.timeoutMs,
      },
    );
    imageURL = response.body?.data?.url;

    imageLog("aliyun super resolution response", {
      processorId: config.id,
      elapsedMs: elapsedMs(startedAt),
      outputURL: summarizeURL(imageURL),
    });
  } catch (error) {
    imageError("aliyun super resolution failed", {
      processorId: config.id,
      elapsedMs: elapsedMs(startedAt),
      error: summarizeError(error),
    });
    throw error;
  }

  if (!imageURL) {
    throw new OpenAIClientError(
      "Aliyun size adapter response did not include an output image URL.",
    );
  }

  return downloadImage(imageURL, mimeType);
};

const createAliyunClient = (
  config: AliyunSuperResolutionSizeAdapterConfig,
): AliyunImageEnhancementClient => {
  const Client = getAliyunImageEnhancementClientConstructor();

  return new Client({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    regionId: config.regionId ?? defaultRegionId,
    endpoint: config.endpoint,
  });
};

const getAliyunImageEnhancementClientConstructor =
  (): AliyunImageEnhancementClientConstructor => {
    const exported = AliyunImageEnhancement as unknown as {
      default?: AliyunImageEnhancementClientConstructor;
    };

    return (
      exported.default ??
      (AliyunImageEnhancement as unknown as AliyunImageEnhancementClientConstructor)
    );
  };

const downloadImage = async (
  url: string,
  fallbackMimeType: ImageMimeType,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const startedAt = nowMs();

  imageLog("aliyun output download request", {
    url: summarizeURL(url),
  });
  const response = await fetch(url);

  if (!response.ok) {
    imageError("aliyun output download failed", {
      url: summarizeURL(url),
      status: response.status,
      elapsedMs: elapsedMs(startedAt),
    });
    throw new OpenAIClientError(
      `Aliyun size adapter output download failed with status ${response.status}.`,
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

  imageLog("aliyun output download response", {
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

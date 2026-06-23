import { Readable } from "node:stream";
import AliyunImageEnhancement, {
  MakeSuperResolutionImageAdvanceRequest,
} from "@alicloud/imageenhan20190930";
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
const aliyunMaxInputSize = {
  width: 1920,
  height: 1080,
  maxPixels: 1920 * 1080,
};

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
          try {
            const inputImage = await prepareAliyunInputImage(
              image.bytes,
              image.mimeType,
              state,
              config,
            );

            if (inputImage.scale <= 1) {
              return image;
            }

            const result = await upscaleImage(
              inputImage.bytes,
              inputImage.mimeType,
              config,
              { scale: inputImage.scale },
            );

            return {
              ...image,
              bytes: result.bytes,
              mimeType: result.mimeType,
            };
          } catch (error) {
            imageWarn("aliyun size adapter returned original image", {
              processorId: config.id,
              reason: "post-generation processing failed",
              error: summarizeError(error),
            });
            return image;
          }
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
  const maxSize = getConfiguredAliyunInputMaxSize(config);

  if (
    !requestedSize ||
    fitsWithin(requestedSize, maxSize)
  ) {
    return input;
  }

  const plan = chooseUpscalePlan(requestedSize, maxSize, config);

  imageLog("aliyun size adapter planned", {
    processorId: config.id,
    originalSize: input.size,
    adaptedSize: formatImageSize(plan.adaptedSize),
    scale: plan.scale,
    maxWidth: maxSize.width,
    maxHeight: maxSize.height,
    maxPixels: maxSize.maxPixels,
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

const prepareAliyunInputImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  state: NonNullable<ReturnType<typeof getSizeAdapterState>>,
  config: AliyunSuperResolutionSizeAdapterConfig,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
  scale: number;
}> => {
  const actualSize = await getImageSize(bytes);
  const scale = getOutputScale(actualSize, state, config);
  const maxSize = getOutputAliyunInputMaxSize(state, config, scale);

  if (fitsWithin(actualSize, maxSize)) {
    return { bytes, mimeType, scale };
  }

  const adaptedSize = fitWithin(actualSize, maxSize);

  imageLog("aliyun output image resized", {
    processorId: config.id,
    originalSize: formatImageSize(actualSize),
    adaptedSize: formatImageSize(adaptedSize),
    scale,
    maxWidth: maxSize.width,
    maxHeight: maxSize.height,
    maxPixels: maxSize.maxPixels,
  });

  return {
    ...(await resizeImage(bytes, mimeType, adaptedSize)),
    scale,
  };
};

const getOutputScale = (
  actualSize: { width: number; height: number },
  state: NonNullable<ReturnType<typeof getSizeAdapterState>>,
  config: AliyunSuperResolutionSizeAdapterConfig,
): number => {
  if (
    actualSize.width >= state.target.width &&
    actualSize.height >= state.target.height
  ) {
    return 1;
  }

  if (config.scale !== undefined) {
    return config.scale;
  }

  const scale = Math.max(
    state.scale ?? 1,
    Math.ceil(state.target.width / actualSize.width),
    Math.ceil(state.target.height / actualSize.height),
  );

  return Math.min(4, Math.max(1, scale));
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

  throw new OpenAIClientError("Aliyun size adapter could not read image dimensions.");
};

const getOutputAliyunInputMaxSize = (
  state: NonNullable<ReturnType<typeof getSizeAdapterState>>,
  config: AliyunSuperResolutionSizeAdapterConfig,
  scale: number,
): { width: number; height: number; maxPixels?: number } => {
  const configuredMaxSize = getConfiguredAliyunInputMaxSize(config);
  const scaledTargetMaxSize = {
    width: Math.max(1, Math.floor(state.target.width / scale)),
    height: Math.max(1, Math.floor(state.target.height / scale)),
    maxPixels: Math.max(
      1,
      Math.floor((state.target.width * state.target.height) / (scale * scale)),
    ),
  };

  return minMaxSize(configuredMaxSize, scaledTargetMaxSize);
};

const getConfiguredAliyunInputMaxSize = (
  config: AliyunSuperResolutionSizeAdapterConfig,
): { width: number; height: number; maxPixels?: number } => ({
  width: Math.min(config.maxWidth, aliyunMaxInputSize.width),
  height: Math.min(config.maxHeight, aliyunMaxInputSize.height),
  maxPixels: minOptionalNumber(config.maxPixels, aliyunMaxInputSize.maxPixels),
});

const minMaxSize = (
  first: { width: number; height: number; maxPixels?: number },
  second: { width: number; height: number; maxPixels?: number },
): { width: number; height: number; maxPixels?: number } => ({
  width: Math.min(first.width, second.width),
  height: Math.min(first.height, second.height),
  maxPixels: minOptionalNumber(first.maxPixels, second.maxPixels),
});

const minOptionalNumber = (
  ...values: Array<number | undefined>
): number | undefined => {
  const numbers = values.filter((value): value is number => value !== undefined);

  if (numbers.length === 0) {
    return undefined;
  }

  return Math.min(...numbers);
};

const fitWithin = (
  size: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
): { width: number; height: number } => {
  const pixelScale =
    maxSize.maxPixels === undefined
      ? 1
      : Math.sqrt(maxSize.maxPixels / (size.width * size.height));
  const scale = Math.min(
    1,
    maxSize.width / size.width,
    maxSize.height / size.height,
    pixelScale,
  );

  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
};

const resizeImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  size: { width: number; height: number },
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  let pipeline = sharp(bytes).resize({
    width: size.width,
    height: size.height,
    fit: "inside",
    withoutEnlargement: true,
    kernel: sharp.kernel.lanczos3,
  });

  if (mimeType === "image/jpeg") {
    pipeline = pipeline.jpeg();
  } else if (mimeType === "image/webp") {
    pipeline = pipeline.webp();
  } else {
    pipeline = pipeline.png();
  }

  return {
    bytes: new Uint8Array(await pipeline.toBuffer()),
    mimeType,
  };
};

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

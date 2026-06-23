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
  fitWithin,
  fitsWithin,
  formatImageSize,
  getSizeAdapterState,
  parseImageSize,
  withSizeAdapterState,
} from "./size-adapter.ts";

const defaultRegionId = "cn-shanghai";
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
    const target = getOutputTarget(input);

    if (!target) {
      imageLog("aliyun size adapter skipped", {
        processorId: config.id,
        reason: "missing target size",
      });
      return output;
    }

    const images = await Promise.all(
      output.images.map(async (image) => {
        try {
          const inputImage = await prepareAliyunInputImage(
            image.bytes,
            image.mimeType,
            target,
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

const getOutputTarget = (input: ImageInput): { width: number; height: number } | undefined =>
  getSizeAdapterState(input)?.target ?? parseImageSize(input.size);

const chooseUpscalePlan = (
  size: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
  config: AliyunSuperResolutionSizeAdapterConfig,
): {
  scale: number;
  adaptedSize: { width: number; height: number };
} => {
  const adaptedSize = fitWithin(size, maxSize);
  const scale = config.scale ?? Math.min(4, chooseScaleForSize(adaptedSize, size, 1));

  return { scale, adaptedSize };
};

const prepareAliyunInputImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  target: { width: number; height: number },
  config: AliyunSuperResolutionSizeAdapterConfig,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
  scale: number;
}> => {
  const actualSize = await getImageSize(bytes);
  const maxSize = getConfiguredAliyunInputMaxSize(config);

  if (satisfiesTarget(actualSize, target)) {
    return {
      bytes,
      mimeType,
      scale: 1,
    };
  }

  if (fitsWithin(actualSize, maxSize)) {
    return {
      bytes,
      mimeType,
      scale: getOutputScale(actualSize, target, config),
    };
  }

  const resized = await resizeImageWithin(bytes, mimeType, actualSize, maxSize);
  const resizedSize = await getImageSize(resized.bytes);
  const scale = getOutputScale(resizedSize, target, config);

  imageLog("aliyun output image resized", {
    processorId: config.id,
    originalSize: formatImageSize(actualSize),
    adaptedSize: formatImageSize(resizedSize),
    scale,
    maxWidth: maxSize.width,
    maxHeight: maxSize.height,
    maxPixels: maxSize.maxPixels,
  });

  return {
    ...resized,
    scale,
  };
};

const getOutputScale = (
  actualSize: { width: number; height: number },
  target: { width: number; height: number },
  config: AliyunSuperResolutionSizeAdapterConfig,
): number => {
  if (satisfiesTarget(actualSize, target)) {
    return 1;
  }

  if (config.scale !== undefined) {
    return config.scale;
  }

  const scale = chooseScaleForSize(actualSize, target, 1);

  return Math.min(4, Math.max(1, scale));
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

const satisfiesTarget = (
  actualSize: { width: number; height: number },
  target: { width: number; height: number },
): boolean =>
  actualSize.width >= target.width &&
  actualSize.height >= target.height;

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

const getConfiguredAliyunInputMaxSize = (
  config: AliyunSuperResolutionSizeAdapterConfig,
): { width: number; height: number; maxPixels?: number } => ({
  width: Math.min(config.maxWidth, aliyunMaxInputSize.width),
  height: Math.min(config.maxHeight, aliyunMaxInputSize.height),
  maxPixels: minOptionalNumber(config.maxPixels, aliyunMaxInputSize.maxPixels),
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

const resizeImageWithin = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  actualSize: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const resize = getLargestAcceptedResizeDimension(actualSize, maxSize);
  const resized = await resizeImage(bytes, mimeType, resize);
  const resizedSize = await getImageSize(resized.bytes);

  if (fitsWithin(resizedSize, maxSize)) {
    return resized;
  }

  return resizeImage(bytes, mimeType, {
    ...fitWithin(actualSize, maxSize),
    fit: "inside",
  });
};

const getLargestAcceptedResizeDimension = (
  actualSize: { width: number; height: number },
  maxSize: { width: number; height: number; maxPixels?: number },
): { width: number } | { height: number } => {
  const widthScale = maxSize.width / actualSize.width;
  const heightScale = maxSize.height / actualSize.height;
  const pixelScale =
    maxSize.maxPixels === undefined
      ? Number.POSITIVE_INFINITY
      : Math.sqrt(maxSize.maxPixels / (actualSize.width * actualSize.height));
  const scale = Math.min(widthScale, heightScale, pixelScale);

  if (heightScale <= widthScale && heightScale <= pixelScale) {
    return { height: maxSize.height };
  }

  if (widthScale <= heightScale && widthScale <= pixelScale) {
    return { width: maxSize.width };
  }

  return {
    width: Math.max(1, Math.floor(actualSize.width * scale)),
  };
};

const resizeImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  resize:
    | { width: number }
    | { height: number }
    | { width: number; height: number; fit: "inside" },
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  let pipeline = sharp(bytes).resize({
    ...resize,
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

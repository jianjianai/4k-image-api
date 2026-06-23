import type {
  ImageEditCompletedEvent,
  ImageEditParamsStreaming,
  ImageEditStreamEvent,
  ImageGenerateParamsStreaming,
  ImageGenCompletedEvent,
  ImageGenStreamEvent,
} from "openai/resources/images";
import {
  base64ImageToBytes,
  createOpenAIClient,
  imageAssetToFile,
  imageFormatToMimeType,
  missingBase64ImageDataError,
  normalizeBackground,
  normalizeImageFormat,
  normalizeImageQuality,
  normalizeModeration,
  normalizeNumber,
  normalizeString,
  usageToImageUsage,
  usesDallEImageModel,
  type OpenAIImageClient,
} from "./openai-client.ts";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import {
  elapsedMs,
  imageError,
  imageLog,
  nowMs,
  summarizeError,
} from "../logger.ts";
import type { OpenAIImagesProviderConfig } from "../provider-config.ts";
import type { ImageInput, ImageOutput, ImageProvider } from "../types.ts";

export const createOpenAIImageGenerationProvider = (
  config: OpenAIImagesProviderConfig,
  client: OpenAIImageClient = createOpenAIClient(config),
): ImageProvider => ({
  id: config.id,
  type: config.type,
  models: config.models,
  actionSupports: ["generate", "edit"],
  processorId: config.processor,
  invoke: async (input) => {
    const startedAt = nowMs();

    try {
      imageLog("openai images request", {
        providerId: config.id,
        action: input.action,
        baseURL: config.baseURL,
        model: input.model,
        size: input.size,
        imageCount: input.images?.length ?? 0,
        hasMask: Boolean(input.mask),
      });

      assertStreamingImageModel(input);

      if (input.action === "edit") {
        const stream = await client.images.edit(await toImageEditParams(input));
        const output = await imagesStreamToImageOutput(stream, input);

        imageLog("openai images response", {
          providerId: config.id,
          action: input.action,
          elapsedMs: elapsedMs(startedAt),
          imageCount: output.images.length,
        });

        return output;
      }

      const stream = await client.images.generate(toImageGenerateParams(input));
      const output = await imagesStreamToImageOutput(stream, input);

      imageLog("openai images response", {
        providerId: config.id,
        action: input.action,
        elapsedMs: elapsedMs(startedAt),
        imageCount: output.images.length,
      });

      return output;
    } catch (error) {
      imageError("openai images failed", {
        providerId: config.id,
        action: input.action,
        elapsedMs: elapsedMs(startedAt),
        error: summarizeError(error),
      });
      throw error;
    }
  },
});

const toImageGenerateParams = (
  input: ImageInput,
): ImageGenerateParamsStreaming => ({
  prompt: input.prompt ?? "",
  model: input.model,
  n: input.n,
  size: input.size,
  quality: normalizeImageQuality(input.quality),
  background: normalizeBackground(input.background),
  output_format: normalizeImageFormat(input.format),
  moderation: normalizeModeration(input.options?.moderation),
  output_compression: normalizeNumber(input.options?.outputCompression),
  partial_images: normalizeNumber(input.options?.partialImages),
  user: normalizeString(input.options?.user),
  stream: true,
});

const toImageEditParams = async (
  input: ImageInput,
): Promise<ImageEditParamsStreaming> => ({
  image: await imageAssetsToFiles(input.images),
  prompt: input.prompt ?? "",
  mask: input.mask ? await imageAssetToFile(input.mask) : undefined,
  model: input.model,
  n: input.n,
  size: input.size,
  quality: normalizeEditImageQuality(input.quality),
  background: normalizeBackground(input.background),
  output_format: normalizeImageFormat(input.format),
  input_fidelity: normalizeInputFidelity(input.options?.inputFidelity),
  output_compression: normalizeNumber(input.options?.outputCompression),
  partial_images: normalizeNumber(input.options?.partialImages),
  response_format: input.responseFormat,
  user: normalizeString(input.options?.user),
  stream: true,
});

const imageAssetsToFiles = async (
  assets: ImageInput["images"],
) => Promise.all((assets ?? []).map(imageAssetToFile));

const normalizeInputFidelity = (
  value: unknown,
): "high" | "low" | undefined => {
  if (value === "high" || value === "low") {
    return value;
  }

  return undefined;
};

const normalizeEditImageQuality = (
  value: unknown,
): "standard" | "low" | "medium" | "high" | "auto" | undefined => {
  const quality = normalizeImageQuality(value);

  return quality === "hd" ? undefined : quality;
};

type OpenAIImagesStreamEvent = ImageGenStreamEvent | ImageEditStreamEvent;

type OpenAIImagesCompletedEvent =
  | ImageGenCompletedEvent
  | ImageEditCompletedEvent;

const imagesStreamToImageOutput = async (
  stream: AsyncIterable<OpenAIImagesStreamEvent>,
  input: ImageInput,
): Promise<ImageOutput> => {
  const raw: OpenAIImagesStreamEvent[] = [];
  const completedEvents: OpenAIImagesCompletedEvent[] = [];
  let latestPartialEvent: OpenAIImagesStreamEvent | undefined;

  for await (const event of stream) {
    raw.push(event);

    if (isCompletedImageEvent(event)) {
      completedEvents.push(event);
      continue;
    }

    if (isPartialImageEvent(event)) {
      latestPartialEvent = event;
    }
  }

  const imageEvents =
    completedEvents.length > 0
      ? completedEvents
      : latestPartialEvent
        ? [latestPartialEvent]
        : [];

  if (imageEvents.length === 0) {
    throw new OpenAIClientError("OpenAI image stream did not include image data.");
  }

  return {
    images: imageEvents.map((event) => {
      if (!event.b64_json) {
        throw missingBase64ImageDataError(
          "OpenAI image stream did not include base64 image data.",
        );
      }

      return {
        bytes: base64ImageToBytes(event.b64_json),
        mimeType: imageFormatToMimeType(event.output_format ?? input.format),
      };
    }),
    usage: usageToImageUsage(
      completedEvents[completedEvents.length - 1]?.usage,
    ),
    raw,
  };
};

const isCompletedImageEvent = (
  event: OpenAIImagesStreamEvent,
): event is OpenAIImagesCompletedEvent =>
  event.type === "image_generation.completed" ||
  event.type === "image_edit.completed";

const isPartialImageEvent = (event: OpenAIImagesStreamEvent): boolean =>
  event.type === "image_generation.partial_image" ||
  event.type === "image_edit.partial_image";

const assertStreamingImageModel = (input: ImageInput): void => {
  if (!usesDallEImageModel(input.model)) {
    return;
  }

  throw new OpenAIClientError(
    "OpenAI Images streaming is not supported for DALL-E image models.",
    {
      param: "model",
    },
  );
};

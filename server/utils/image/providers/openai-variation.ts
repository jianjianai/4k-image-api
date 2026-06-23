import type { ImageCreateVariationParams, ImagesResponse } from "openai/resources/images";
import {
  base64ImageToBytes,
  createOpenAIClient,
  imageAssetToFile,
  imageFormatToMimeType,
  missingBase64ImageDataError,
  normalizeString,
  usageToImageUsage,
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
import type { OpenAIVariationProviderConfig } from "../provider-config.ts";
import type { ImageInput, ImageOutput, ImageProvider } from "../types.ts";

export const createOpenAIImageVariationProvider = (
  config: OpenAIVariationProviderConfig,
  client: OpenAIImageClient = createOpenAIClient(config),
): ImageProvider => ({
  id: config.id,
  type: config.type,
  models: config.models,
  actionSupports: ["variation"],
  processorId: config.processor,
  invoke: async (input) => {
    const startedAt = nowMs();

    try {
      imageLog("openai variation request", {
        providerId: config.id,
        baseURL: config.baseURL,
        model: input.model,
        size: input.size,
        imageCount: input.images?.length ?? 0,
      });
      const response = await client.images.createVariation(
        await toImageVariationParams(input),
      );
      const output = imagesResponseToImageOutput(response, input);

      imageLog("openai variation response", {
        providerId: config.id,
        elapsedMs: elapsedMs(startedAt),
        imageCount: output.images.length,
      });

      return output;
    } catch (error) {
      imageError("openai variation failed", {
        providerId: config.id,
        elapsedMs: elapsedMs(startedAt),
        error: summarizeError(error),
      });
      throw error;
    }
  },
});

const toImageVariationParams = async (
  input: ImageInput,
): Promise<ImageCreateVariationParams> => {
  const [image] = await Promise.all((input.images ?? []).map(imageAssetToFile));
  const size = normalizeVariationSize(input.size);

  return {
    image,
    model: input.model,
    n: input.n,
    size,
    response_format: input.responseFormat,
    user: normalizeString(input.options?.user),
  };
};

const normalizeVariationSize = (
  value: unknown,
): "256x256" | "512x512" | "1024x1024" | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "256x256" || value === "512x512" || value === "1024x1024") {
    return value;
  }

  throw new OpenAIClientError(
    "OpenAI image variation size must be '256x256', '512x512', or '1024x1024'.",
    {
      param: "size",
    },
  );
};

const imagesResponseToImageOutput = (
  response: ImagesResponse,
  input: ImageInput,
): ImageOutput => {
  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new OpenAIClientError("OpenAI image response did not include image data.");
  }

  return {
    images: response.data.map((image) => {
      if (!image.b64_json) {
        throw missingBase64ImageDataError(
          "OpenAI image response did not include base64 image data.",
        );
      }

      return {
        bytes: base64ImageToBytes(image.b64_json),
        mimeType: imageFormatToMimeType(input.format),
        revisedPrompt: image.revised_prompt,
      };
    }),
    usage: usageToImageUsage(response.usage),
    raw: response,
  };
};

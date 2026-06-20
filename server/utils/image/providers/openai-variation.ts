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
import type { OpenAIVariationProviderConfig } from "../provider-config.ts";
import type { ImageInput, ImageOutput, ImageProvider } from "../types.ts";

export const createOpenAIImageVariationProvider = (
  config: OpenAIVariationProviderConfig,
  client: OpenAIImageClient = createOpenAIClient(config),
): ImageProvider => ({
  id: config.id,
  models: config.models,
  actionSupports: ["variation"],
  invoke: async (input) => {
    const response = await client.images.createVariation(
      await toImageVariationParams(input),
    );

    return imagesResponseToImageOutput(response, input);
  },
});

const toImageVariationParams = async (
  input: ImageInput,
): Promise<ImageCreateVariationParams> => {
  const [image] = await Promise.all((input.images ?? []).map(imageAssetToFile));

  return {
    image,
    model: input.model,
    n: input.n,
    size: normalizeVariationSize(input.size),
    response_format: input.responseFormat,
    user: normalizeString(input.options?.user),
  };
};

const normalizeVariationSize = (
  value: unknown,
): "256x256" | "512x512" | "1024x1024" | undefined => {
  if (value === "256x256" || value === "512x512" || value === "1024x1024") {
    return value;
  }

  return undefined;
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

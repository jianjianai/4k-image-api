import type {
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from "openai/resources/images";
import {
  base64ImageToBytes,
  createOpenAIClient,
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
import type { OpenAIImagesProviderConfig } from "../provider-config.ts";
import type { ImageInput, ImageOutput, ImageProvider } from "../types.ts";

export const createOpenAIImageGenerationProvider = (
  config: OpenAIImagesProviderConfig,
  client: OpenAIImageClient = createOpenAIClient(config),
): ImageProvider => ({
  id: config.id,
  models: config.models,
  supports: (input) => input.source.endpoint === "images.generations",
  invoke: async (input) => {
    const response = await client.images.generate(toImageGenerateParams(input));

    return imagesResponseToImageOutput(response, input);
  },
});

const toImageGenerateParams = (
  input: ImageInput,
): ImageGenerateParamsNonStreaming => ({
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
  response_format: usesDallEImageModel(input.model) ? "b64_json" : undefined,
  user: normalizeString(input.options?.user),
  stream: false,
});

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
        mimeType: imageFormatToMimeType(response.output_format ?? input.format),
        revisedPrompt: image.revised_prompt,
      };
    }),
    usage: usageToImageUsage(response.usage),
    raw: response,
  };
};

import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
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
import type { OpenAIImagesProviderConfig } from "../provider-config.ts";
import type { ImageInput, ImageOutput, ImageProvider } from "../types.ts";

export const createOpenAIImageGenerationProvider = (
  config: OpenAIImagesProviderConfig,
  client: OpenAIImageClient = createOpenAIClient(config),
): ImageProvider => ({
  id: config.id,
  models: config.models,
  actionSupports: ["generate", "edit"],
  invoke: async (input) => {
    if (input.action === "edit") {
      const response = await client.images.edit(await toImageEditParams(input));
      return imagesResponseToImageOutput(response, input);
    }

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

const toImageEditParams = async (
  input: ImageInput,
): Promise<ImageEditParamsNonStreaming> => ({
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
  stream: false,
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

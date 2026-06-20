import type { ImageInput } from "../../image.ts";
import {
  defaultImageModel,
  getNumber,
  getResponseFormat,
  getString,
} from "../fields.ts";
import type { OpenAIImageRequest } from "../types.ts";

export const parseImageGenerationRequest = async (
  request: OpenAIImageRequest,
): Promise<ImageInput> => ({
  action: "generate",
  prompt: getString(request.prompt),
  model: getString(request.model) ?? defaultImageModel,
  n: getNumber(request.n),
  size: getString(request.size),
  quality: getString(request.quality),
  format: getString(request.output_format) ?? getString(request.format),
  background: getString(request.background),
  responseFormat: getResponseFormat(request.response_format),
  options: {
    moderation: request.moderation,
    outputCompression: request.output_compression,
    partialImages: request.partial_images,
    user: request.user,
  },
});

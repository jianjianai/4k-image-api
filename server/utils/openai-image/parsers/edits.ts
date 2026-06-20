import type { ImageInput } from "../../image.ts";
import { getImageAssets, getOptionalImageAsset } from "../assets.ts";
import {
  defaultImageModel,
  getNumber,
  getResponseFormat,
  getString,
} from "../fields.ts";
import type { OpenAIImageRequest } from "../types.ts";

export const parseImageEditRequest = async (
  request: OpenAIImageRequest,
): Promise<ImageInput> => ({
  action: "edit",
  prompt: getString(request.prompt),
  model: getString(request.model) ?? defaultImageModel,
  images: await getImageAssets(request.image),
  mask: await getOptionalImageAsset(request.mask),
  n: getNumber(request.n),
  size: getString(request.size),
  quality: getString(request.quality),
  format: getString(request.output_format) ?? getString(request.format),
  background: getString(request.background),
  responseFormat: getResponseFormat(request.response_format),
  options: {
    inputFidelity: request.input_fidelity,
    outputCompression: request.output_compression,
    user: request.user,
  },
});

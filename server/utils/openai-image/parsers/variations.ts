import type { ImageInput } from "../../image.ts";
import { getImageAssets } from "../assets.ts";
import {
  defaultImageModel,
  getNumber,
  getResponseFormat,
  getString,
} from "../fields.ts";
import type { OpenAIImageRequest } from "../types.ts";

export const parseImageVariationRequest = async (
  request: OpenAIImageRequest,
): Promise<ImageInput> => ({
  action: "variation",
  model: getString(request.model) ?? defaultImageModel,
  images: await getImageAssets(request.image),
  n: getNumber(request.n),
  size: getString(request.size),
  responseFormat: getResponseFormat(request.response_format),
  options: {
    user: request.user,
  },
});

import { defineOpenAIImageHandler } from "../../../utils/openai-image/handler.ts";
import { parseImageVariationRequest } from "../../../utils/openai-image/parsers/variations.ts";
import { toOpenAIImageResponse } from "../../../utils/openai-image/response.ts";

export default defineOpenAIImageHandler(
  parseImageVariationRequest,
  toOpenAIImageResponse,
);

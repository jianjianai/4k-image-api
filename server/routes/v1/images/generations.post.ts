import { defineOpenAIImageHandler } from "../../../utils/openai-image/handler.ts";
import { parseImageGenerationRequest } from "../../../utils/openai-image/parsers/generations.ts";
import { toOpenAIImageResponse } from "../../../utils/openai-image/response.ts";

export default defineOpenAIImageHandler(
  parseImageGenerationRequest,
  toOpenAIImageResponse,
);

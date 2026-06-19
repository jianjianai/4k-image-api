import { defineOpenAIImageHandler } from "../../../utils/openai-image/handler.ts";
import { parseImageEditRequest } from "../../../utils/openai-image/parsers/edits.ts";
import { toOpenAIImageResponse } from "../../../utils/openai-image/response.ts";

export default defineOpenAIImageHandler(
  parseImageEditRequest,
  toOpenAIImageResponse,
);

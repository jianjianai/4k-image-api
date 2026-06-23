import { defineOpenAIImageHandler } from "../../utils/openai-image/handler.ts";
import { parseResponsesImageRequest } from "../../utils/openai-image/parsers/responses.ts";
import {
  toOpenAIResponse,
  toOpenAIResponseStreamEvents,
} from "../../utils/openai-image/response.ts";

export default defineOpenAIImageHandler(
  parseResponsesImageRequest,
  toOpenAIResponse,
  toOpenAIResponseStreamEvents,
);

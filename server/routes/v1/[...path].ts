import { defineHandler } from "nitro";
import { OpenAIClientError, toOpenAIErrorResponse } from "../../utils/openai-image/errors.ts";

export default defineHandler((event) =>
  toOpenAIErrorResponse(
    new OpenAIClientError(`OpenAI-compatible endpoint not found: ${event.url.pathname}`, {
      code: "invalid_request",
      status: 404,
    }),
  ),
);

import { defineHandler } from "nitro";
import { assertOpenAIAPIKey } from "../../utils/openai-image/auth.ts";
import {
  OpenAIClientError,
  toOpenAIErrorResponse,
} from "../../utils/openai-image/errors.ts";

export default defineHandler((event) => {
  try {
    assertOpenAIAPIKey(event.req);
  } catch (error) {
    return toOpenAIErrorResponse(error, event.req);
  }

  return toOpenAIErrorResponse(
    new OpenAIClientError(
      `OpenAI-compatible endpoint not found: ${event.url.pathname}`,
      {
        code: "invalid_request",
        status: 404,
      },
    ),
    event.req,
  );
});

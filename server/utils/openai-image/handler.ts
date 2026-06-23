import { defineHandler } from "nitro";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../image.ts";
import { assertOpenAIAPIKey } from "./auth.ts";
import { getOpenAICorsHeaders } from "./cors.ts";
import { OpenAIClientError, toOpenAIErrorResponse } from "./errors.ts";
import { readOpenAIRequest } from "./request.ts";
import {
  elapsedMs,
  imageError,
  imageLog,
  nowMs,
  summarizeError,
  summarizeInput,
} from "../image/logger.ts";
import type { OpenAIImageParser, OpenAIImageResponder } from "./types.ts";

export const defineOpenAIImageHandler = (
  parseRequest: OpenAIImageParser,
  formatResponse: OpenAIImageResponder,
) =>
  defineHandler(async (event) => {
    const startedAt = nowMs();

    try {
      imageLog("request received", {
        method: event.req.method,
        url: event.req.url,
        contentType: event.req.headers.get("content-type"),
      });
      assertOpenAIAPIKey(event.req);
      const request = await readOpenAIRequest(event.req);
      const input = await parseRequest(request);
      imageLog("request parsed", summarizeInput(input));
      const output = await imageProviderManager.invoke(input);
      imageLog("request completed", {
        elapsedMs: elapsedMs(startedAt),
        imageCount: output.images.length,
      });

      return Response.json(formatResponse(output, input), {
        headers: getOpenAICorsHeaders(event.req),
      });
    } catch (error) {
      imageError("request failed", {
        elapsedMs: elapsedMs(startedAt),
        error: summarizeError(error),
      });
      return toOpenAIErrorResponse(normalizeOpenAIError(error), event.req);
    }
  });

const normalizeOpenAIError = (error: unknown): unknown => {
  if (error instanceof ImageProviderNotFoundError) {
    return new OpenAIClientError(
      `The model '${error.model}' does not exist or no image provider is registered for it.`,
      {
        code: "model_not_found",
        param: "model",
        status: 404,
      },
    );
  }

  if (error instanceof ImageModelRequiredError) {
    return new OpenAIClientError("Image model is required.", {
      code: "model_required",
      param: "model",
    });
  }

  return error;
};

import { defineHandler } from "nitro";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../image.ts";
import { getOpenAICorsHeaders } from "./cors.ts";
import { OpenAIClientError, toOpenAIErrorResponse } from "./errors.ts";
import { readOpenAIRequest } from "./request.ts";
import type { OpenAIImageParser, OpenAIImageResponder } from "./types.ts";

export const defineOpenAIImageHandler = (
  parseRequest: OpenAIImageParser,
  formatResponse: OpenAIImageResponder,
) =>
  defineHandler(async (event) => {
    try {
      const request = await readOpenAIRequest(event.req);
      const input = await parseRequest(request);
      const output = await imageProviderManager.invoke(input);

      return Response.json(formatResponse(output, input), {
        headers: getOpenAICorsHeaders(event.req),
      });
    } catch (error) {
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

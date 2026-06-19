import { defineHandler } from "nitro";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../image.ts";
import { OpenAIClientError, toOpenAIErrorResponse } from "./errors.ts";
import { getOpenAIImageParser } from "./parsers.ts";
import { readOpenAIRequest } from "./request.ts";
import { toOpenAIImageResponse, toOpenAIResponse } from "./response.ts";
import type { OpenAIImageEndpoint } from "./types.ts";

export const defineOpenAIImageHandler = (endpoint: OpenAIImageEndpoint) =>
  defineHandler(async (event) => {
    try {
      const request = await readOpenAIRequest(event.req);
      const input = await getOpenAIImageParser(endpoint)(request);
      const output = await imageProviderManager.invoke(input);

      if (endpoint === "responses") {
        return toOpenAIResponse(output, input);
      }

      return toOpenAIImageResponse(output, input);
    } catch (error) {
      return toOpenAIErrorResponse(normalizeOpenAIError(error));
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

import { defineHandler } from "nitro";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../image.ts";
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
      return toOpenAIError(error);
    }
  });

const toOpenAIError = (error: unknown): Response => {
  const message =
    error instanceof Error ? error.message : "Unexpected image generation error.";
  const status =
    error instanceof ImageModelRequiredError
      ? 400
      : error instanceof ImageProviderNotFoundError
        ? 404
        : 400;

  return Response.json(
    {
      error: {
        message,
        type: "invalid_request_error",
        param: null,
        code: null,
      },
    },
    { status },
  );
};

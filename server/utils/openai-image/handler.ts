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
import type {
  OpenAIImageParser,
  OpenAIImageResponder,
  OpenAIImageStreamResponder,
  OpenAIStreamEvent,
} from "./types.ts";

export const defineOpenAIImageHandler = (
  parseRequest: OpenAIImageParser,
  formatResponse: OpenAIImageResponder,
  formatStreamEvents?: OpenAIImageStreamResponder,
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

      if (input.stream === true && formatStreamEvents) {
        return createOpenAIImageStreamResponse({
          input,
          request: event.req,
          startedAt,
          formatStreamEvents,
        });
      }

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

const createOpenAIImageStreamResponse = ({
  input,
  request,
  startedAt,
  formatStreamEvents,
}: {
  input: Awaited<ReturnType<OpenAIImageParser>>;
  request: Request;
  startedAt: number;
  formatStreamEvents: OpenAIImageStreamResponder;
}): Response => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      controller.enqueue(encoder.encode(": stream-open\n\n"));

      try {
        const output = await imageProviderManager.invoke(input);
        imageLog("request completed", {
          elapsedMs: elapsedMs(startedAt),
          imageCount: output.images.length,
          stream: true,
        });

        for (const streamEvent of formatStreamEvents(output, input)) {
          controller.enqueue(encoder.encode(formatSSE(streamEvent)));
        }

        controller.enqueue(encoder.encode(formatSSE({ data: "[DONE]" })));
      } catch (error) {
        imageError("request failed", {
          elapsedMs: elapsedMs(startedAt),
          error: summarizeError(error),
          stream: true,
        });
        controller.enqueue(
          encoder.encode(
            formatSSE({
              event: "error",
              data: toOpenAIErrorPayload(normalizeOpenAIError(error)),
            }),
          ),
        );
        controller.enqueue(encoder.encode(formatSSE({ data: "[DONE]" })));
      } finally {
        controller.close();
      }
    },
  });

  const headers = new Headers(getOpenAICorsHeaders(request));
  headers.set("content-type", "text/event-stream; charset=utf-8");
  headers.set("cache-control", "no-cache, no-transform");
  headers.set("connection", "keep-alive");
  headers.set("x-accel-buffering", "no");

  return new Response(stream, { headers });
};

const formatSSE = ({ event, data }: OpenAIStreamEvent): string => {
  const lines: string[] = [];

  if (event) {
    lines.push(`event: ${event}`);
  }

  const payload = typeof data === "string" ? data : JSON.stringify(data);
  lines.push(`data: ${payload}`);

  return `${lines.join("\n")}\n\n`;
};

const toOpenAIErrorPayload = (error: unknown): Record<string, unknown> => {
  if (error instanceof OpenAIClientError) {
    return {
      error: {
        message: error.message,
        type: "invalid_request_error",
        param: error.param,
        code: error.code,
        reason: error.message,
      },
    };
  }

  const message =
    error instanceof Error ? error.message : "Unexpected image generation error.";

  return {
    error: {
      message,
      type: "invalid_request_error",
      param: null,
      code: "invalid_request",
      reason: message,
    },
  };
};

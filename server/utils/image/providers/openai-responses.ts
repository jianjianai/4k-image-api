import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import {
  base64ImageToBytes,
  createOpenAIClient,
  imageAssetToDataURL,
  imageFormatToMimeType,
  missingBase64ImageDataError,
  normalizeBackground,
  normalizeImageFormat,
  normalizeModeration,
  normalizeNumber,
  normalizeResponseImageQuality,
  usageToImageUsage,
  type OpenAIImageClient,
} from "./openai-client.ts";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import {
  elapsedMs,
  imageError,
  imageLog,
  nowMs,
  summarizeError,
} from "../logger.ts";
import type { OpenAIResponsesProviderConfig } from "../provider-config.ts";
import type { ImageInput, ImageOutput, ImageProvider } from "../types.ts";

export const createOpenAIResponsesImageProvider = (
  config: OpenAIResponsesProviderConfig,
  client: OpenAIImageClient = createOpenAIClient(config),
): ImageProvider => ({
  id: config.id,
  type: config.type,
  models: config.models,
  actionSupports: ["generate", "edit"],
  processorId: config.processor,
  invoke: async (input) => {
    const startedAt = nowMs();

    try {
      imageLog("openai responses request", {
        providerId: config.id,
        baseURL: config.baseURL,
        action: input.action,
        model: input.model,
        size: input.size,
        imageCount: input.images?.length ?? 0,
        hasMask: Boolean(input.mask),
      });

      const stream = await client.responses.create(toResponseCreateParams(input));
      const response = await responseStreamToResponse(stream);
      const output = responsesResponseToImageOutput(response, input);

      imageLog("openai responses response", {
        providerId: config.id,
        elapsedMs: elapsedMs(startedAt),
        imageCount: output.images.length,
      });

      return output;
    } catch (error) {
      imageError("openai responses failed", {
        providerId: config.id,
        elapsedMs: elapsedMs(startedAt),
        error: summarizeError(error),
      });
      throw error;
    }
  },
});

const toResponseCreateParams = (
  input: ImageInput,
): ResponseCreateParamsStreaming => {
  const toolOptions = getToolOptions(input);

  return {
    model: input.model,
    input: toResponseInput(input),
    tools: [
      {
        type: "image_generation",
        action: toResponseImageAction(input.action),
        model: input.model,
        size: input.size,
        quality: normalizeResponseImageQuality(input.quality),
        output_format: normalizeImageFormat(input.format),
        background: normalizeBackground(input.background),
        input_fidelity: normalizeInputFidelity(input.options?.inputFidelity),
        input_image_mask: input.mask
          ? { image_url: imageAssetToDataURL(input.mask) }
          : undefined,
        moderation: normalizeModeration(toolOptions?.moderation),
        output_compression: normalizeNumber(toolOptions?.output_compression),
        partial_images: normalizeNumber(toolOptions?.partial_images),
      },
    ],
    tool_choice: "required",
    stream: true,
  };
};

const toResponseImageAction = (
  action: ImageInput["action"],
): "generate" | "edit" => (action === "edit" ? "edit" : "generate");

const toResponseInput = (
  input: ImageInput,
): ResponseCreateParamsStreaming["input"] => {
  if (!input.images?.length) {
    return input.prompt;
  }

  return [
    {
      role: "user",
      content: [
        ...(input.prompt
          ? [
              {
                type: "input_text" as const,
                text: input.prompt,
              },
            ]
          : []),
        ...input.images.map((image) => ({
          type: "input_image" as const,
          image_url: imageAssetToDataURL(image),
          detail: "auto" as const,
        })),
      ],
    },
  ];
};

const responseStreamToResponse = async (
  stream: AsyncIterable<ResponseStreamEvent>,
): Promise<Response> => {
  let response: Response | undefined;

  for await (const event of stream) {
    if (event.type === "response.completed") {
      response = event.response;
      continue;
    }

    if (event.type === "response.failed") {
      throw new OpenAIClientError("OpenAI responses stream failed.");
    }

    if (event.type === "response.incomplete") {
      throw new OpenAIClientError("OpenAI responses stream completed incomplete.");
    }

    if (event.type === "error") {
      throw new OpenAIClientError(event.message, {
        code: "invalid_request",
        param: event.param,
      });
    }
  }

  if (!response) {
    throw new OpenAIClientError("OpenAI responses stream did not complete.");
  }

  return response;
};

const getToolOptions = (
  input: ImageInput,
): Record<string, unknown> | undefined => {
  const tool = input.options?.tool;

  return typeof tool === "object" && tool !== null
    ? (tool as Record<string, unknown>)
    : undefined;
};

const normalizeInputFidelity = (
  value: unknown,
): "high" | "low" | undefined => {
  if (value === "high" || value === "low") {
    return value;
  }

  return undefined;
};

const responsesResponseToImageOutput = (
  response: Response,
  input: ImageInput,
): ImageOutput => {
  const images = response.output
    .filter((item) => item.type === "image_generation_call")
    .map((item) => {
      if (!item.result) {
        throw missingBase64ImageDataError(
          "OpenAI responses image call did not include base64 image data.",
        );
      }

      return {
        bytes: base64ImageToBytes(item.result),
        mimeType: imageFormatToMimeType(input.format),
      };
    });

  if (images.length === 0) {
    throw new OpenAIClientError(
      "OpenAI responses result did not include image generation output.",
    );
  }

  return {
    images,
    usage: usageToImageUsage(response.usage),
    raw: response,
  };
};

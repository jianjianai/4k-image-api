import type {
  Response,
  ResponseCreateParamsNonStreaming,
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
    const response = await client.responses.create(toResponseCreateParams(input));

    return responsesResponseToImageOutput(response, input);
  },
});

const toResponseCreateParams = (
  input: ImageInput,
): ResponseCreateParamsNonStreaming => {
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
    stream: false,
  };
};

const toResponseImageAction = (
  action: ImageInput["action"],
): "generate" | "edit" => (action === "edit" ? "edit" : "generate");

const toResponseInput = (
  input: ImageInput,
): ResponseCreateParamsNonStreaming["input"] => {
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

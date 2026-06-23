import type { ImageInput, ImageMimeType, ImageOutput } from "../image.ts";
import { bytesToBase64 } from "./assets.ts";
import type { OpenAIStreamEvent } from "./types.ts";

export const toOpenAIImageResponse = (
  output: ImageOutput,
  input: ImageInput,
): Record<string, unknown> => {
  const format = input.responseFormat ?? "b64_json";

  return {
    created: Math.floor(Date.now() / 1000),
    data: output.images.map((image, index) => {
      const item: Record<string, unknown> = {};

      if (format === "url") {
        item.url = imageToDataUrl(image.bytes, image.mimeType);
      } else {
        item.b64_json = bytesToBase64(image.bytes);
      }

      if (image.revisedPrompt) {
        item.revised_prompt = image.revisedPrompt;
      }

      if (!image.revisedPrompt && input.prompt && index === 0) {
        item.revised_prompt = input.prompt;
      }

      return item;
    }),
    usage: output.usage,
  };
};

export const toOpenAIResponse = (
  output: ImageOutput,
  input: ImageInput,
): Record<string, unknown> => ({
  id: `resp_${crypto.randomUUID().replaceAll("-", "")}`,
  object: "response",
  created_at: Math.floor(Date.now() / 1000),
  status: "completed",
  model: input.model,
  output: output.images.map((image) => {
    const item: Record<string, unknown> = {
      type: "image_generation_call",
      status: "completed",
      result: bytesToBase64(image.bytes),
    };

    if (image.revisedPrompt) {
      item.revised_prompt = image.revisedPrompt;
    }

    return item;
  }),
  output_text: "",
  usage: output.usage,
});

export const toOpenAIImageStreamEvents = (
  output: ImageOutput,
  input: ImageInput,
): OpenAIStreamEvent[] =>
  output.images.map((image, index) => {
    const eventType =
      input.action === "edit" ? "image_edit.completed" : "image_generation.completed";

    return {
      data: {
        type: eventType,
        b64_json: bytesToBase64(image.bytes),
        created_at: Math.floor(Date.now() / 1000),
        output_format: mimeTypeToImageFormat(image.mimeType),
        revised_prompt:
          image.revisedPrompt ?? (index === 0 ? input.prompt : undefined),
      },
    };
  });

export const toOpenAIResponseStreamEvents = (
  output: ImageOutput,
  input: ImageInput,
): OpenAIStreamEvent[] => {
  const response = toOpenAIResponse(output, input);

  return [
    {
      event: "response.created",
      data: {
        type: "response.created",
        response: {
          ...response,
          status: "in_progress",
          output: [],
        },
      },
    },
    {
      event: "response.completed",
      data: {
        type: "response.completed",
        response,
      },
    },
  ];
};

const imageToDataUrl = (bytes: Uint8Array, mimeType: ImageMimeType): string =>
  `data:${mimeType};base64,${bytesToBase64(bytes)}`;

const mimeTypeToImageFormat = (mimeType: ImageMimeType): "png" | "jpeg" | "webp" => {
  if (mimeType === "image/jpeg") {
    return "jpeg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
};

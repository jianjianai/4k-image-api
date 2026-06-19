import type { ImageInput } from "../../image.ts";
import {
  defaultImageModel,
  getBoolean,
  getNumber,
  getString,
  isObject,
} from "../fields.ts";
import type { OpenAIImageRequest } from "../types.ts";

export const parseResponsesImageRequest = async (
  request: OpenAIImageRequest,
): Promise<ImageInput> => {
  const tool = getImageGenerationTool(request);

  return {
    action: "generate",
    prompt: getResponsesPrompt(request.input),
    model: getString(tool?.model) ?? getString(request.model) ?? defaultImageModel,
    n: getNumber(request.n) ?? getNumber(tool?.n),
    size: getString(tool?.size),
    quality: getString(tool?.quality),
    format: getString(tool?.output_format),
    background: getString(tool?.background),
    stream: getBoolean(request.stream),
    options: {
      tool,
      user: request.user,
    },
    source: {
      protocol: "openai",
      endpoint: "responses",
      raw: request,
    },
  };
};

const getImageGenerationTool = (
  request: OpenAIImageRequest,
): Record<string, unknown> | undefined => {
  if (!Array.isArray(request.tools)) {
    return undefined;
  }

  return request.tools.find(
    (tool): tool is Record<string, unknown> =>
      isObject(tool) && tool.type === "image_generation",
  );
};

const getResponsesPrompt = (input: unknown): string | undefined => {
  if (typeof input === "string") {
    return input;
  }

  if (!Array.isArray(input)) {
    return undefined;
  }

  const texts: string[] = [];

  for (const item of input) {
    collectResponseText(item, texts);
  }

  return texts.join("\n") || undefined;
};

const collectResponseText = (value: unknown, texts: string[]): void => {
  if (typeof value === "string") {
    texts.push(value);
    return;
  }

  if (!isObject(value)) {
    return;
  }

  if (typeof value.content === "string") {
    texts.push(value.content);
    return;
  }

  if (!Array.isArray(value.content)) {
    return;
  }

  for (const part of value.content) {
    if (typeof part === "string") {
      texts.push(part);
      continue;
    }

    if (isObject(part) && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
};

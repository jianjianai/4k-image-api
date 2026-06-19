import type { ImageInput, ImageOutput } from "../image.ts";

export type OpenAIImageRequest = Record<string, unknown>;

export type OpenAIImageParser = (
  request: OpenAIImageRequest,
) => Promise<ImageInput>;

export type OpenAIImageResponder = (
  output: ImageOutput,
  input: ImageInput,
) => Record<string, unknown>;

import type { ImageInput } from "../image.ts";

export type OpenAIImageEndpoint =
  | "images.generations"
  | "images.edits"
  | "images.variations"
  | "responses";

export type OpenAIImageRequest = Record<string, unknown>;

export type OpenAIImageParser = (
  request: OpenAIImageRequest,
) => Promise<ImageInput>;

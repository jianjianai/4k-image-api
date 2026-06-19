import { parseImageEditRequest } from "./parsers/edits.ts";
import { parseImageGenerationRequest } from "./parsers/generations.ts";
import { parseImageVariationRequest } from "./parsers/variations.ts";
import { parseResponsesImageRequest } from "./parsers/responses.ts";
import type {
  OpenAIImageEndpoint,
  OpenAIImageParser,
} from "./types.ts";

const parsers: Record<OpenAIImageEndpoint, OpenAIImageParser> = {
  "images.generations": parseImageGenerationRequest,
  "images.edits": parseImageEditRequest,
  "images.variations": parseImageVariationRequest,
  responses: parseResponsesImageRequest,
};

export const getOpenAIImageParser = (
  endpoint: OpenAIImageEndpoint,
): OpenAIImageParser => parsers[endpoint];

export type ImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageResponseFormat = "b64_json" | "url";

export type ImageAction = "generate" | "edit" | "variation";

export type ImageProviderType =
  | "test"
  | "openai-images"
  | "openai-variation"
  | "openai-responses";

export type ImageProcessorType = "testprocessor";

export type ImageAsset = {
  data: Uint8Array;
  mimeType: ImageMimeType;
  filename?: string;
};

export type ImageInput = {
  action: ImageAction;

  prompt?: string;
  model?: string;

  images?: ImageAsset[];
  mask?: ImageAsset;

  n?: number;
  size?: string;
  quality?: string;
  format?: string;
  background?: string;
  responseFormat?: ImageResponseFormat;
  stream?: boolean;
  options?: Record<string, unknown>;
};

export type ImageOutput = {
  images: Array<{
    bytes: Uint8Array;
    mimeType: ImageMimeType;
    revisedPrompt?: string;
  }>;

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };

  raw?: unknown;
};

export type ImageProvider = {
  id: string;
  type: ImageProviderType;
  models: readonly string[];
  actionSupports: readonly ImageAction[];
  processorId?: string;
  invoke: (input: ImageInput) => Promise<ImageOutput>;
};

export type ImageProviders = readonly ImageProvider[];

export type ImageProcessorContext = {
  providerId: string;
  providerType: ImageProviderType;
  model: string;
  action: ImageAction;
  processorId: string;
};

export type ImageProcessor = {
  id: string;
  type: ImageProcessorType;
  processInput?: (
    input: ImageInput,
    context: ImageProcessorContext,
  ) => ImageInput | Promise<ImageInput>;
  processOutput?: (
    output: ImageOutput,
    input: ImageInput,
    context: ImageProcessorContext,
  ) => ImageOutput | Promise<ImageOutput>;
};

export type ImageProcessors = readonly ImageProcessor[];

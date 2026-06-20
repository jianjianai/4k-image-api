export type ImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageResponseFormat = "b64_json" | "url";

export type ImageAction = "generate" | "edit";

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
  models: readonly string[];
  actionSupports: readonly ImageAction[];
  invoke: (input: ImageInput) => Promise<ImageOutput>;
};

export type ImageProviders = readonly ImageProvider[];

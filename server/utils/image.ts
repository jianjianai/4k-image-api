export type ImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageAsset = {
  data: Uint8Array;
  mimeType: ImageMimeType;
  filename?: string;
};

export type ImageInput = {
  action: "generate" | "edit";

  prompt?: string;
  model?: string;

  images?: ImageAsset[];
  mask?: ImageAsset;

  n?: number;
  size?: string;
  quality?: string;
  format?: string;
  background?: string;

  source: {
    protocol: "openai";
    endpoint:
      | "images.generations"
      | "images.variations"
      | "images.edits"
      | "responses";
    raw: unknown;
  };
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

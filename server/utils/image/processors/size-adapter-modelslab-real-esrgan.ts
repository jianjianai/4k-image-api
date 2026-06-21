import { bytesToBase64 } from "../../openai-image/assets.ts";
import { OpenAIClientError } from "../../openai-image/errors.ts";
import type { ModelslabRealEsrganSizeAdapterConfig } from "../provider-config.ts";
import type { ImageMimeType, ImageProcessor } from "../types.ts";
import {
  adaptInputSize,
  getSizeAdapterState,
} from "./size-adapter.ts";

const defaultBaseURL = "https://modelslab.com/api/v6/image_editing/super_resolution";

export const createModelslabRealEsrganSizeAdapter = (
  config: ModelslabRealEsrganSizeAdapterConfig,
): ImageProcessor => ({
  id: config.id,
  type: config.type,
  processInput: (input) =>
    adaptInputSize(input, {
      width: config.maxWidth,
      height: config.maxHeight,
      maxPixels: config.maxPixels,
    }),
  processOutput: async (output, input) => {
    const state = getSizeAdapterState(input);

    if (!state) {
      return output;
    }

    return {
      ...output,
      images: await Promise.all(
        output.images.map(async (image) => {
          const result = await upscaleImage(image.bytes, image.mimeType, config);

          return {
            ...image,
            bytes: result.bytes,
            mimeType: result.mimeType,
          };
        }),
      ),
    };
  },
});

const upscaleImage = async (
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  config: ModelslabRealEsrganSizeAdapterConfig,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const response = await fetch(config.baseURL ?? defaultBaseURL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      key: config.apiKey,
      init_image: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
      model_id: config.modelId ?? "RealESRGAN_x4plus",
      scale: config.scale ?? 4,
      face_enhance: config.faceEnhance ?? false,
    }),
  });

  if (!response.ok) {
    throw new OpenAIClientError(
      `Modelslab size adapter request failed with status ${response.status}.`,
      {
        code: "invalid_request",
        status: response.status,
      },
    );
  }

  const payload = (await response.json()) as unknown;
  const imageURL = getModelslabOutputURL(payload);

  if (!imageURL) {
    throw new OpenAIClientError(
      "Modelslab size adapter response did not include an output image URL.",
    );
  }

  return downloadImage(imageURL);
};

const getModelslabOutputURL = (payload: unknown): string | undefined => {
  if (!isObject(payload)) {
    return undefined;
  }

  if (typeof payload.output === "string") {
    return payload.output;
  }

  if (
    Array.isArray(payload.output) &&
    typeof payload.output[0] === "string"
  ) {
    return payload.output[0];
  }

  if (typeof payload.proxy_links === "string") {
    return payload.proxy_links;
  }

  if (
    Array.isArray(payload.proxy_links) &&
    typeof payload.proxy_links[0] === "string"
  ) {
    return payload.proxy_links[0];
  }

  return undefined;
};

const downloadImage = async (
  url: string,
): Promise<{
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new OpenAIClientError(
      `Modelslab size adapter output download failed with status ${response.status}.`,
      {
        code: "invalid_request",
        status: response.status,
      },
    );
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: normalizeMimeType(response.headers.get("content-type")),
  };
};

const normalizeMimeType = (value: string | null): ImageMimeType => {
  const mimeType = value?.split(";")[0]?.trim();

  if (mimeType === "image/jpeg" || mimeType === "image/webp") {
    return mimeType;
  }

  return "image/png";
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

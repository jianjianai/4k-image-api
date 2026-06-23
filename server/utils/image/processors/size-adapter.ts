import type { ImageInput } from "../types.ts";

const sizeAdapterOptionKey = "sizeAdapter";

export type ImageSize = {
  width: number;
  height: number;
  maxPixels?: number;
};

export type SizeAdapterState = {
  originalSize: string;
  adaptedSize: string;
  target: ImageSize;
  scale?: number;
  modelId?: string;
};

export const adaptInputSize = (
  input: ImageInput,
  maxSize: ImageSize,
): ImageInput => {
  const requestedSize = parseImageSize(input.size);

  if (!requestedSize || fitsWithin(requestedSize, maxSize)) {
    return input;
  }

  const adaptedSize = fitWithin(requestedSize, maxSize);

  return withSizeAdapterState(input, {
    originalSize: input.size!,
    adaptedSize: formatImageSize(adaptedSize),
    target: requestedSize,
  });
};

export const withSizeAdapterState = (
  input: ImageInput,
  state: SizeAdapterState,
): ImageInput => ({
  ...input,
  size: state.adaptedSize,
  options: {
    ...input.options,
    [sizeAdapterOptionKey]: state,
  },
});

export const getSizeAdapterState = (
  input: ImageInput,
): SizeAdapterState | undefined => {
  const value = input.options?.[sizeAdapterOptionKey];

  if (!isObject(value)) {
    return undefined;
  }

  const target = value.target;

  if (
    typeof value.originalSize === "string" &&
    typeof value.adaptedSize === "string" &&
    isObject(target) &&
    typeof target.width === "number" &&
    typeof target.height === "number"
  ) {
    const state: SizeAdapterState = {
      originalSize: value.originalSize,
      adaptedSize: value.adaptedSize,
      target: {
        width: target.width,
        height: target.height,
      },
    };

    if (typeof value.scale === "number" && Number.isFinite(value.scale)) {
      state.scale = value.scale;
    }

    if (typeof value.modelId === "string") {
      state.modelId = value.modelId;
    }

    return state;
  }

  return undefined;
};

export const parseImageSize = (value: unknown): ImageSize | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = /^(\d+)x(\d+)$/.exec(value);

  if (!match) {
    return undefined;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }

  return { width, height };
};

export const formatImageSize = ({ width, height }: ImageSize): string =>
  `${width}x${height}`;

export const fitsWithin = (size: ImageSize, maxSize: ImageSize): boolean =>
  size.width <= maxSize.width &&
  size.height <= maxSize.height &&
  (maxSize.maxPixels === undefined ||
    size.width * size.height <= maxSize.maxPixels);

export const fitWithin = (size: ImageSize, maxSize: ImageSize): ImageSize => {
  const pixelScale =
    maxSize.maxPixels === undefined
      ? 1
      : Math.sqrt(maxSize.maxPixels / (size.width * size.height));
  const scale = Math.min(
    1,
    maxSize.width / size.width,
    maxSize.height / size.height,
    pixelScale,
  );

  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

import type {
  ImageInput,
  ImageOutput,
  ImageProvider,
  ImageProviders,
} from "./types.ts";

export class ImageModelRequiredError extends Error {
  constructor() {
    super("Image model is required.");
  }
}

export class ImageProviderNotFoundError extends Error {
  constructor(model: string) {
    super(`No image provider supports model: ${model}`);
  }
}

export type ImageProviderManager = {
  add: (provider: ImageProvider) => void;
  remove: (providerId: string) => boolean;
  list: () => ImageProviders;
  invoke: (input: ImageInput) => Promise<ImageOutput>;
};

export const createImageProviderManager = (
  initialProviders: ImageProviders = [],
): ImageProviderManager => {
  const providers = [...initialProviders];

  return {
    add: (provider) => {
      const index = providers.findIndex(({ id }) => id === provider.id);

      if (index === -1) {
        providers.push(provider);
        return;
      }

      providers[index] = provider;
    },

    remove: (providerId) => {
      const index = providers.findIndex(({ id }) => id === providerId);

      if (index === -1) {
        return false;
      }

      providers.splice(index, 1);
      return true;
    },

    list: () => [...providers],

    invoke: async (input) => {
      if (!input.model) {
        throw new ImageModelRequiredError();
      }

      const provider = providers.find((provider) =>
        provider.models.includes(input.model!),
      );

      if (!provider) {
        throw new ImageProviderNotFoundError(input.model);
      }

      return provider.invoke(input);
    },
  };
};

export const imageProviderManager = createImageProviderManager();

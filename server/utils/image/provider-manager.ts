import type {
  ImageInput,
  ImageOutput,
  ImageProvider,
  ImageProviders,
} from "./types.ts";
import { imageProcessorManager } from "./processor-manager.ts";

export class ImageModelRequiredError extends Error {
  constructor() {
    super("Image model is required.");
  }
}

export class ImageProviderNotFoundError extends Error {
  model: string;

  constructor(model: string) {
    super(`No image provider supports model: ${model}`);
    this.model = model;
  }
}

export type ImageProviderManager = {
  add: (provider: ImageProvider) => void;
  remove: (providerId: string) => boolean;
  list: () => ImageProviders;
  invoke: (input: ImageInput) => Promise<ImageOutput>;
};

const createImageProviderManager = (
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

      const provider = providers.find(
        (provider) =>
          provider.models.includes(input.model!) &&
          provider.actionSupports.includes(input.action),
      );

      if (!provider) {
        throw new ImageProviderNotFoundError(input.model);
      }

      if (!provider.processorId) {
        return provider.invoke(input);
      }

      const processor = imageProcessorManager.get(provider.processorId);

      if (!processor) {
        throw new Error(
          `Image processor '${provider.processorId}' is not registered for provider '${provider.id}'.`,
        );
      }

      const context = {
        providerId: provider.id,
        providerType: provider.type,
        model: input.model,
        action: input.action,
        processorId: processor.id,
      };
      const processedInput =
        (await processor.processInput?.(input, context)) ?? input;
      const output = await provider.invoke(processedInput);

      return (
        (await processor.processOutput?.(output, processedInput, context)) ??
        output
      );
    },
  };
};

export const imageProviderManager = createImageProviderManager();

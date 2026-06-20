import type {
  ImageProcessor,
  ImageProcessors,
} from "./types.ts";

export type ImageProcessorManager = {
  add: (processor: ImageProcessor) => void;
  remove: (processorId: string) => boolean;
  get: (processorId: string) => ImageProcessor | undefined;
  list: () => ImageProcessors;
};

const createImageProcessorManager = (
  initialProcessors: ImageProcessors = [],
): ImageProcessorManager => {
  const processors = [...initialProcessors];

  return {
    add: (processor) => {
      const index = processors.findIndex(({ id }) => id === processor.id);

      if (index === -1) {
        processors.push(processor);
        return;
      }

      processors[index] = processor;
    },

    remove: (processorId) => {
      const index = processors.findIndex(({ id }) => id === processorId);

      if (index === -1) {
        return false;
      }

      processors.splice(index, 1);
      return true;
    },

    get: (processorId) => processors.find(({ id }) => id === processorId),

    list: () => [...processors],
  };
};

export const imageProcessorManager = createImageProcessorManager();

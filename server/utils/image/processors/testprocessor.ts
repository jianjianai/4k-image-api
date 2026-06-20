import type { TestImageProcessorConfig } from "../provider-config.ts";
import type { ImageProcessor } from "../types.ts";

export const createTestImageProcessor = (
  config: TestImageProcessorConfig,
): ImageProcessor => ({
  id: config.id,
  type: config.type,
  processInput: (input) => ({
    ...input,
    prompt:
      config.promptPrefix && input.prompt
        ? `${config.promptPrefix}${input.prompt}`
        : input.prompt,
  }),
  processOutput: (output) => ({
    ...output,
    images: output.images.map((image) => ({
      ...image,
      mimeType: config.outputMimeType ?? image.mimeType,
      revisedPrompt:
        config.revisedPromptPrefix && image.revisedPrompt
          ? `${config.revisedPromptPrefix}${image.revisedPrompt}`
          : image.revisedPrompt,
    })),
  }),
});

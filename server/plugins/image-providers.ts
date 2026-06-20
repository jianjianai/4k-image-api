import { definePlugin } from "nitro";
import { imageProcessorManager, imageProviderManager } from "../utils/image.ts";
import { readImageRuntimeConfig } from "../utils/image/provider-config.ts";
import { createOpenAIImageGenerationProvider } from "../utils/image/providers/openai-generations.ts";
import { createOpenAIImageVariationProvider } from "../utils/image/providers/openai-variation.ts";
import { createOpenAIResponsesImageProvider } from "../utils/image/providers/openai-responses.ts";
import { createTestImageProvider, testImageProvider } from "../utils/image/providers/test.ts";
import { createTestImageProcessor } from "../utils/image/processors/testprocessor.ts";

export default definePlugin(() => {
  const config = readImageRuntimeConfig();

  for (const processorConfig of config.processors) {
    if (processorConfig.enabled === false) {
      continue;
    }

    if (processorConfig.type === "testprocessor") {
      imageProcessorManager.add(createTestImageProcessor(processorConfig));
    }
  }

  if (config.providers.length === 0) {
    imageProviderManager.add(testImageProvider);
    return;
  }

  for (const providerConfig of config.providers) {
    if (providerConfig.enabled === false) {
      continue;
    }

    if (providerConfig.type === "openai-images") {
      imageProviderManager.add(createOpenAIImageGenerationProvider(providerConfig));
      continue;
    }

    if (providerConfig.type === "openai-variation") {
      imageProviderManager.add(createOpenAIImageVariationProvider(providerConfig));
      continue;
    }

    if (providerConfig.type === "openai-responses") {
      imageProviderManager.add(createOpenAIResponsesImageProvider(providerConfig));
      continue;
    }

    imageProviderManager.add(createTestImageProvider(providerConfig));
  }
});

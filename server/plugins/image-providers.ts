import { definePlugin } from "nitro";
import { imageProviderManager } from "../utils/image.ts";
import { readImageProviderConfigs } from "../utils/image/provider-config.ts";
import { createOpenAIImageGenerationProvider } from "../utils/image/providers/openai-generations.ts";
import { createOpenAIResponsesImageProvider } from "../utils/image/providers/openai-responses.ts";
import { testImageProvider } from "../utils/image/providers/test.ts";

export default definePlugin(() => {
  const configs = readImageProviderConfigs();

  if (configs.length === 0) {
    imageProviderManager.add(testImageProvider);
    return;
  }

  for (const config of configs) {
    if (config.enabled === false) {
      continue;
    }

    if (config.type === "openai-images") {
      imageProviderManager.add(createOpenAIImageGenerationProvider(config));
      continue;
    }

    if (config.type === "openai-responses") {
      imageProviderManager.add(createOpenAIResponsesImageProvider(config));
      continue;
    }

    imageProviderManager.add(testImageProvider);
  }
});

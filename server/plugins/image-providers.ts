import { definePlugin } from "nitro";
import { imageProviderManager } from "../utils/image.ts";
import { testImageProvider } from "../utils/image/providers/test.ts";

export default definePlugin(() => {
  imageProviderManager.add(testImageProvider);
});

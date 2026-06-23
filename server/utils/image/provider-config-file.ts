import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { imageLog } from "./logger.ts";

export const defaultImageConfigFile = "image-providers.config.json";

export const readImageConfigFile = (
  filePath: string = defaultImageConfigFile,
): unknown | undefined => {
  const configuredPath = process.env.NITRO_IMAGE_CONFIG_FILE;

  if (configuredPath !== undefined) {
    if (configuredPath.trim().length === 0) {
      imageLog("image config file disabled", {
        env: "NITRO_IMAGE_CONFIG_FILE",
      });
      return undefined;
    }

    filePath = configuredPath;
  }

  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    imageLog("image config file not found", {
      path: resolvedPath,
    });
    return undefined;
  }

  imageLog("image config file loaded", {
    path: resolvedPath,
  });

  return JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
};

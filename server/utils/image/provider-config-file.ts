import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const defaultImageConfigFile = "image-providers.config.json";

export const readImageConfigFile = (
  filePath: string = defaultImageConfigFile,
): unknown | undefined => {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
};

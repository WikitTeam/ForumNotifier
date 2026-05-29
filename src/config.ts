import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import type { NotifierConfig } from "./types.js";

const CONFIG_PATH = process.env.NOTIFIER_CONFIG ?? "./config.yaml";

let cached: NotifierConfig | null = null;

export function loadConfig(): NotifierConfig {
  if (cached) return cached;

  const raw = readFileSync(resolve(CONFIG_PATH), "utf-8");
  const parsed = yaml.load(raw) as NotifierConfig;

  if (!parsed.sites?.length) throw new Error("config: sites must be a non-empty array");
  if (!parsed.wikit?.graphql_url) throw new Error("config: wikit.graphql_url required");
  if (!parsed.wikit?.notify_url) throw new Error("config: wikit.notify_url required");
  if (!parsed.wikit?.users_url) throw new Error("config: wikit.users_url required");

  parsed.schedule ??= "*/10 * * * *";

  cached = parsed;
  return parsed;
}

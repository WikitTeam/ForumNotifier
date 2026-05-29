import cron from "node-cron";
import { loadConfig } from "./config.js";
import { runCycle } from "./engine.js";
import { log } from "./log.js";

const config = loadConfig();

log.info(
  { schedule: config.schedule, sites: config.sites.map((s) => s.url) },
  "Notifier starting"
);

runCycle().catch((err) => log.error({ err }, "Initial cycle failed"));

cron.schedule(config.schedule, () => {
  runCycle().catch((err) => log.error({ err }, "Scheduled cycle failed"));
});

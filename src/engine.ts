import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { log } from "./log.js";
import { fetchFeedPosts } from "./feed.js";
import { fetchSubscribers } from "./subscribers.js";
import { WikidotClient } from "./wikidot.js";
import { detectTargets } from "./detector.js";
import { composeMessages, dispatchMessages } from "./dispatcher.js";
import type { CheckpointState, Subscriber } from "./types.js";
import type { DetectionResult } from "./detector.js";

const STATE_FILE = resolve("./checkpoint.json");
const config = loadConfig();

function loadCheckpoint(): CheckpointState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as CheckpointState;
  } catch {
    return {};
  }
}

function saveCheckpoint(state: CheckpointState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function filterSubscribersBySite(subscribers: Subscriber[], siteWiki: string): Subscriber[] {
  return subscribers.filter((sub) => {
    if (sub.follow.length > 0) {
      return sub.follow.includes(siteWiki);
    }
    if (sub.unfollow.length > 0) {
      return !sub.unfollow.includes(siteWiki);
    }
    return true;
  });
}

export async function runCycle(): Promise<void> {
  log.info("=== Cycle start ===");
  const checkpoint = loadCheckpoint();
  const subscribers = await fetchSubscribers();

  if (!subscribers.length) {
    log.warn("No subscribers, skipping");
    return;
  }

  const allDetections: DetectionResult[] = [];

  for (const site of config.sites) {
    const since = checkpoint[site.url] ? new Date(checkpoint[site.url]) : null;
    const { posts, latestTime } = await fetchFeedPosts(site.url, since);

    if (latestTime) {
      checkpoint[site.url] = latestTime.toISOString();
    }

    if (!since) {
      log.info({ site: site.wiki }, "First run for site, recording checkpoint only");
      continue;
    }

    if (!posts.length) continue;

    const siteSubscribers = filterSubscribersBySite(subscribers, site.wiki);
    if (!siteSubscribers.length) {
      log.info({ site: site.wiki }, "No subscribers follow this site, skipping");
      continue;
    }

    const client = new WikidotClient(site.url);

    for (const post of posts) {
      try {
        const detections = await detectTargets(post, site, siteSubscribers, client);
        allDetections.push(...detections);
      } catch (err) {
        log.error({ err, postId: post.postId }, "Detection failed for post");
      }
    }

    client.clearCache();
  }

  if (allDetections.length > 0) {
    const messages = composeMessages(allDetections);
    await dispatchMessages(messages);
  } else {
    log.info("No notifications this cycle");
  }

  saveCheckpoint(checkpoint);
  log.info("=== Cycle complete ===");
}

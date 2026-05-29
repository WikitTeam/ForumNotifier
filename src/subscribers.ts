import { loadConfig } from "./config.js";
import { log } from "./log.js";
import type { Subscriber } from "./types.js";

const config = loadConfig();

let cachedSubscribers: Subscriber[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchSubscribers(): Promise<Subscriber[]> {
  const now = Date.now();
  if (cachedSubscribers && now - cacheTimestamp < CACHE_TTL) {
    return cachedSubscribers;
  }

  try {
    const res = await fetch(config.wikit.users_url);
    if (!res.ok) {
      log.warn({ status: res.status }, "Failed to fetch subscribers");
      return cachedSubscribers ?? [];
    }

    const data = (await res.json()) as Subscriber[];
    cachedSubscribers = data.map((s) => ({
      ...s,
      enableMention: s.enableMention ?? true,
      subscriptions: s.subscriptions ?? [],
      unsubscriptions: s.unsubscriptions ?? [],
      follow: s.follow ?? [],
      unfollow: s.unfollow ?? [],
    }));
    cacheTimestamp = now;
    log.info({ count: cachedSubscribers.length }, "Subscribers loaded");
    return cachedSubscribers;
  } catch (err) {
    log.error({ err }, "Subscriber fetch error");
    return cachedSubscribers ?? [];
  }
}

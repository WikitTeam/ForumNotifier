import { loadConfig } from "./config.js";
import { log } from "./log.js";
import type { PageAuthorInfo } from "./types.js";

const config = loadConfig();
const MAX_RETRIES = 5;
const BASE_DELAY = 500;

export async function queryPageAuthor(
  wiki: string,
  page: string
): Promise<PageAuthorInfo | null> {
  const query = `query { article(wiki: "${wiki}", page: "${page}") { author created_at lastmod } }`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(config.wikit.graphql_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0", 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : BASE_DELAY * Math.pow(2, attempt);
        log.warn({ attempt, delay }, "GraphQL rate limited, retrying");
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        log.warn({ status: res.status, wiki, page }, "GraphQL request failed");
        return null;
      }

      const json = (await res.json()) as { data?: { article?: PageAuthorInfo } };
      return json.data?.article ?? null;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) {
        log.error({ err, wiki, page }, "GraphQL request error");
        return null;
      }
      await sleep(BASE_DELAY * Math.pow(2, attempt));
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

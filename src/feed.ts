import RSSParser from "rss-parser";
import { log } from "./log.js";
import type { FeedPost } from "./types.js";

const rssParser = new RSSParser({
  customFields: {
    item: [
      ["wikidot:authorName", "wikidotAuthorName"],
      ["wikidot:authorUserId", "wikidotAuthorUserId"],
    ],
  },
});

export async function fetchFeedPosts(
  siteUrl: string,
  since: Date | null
): Promise<{ posts: FeedPost[]; latestTime: Date | null }> {
  const feedUrl = `${siteUrl.replace(/\/$/, "")}/feed/forum/posts.xml`;
  log.info({ feedUrl }, "Fetching forum RSS");

  try {
    const feed = await rssParser.parseURL(feedUrl);
    const posts: FeedPost[] = [];
    let latestTime: Date | null = null;

    for (const entry of feed.items) {
      const pubDate = entry.pubDate ? new Date(entry.pubDate) : new Date();
      if (since && pubDate <= since) continue;

      if (!latestTime || pubDate > latestTime) latestTime = pubDate;

      const link = normalizeLink(entry.link ?? "", siteUrl);
      const postId = extractPostId(link);
      const threadId = extractThreadId(link);

      if (!postId || !threadId) continue;

      posts.push({
        postId,
        threadId,
        title: entry.title ?? "",
        link,
        authorName: (entry as unknown as Record<string, string>)["wikidotAuthorName"] ?? entry.creator ?? "unknown",
        htmlContent: entry.content ?? entry.contentSnippet ?? "",
        publishedAt: pubDate,
        siteUrl,
      });
    }

    log.info({ siteUrl, count: posts.length }, "Feed parsed");
    return { posts, latestTime };
  } catch (err) {
    log.error({ err, siteUrl }, "Feed fetch failed");
    return { posts: [], latestTime: null };
  }
}

function normalizeLink(link: string, siteUrl: string): string {
  if (link.startsWith("//")) return `https:${link}`;
  if (link.startsWith("/")) return `${siteUrl}${link}`;
  return link;
}

function extractPostId(link: string): number {
  const m = link.match(/#post-(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function extractThreadId(link: string): number {
  const m = link.match(/\/forum\/t-(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

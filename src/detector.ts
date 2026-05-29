import * as cheerio from "cheerio";
import { log } from "./log.js";
import { queryPageAuthor } from "./wikit.js";
import { WikidotClient } from "./wikidot.js";
import type {
  FeedPost,
  ForumPost,
  ForumThread,
  NotifyEvent,
  SiteEntry,
  Subscriber,
} from "./types.js";

export interface DetectionResult {
  targetUsername: string;
  event: NotifyEvent;
}

export async function detectTargets(
  feedPost: FeedPost,
  site: SiteEntry,
  subscribers: Subscriber[],
  client: WikidotClient
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  const notifiedSet = new Set<string>();

  let thread: ForumThread | null = null;
  let fullPost: ForumPost | null = null;

  try {
    thread = await client.getThread(feedPost.threadId);
    fullPost = await client.getPostWithParents(feedPost.threadId, feedPost.postId);
  } catch (err) {
    log.warn({ err, postId: feedPost.postId }, "Failed to fetch post details, using RSS data only");
  }

  const replyTargets = await detectReplies(feedPost, thread, fullPost, site, subscribers);
  for (const r of replyTargets) {
    if (!notifiedSet.has(r.targetUsername)) {
      results.push(r);
      notifiedSet.add(r.targetUsername);
    }
  }

  const subTargets = detectSubscriptions(feedPost, thread, fullPost, subscribers);
  for (const s of subTargets) {
    if (!notifiedSet.has(s.targetUsername)) {
      results.push(s);
      notifiedSet.add(s.targetUsername);
    }
  }

  applyUnsubscriptions(results, feedPost, thread, subscribers);

  const mentionTargets = detectMentions(feedPost, thread, fullPost, subscribers);
  for (const m of mentionTargets) {
    if (!notifiedSet.has(m.targetUsername)) {
      results.push(m);
      notifiedSet.add(m.targetUsername);
    }
  }

  const filtered = results.filter((r) => r.targetUsername !== feedPost.authorName);
  return filtered;
}

async function detectReplies(
  feedPost: FeedPost,
  thread: ForumThread | null,
  fullPost: ForumPost | null,
  site: SiteEntry,
  subscribers: Subscriber[]
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  const baseEvent: Omit<NotifyEvent, "type"> = {
    postAuthor: feedPost.authorName,
    threadTitle: thread?.title ?? feedPost.title,
    postLink: feedPost.link,
    postTitle: fullPost?.title || feedPost.title,
  };

  if (fullPost?.parents.length) {
    for (const parent of fullPost.parents) {
      const target = findSubscriberByUnixName(subscribers, parent.createdBy);
      if (target) {
        results.push({ targetUsername: target.username, event: { ...baseEvent, type: "post_reply" } });
      }
    }
  }

  if (thread?.createdBy) {
    const threadCreator = findSubscriberByUnixName(subscribers, thread.createdBy);
    if (threadCreator) {
      results.push({ targetUsername: threadCreator.username, event: { ...baseEvent, type: "thread_reply" } });
    }
  }

  if (thread?.pageFullname) {
    const authorInfo = await queryPageAuthor(site.wiki, thread.pageFullname);
    if (authorInfo?.author) {
      const pageAuthor = findSubscriberByWikidot(subscribers, authorInfo.author);
      if (pageAuthor) {
        results.push({ targetUsername: pageAuthor.username, event: { ...baseEvent, type: "article_reply" } });
      }
    }
  }

  return results;
}

function detectMentions(
  feedPost: FeedPost,
  thread: ForumThread | null,
  fullPost: ForumPost | null,
  subscribers: Subscriber[]
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const html = fullPost?.content ?? feedPost.htmlContent;
  const $ = cheerio.load(html);

  $("span.printuser").each((_, el) => {
    const userLink = $(el).find("a[href*='/user:info/']");
    if (!userLink.length) return;

    const href = userLink.attr("href") ?? "";
    const nameMatch = href.match(/\/user:info\/(.+)$/);
    if (!nameMatch) return;

    const mentionedName = nameMatch[1];

    for (const sub of subscribers) {
      if (!sub.enableMention) continue;
      const subName = sub.username.toLowerCase();
      if (mentionedName.toLowerCase() !== subName) continue;

      results.push({
        targetUsername: sub.username,
        event: {
          type: "mention",
          postAuthor: feedPost.authorName,
          threadTitle: thread?.title ?? feedPost.title,
          postLink: feedPost.link,
          postTitle: fullPost?.title || feedPost.title,
        },
      });
    }
  });

  return results;
}

function detectSubscriptions(
  feedPost: FeedPost,
  thread: ForumThread | null,
  fullPost: ForumPost | null,
  subscribers: Subscriber[]
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const postUrls = buildContextUrls(feedPost, thread);

  for (const sub of subscribers) {
    if (!sub.subscriptions.length) continue;
    const match = sub.subscriptions.some((s) => postUrls.some((u) => u.includes(s)));
    if (match) {
      results.push({
        targetUsername: sub.username,
        event: {
          type: "subscription",
          postAuthor: feedPost.authorName,
          threadTitle: thread?.title ?? feedPost.title,
          postLink: feedPost.link,
          postTitle: fullPost?.title || feedPost.title,
        },
      });
    }
  }

  return results;
}

function applyUnsubscriptions(
  results: DetectionResult[],
  feedPost: FeedPost,
  thread: ForumThread | null,
  subscribers: Subscriber[]
): void {
  const postUrls = buildContextUrls(feedPost, thread);

  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].event.type === "mention") continue;

    const sub = subscribers.find((s) => s.username === results[i].targetUsername);
    if (!sub?.unsubscriptions.length) continue;

    const blocked = sub.unsubscriptions.some((u) => postUrls.some((p) => p.includes(u)));
    if (blocked) {
      results.splice(i, 1);
    }
  }
}

function buildContextUrls(feedPost: FeedPost, thread: ForumThread | null): string[] {
  const urls: string[] = [];
  const normalized = feedPost.link.replace(/^https?:\/\//, "");
  urls.push(normalized);

  const threadUrl = normalized.replace(/#.*$/, "");
  urls.push(threadUrl);

  if (thread?.pageFullname) {
    const siteHost = feedPost.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    urls.push(`${siteHost}/${thread.pageFullname}`);
  }

  return urls;
}

function findSubscriberByWikidot(subscribers: Subscriber[], name: string): Subscriber | undefined {
  const normalized = name.toLowerCase();
  return subscribers.find(
    (s) => s.username.toLowerCase() === normalized
  );
}

function findSubscriberByUnixName(subscribers: Subscriber[], user: { id: number | null; name: string; unixName: string }): Subscriber | undefined {
  if (user.id) {
    const byId = subscribers.find((s) => s.wikidotId === user.id);
    if (byId) return byId;
  }
  if (user.unixName) {
    const normalized = user.unixName.toLowerCase();
    const byUnix = subscribers.find((s) => s.username.toLowerCase() === normalized);
    if (byUnix) return byUnix;
  }
  if (user.name) {
    return findSubscriberByWikidot(subscribers, user.name);
  }
  return undefined;
}

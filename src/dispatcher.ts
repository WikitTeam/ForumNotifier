import { loadConfig } from "./config.js";
import { log } from "./log.js";
import type { NotifyEvent, NotifyMessage } from "./types.js";
import type { DetectionResult } from "./detector.js";

const config = loadConfig();

export function composeMessages(detections: DetectionResult[]): NotifyMessage[] {
  const grouped = new Map<string, NotifyEvent[]>();

  for (const d of detections) {
    const events = grouped.get(d.targetUsername) ?? [];
    events.push(d.event);
    grouped.set(d.targetUsername, events);
  }

  const messages: NotifyMessage[] = [];
  for (const [username, events] of grouped) {
    messages.push({ username, text: formatEvents(events) });
  }
  return messages;
}

function formatEvents(events: NotifyEvent[]): string {
  const postReplies = events.filter((e) => e.type === "post_reply");
  const threadReplies = events.filter((e) => e.type === "thread_reply");
  const articleReplies = events.filter((e) => e.type === "article_reply");
  const mentions = events.filter((e) => e.type === "mention");
  const subs = events.filter((e) => e.type === "subscription");
  const sections: string[] = [];

  if (postReplies.length > 0) {
    sections.push("**帖子回复：**");
    for (const r of postReplies) {
      sections.push(
        `* [[*user ${r.postAuthor}]]回复了您在**${r.threadTitle}**中的发言 [[[${r.postLink}|查看]]]`
      );
    }
  }

  if (threadReplies.length > 0) {
    if (sections.length) sections.push("");
    sections.push("**帖子串回复：**");
    for (const r of threadReplies) {
      sections.push(
        `* [[*user ${r.postAuthor}]]在您发起的讨论串**${r.threadTitle}**中发表了回复 [[[${r.postLink}|查看]]]`
      );
    }
  }

  if (articleReplies.length > 0) {
    if (sections.length) sections.push("");
    sections.push("**文章讨论：**");
    for (const r of articleReplies) {
      sections.push(
        `* [[*user ${r.postAuthor}]]在您的文章**${r.threadTitle}**的讨论区发表了回复 [[[${r.postLink}|查看]]]`
      );
    }
  }

  if (mentions.length > 0) {
    if (sections.length) sections.push("");
    sections.push("**提及通知：**");
    for (const m of mentions) {
      sections.push(
        `* [[*user ${m.postAuthor}]]在帖子**${m.threadTitle}**中提及了您 [[[${m.postLink}|查看]]]`
      );
    }
  }

  if (subs.length > 0) {
    if (sections.length) sections.push("");
    sections.push("**订阅通知：**");
    for (const s of subs) {
      sections.push(
        `* [[*user ${s.postAuthor}]]在您订阅的**${s.threadTitle}**中发表了新帖 [[[${s.postLink}|查看]]]`
      );
    }
  }

  return sections.join("\n");
}

export async function dispatchMessages(messages: NotifyMessage[]): Promise<void> {
  let success = 0;
  let failed = 0;

  for (const msg of messages) {
    try {
      const res = await fetch(config.wikit.notify_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Notify-Token": process.env.NOTIFY_TOKEN ?? "",
        },
        body: JSON.stringify(msg),
      });

      if (res.ok) {
        success++;
        log.info({ username: msg.username }, "Notification sent");
      } else {
        failed++;
        log.warn({ username: msg.username, status: res.status }, "Notification failed");
      }
    } catch (err) {
      failed++;
      log.error({ err, username: msg.username }, "Notification error");
    }
  }

  log.info({ success, failed, total: messages.length }, "Dispatch complete");
}

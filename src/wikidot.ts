import * as cheerio from "cheerio";
import { log } from "./log.js";
import type { ForumPost, ForumThread, WikidotUser, UserKind } from "./types.js";

const MAX_RETRIES = 8;
const BASE_DELAY = 400;
const TOKEN7 = "kakushi";
const USER_AGENT = "Notifier/1.0";

interface AmcResponse {
  status: string;
  body?: string;
  message?: string;
}

export class WikidotClient {
  private siteUrl: string;
  private threadCache = new Map<number, ForumThread>();
  private postCache = new Map<number, ForumPost>();

  constructor(siteUrl: string) {
    this.siteUrl = siteUrl.replace(/\/$/, "");
  }

  private async callAmc(moduleName: string, params: Record<string, string | number> = {}): Promise<AmcResponse> {
    const url = `${this.siteUrl}/ajax-module-connector.php`;
    const formData = new URLSearchParams({
      moduleName,
      wikidot_token7: TOKEN7,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
            Cookie: `wikidot_token7=${TOKEN7}`,
          },
          body: formData.toString(),
        });

        if (res.status === 429 || res.status >= 500) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          log.warn({ status: res.status, attempt, delay }, "AMC retrying");
          await sleep(delay);
          continue;
        }

        const json = (await res.json()) as AmcResponse;
        if (json.status === "try_again") {
          await sleep(BASE_DELAY * Math.pow(2, attempt));
          continue;
        }
        if (json.status !== "ok") {
          throw new Error(`AMC error: ${json.status} - ${json.message ?? ""}`);
        }
        return json;
      } catch (err: unknown) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await sleep(BASE_DELAY * Math.pow(2, attempt));
      }
    }
    throw new Error(`AMC failed after ${MAX_RETRIES} retries`);
  }

  async getThread(threadId: number): Promise<ForumThread> {
    const cached = this.threadCache.get(threadId);
    if (cached) return cached;

    const resp = await this.callAmc("forum/ForumViewThreadModule", { t: threadId });
    const $ = cheerio.load(resp.body ?? "");

    const bcEl = $("div.forum-breadcrumbs");
    let title = "";
    if (bcEl.length) {
      const lastText = bcEl.contents().last().text().trim();
      title = lastText.replace(/^»\s*/, "");
    }
    if (!title) {
      title = $("title").text().trim() || `Thread #${threadId}`;
    }

    let pageFullname: string | null = null;
    $("div.description-block a[href^='/']").each((_, el) => {
      if (pageFullname) return;
      const href = $(el).attr("href") ?? "";
      const candidate = href.replace(/^\//, "");
      if (!candidate.startsWith("forum") && !candidate.startsWith("feed")) {
        pageFullname = candidate;
      }
    });

    const creatorEl = $("div.statistics span.printuser");
    const createdBy = this.parseUserElement(creatorEl, $);

    const thread: ForumThread = {
      id: threadId,
      title,
      createdBy,
      pageFullname,
      postCount: 0,
    };

    this.threadCache.set(threadId, thread);
    return thread;
  }

  async getPostWithParents(threadId: number, postId: number): Promise<ForumPost> {
    const cached = this.postCache.get(postId);
    if (cached) return cached;

    const resp = await this.callAmc("forum/ForumViewThreadPostsModule", {
      t: threadId,
      postId,
    });
    const $ = cheerio.load(resp.body ?? "");

    const post = this.parsePostElement($, postId);
    post.parents = this.buildParentChain($, postId);

    this.postCache.set(postId, post);
    return post;
  }

  private parsePostElement($: cheerio.CheerioAPI, postId: number): ForumPost {
    const postEl = $(`#post-${postId}`);
    const container = postEl.closest(".post-container");

    const titleEl = container.find("div.title").first();
    const contentEl = container.find("div.content").first();
    const userEl = container.find("div.info span.printuser").first();
    const dateEl = container.find("div.info span.odate").first();

    const parentContainer = container.parent().closest(".post-container");
    let parentId: number | null = null;
    if (parentContainer.length) {
      const parentPostEl = parentContainer.children(".post").first();
      const parentIdAttr = parentPostEl.attr("id");
      if (parentIdAttr) {
        const m = parentIdAttr.match(/post-(\d+)/);
        if (m) parentId = parseInt(m[1], 10);
      }
    }

    const createdBy = this.parseUserElement(userEl, $);

    let createdAt = new Date();
    if (dateEl.length) {
      const classAttr = dateEl.attr("class") ?? "";
      const timeMatch = classAttr.match(/time_(\d+)/);
      if (timeMatch) {
        createdAt = new Date(parseInt(timeMatch[1], 10) * 1000);
      }
    }

    return {
      id: postId,
      threadId: 0,
      title: titleEl.text().trim(),
      content: contentEl.html() ?? "",
      createdBy,
      createdAt,
      parentId,
      parents: [],
    };
  }

  private buildParentChain($: cheerio.CheerioAPI, targetPostId: number): ForumPost[] {
    const parents: ForumPost[] = [];
    let container = $(`#post-${targetPostId}`).closest(".post-container").parent().closest(".post-container");

    while (container.length) {
      const postEl = container.children(".post").first();
      const idAttr = postEl.attr("id");
      if (!idAttr) break;

      const m = idAttr.match(/post-(\d+)/);
      if (!m) break;

      const pid = parseInt(m[1], 10);
      const parent = this.parsePostElement($, pid);
      parents.push(parent);

      container = container.parent().closest(".post-container");
    }

    return parents;
  }

  private parseUserElement(el: ReturnType<cheerio.CheerioAPI>, $: cheerio.CheerioAPI): WikidotUser {
    if (!el.length) {
      return { kind: "anonymous" as UserKind, id: null, name: "anonymous", unixName: "anonymous" };
    }

    if (el.hasClass("deleted") || el.find(".deleted").length) {
      const dataId = el.attr("data-id");
      return { kind: "deleted" as UserKind, id: dataId ? parseInt(dataId, 10) : null, name: "(account deleted)", unixName: "account_deleted" };
    }

    if (el.hasClass("anonymous")) {
      return { kind: "anonymous" as UserKind, id: null, name: "anonymous", unixName: "anonymous" };
    }

    const allLinks = el.find("a");
    let userLink = el.find("a[href*='/user:info/']").last();
    if (!userLink.length && allLinks.length) {
      userLink = allLinks.last();
    }

    if (userLink.length) {
      const href = userLink.attr("href") ?? "";
      const nameMatch = href.match(/\/user:info\/(.+)$/);
      const unixName = nameMatch?.[1] ?? "";
      const name = userLink.text().trim() || unixName;

      let id: number | null = null;
      const onclick = userLink.attr("onclick") ?? el.attr("onclick") ?? "";
      const idMatch = onclick.match(/WIKIDOT\.page\.listeners\.userInfo\((\d+)\)/);
      if (idMatch) {
        id = parseInt(idMatch[1], 10);
      }

      return { kind: "user" as UserKind, id, name, unixName };
    }

    return { kind: "anonymous" as UserKind, id: null, name: el.text().trim() || "anonymous", unixName: "" };
  }

  clearCache(): void {
    this.threadCache.clear();
    this.postCache.clear();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

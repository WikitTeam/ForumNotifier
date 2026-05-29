
export interface SiteEntry {
  url: string;
  wiki: string;
}

export interface WikitEndpoints {
  graphql_url: string;
  notify_url: string;
  users_url: string;
}

export interface NotifierConfig {
  sites: SiteEntry[];
  wikit: WikitEndpoints;
  schedule: string;
}


export enum UserKind {
  USER = "user",
  DELETED = "deleted",
  ANONYMOUS = "anonymous",
  GUEST = "guest",
  SYSTEM = "system",
}

export interface WikidotUser {
  kind: UserKind;
  id: number | null;
  name: string;
  unixName: string;
}

export interface ForumThread {
  id: number;
  title: string;
  createdBy: WikidotUser | null;
  pageFullname: string | null;
  postCount: number;
}

export interface ForumPost {
  id: number;
  threadId: number;
  title: string;
  content: string;
  createdBy: WikidotUser;
  createdAt: Date;
  parentId: number | null;
  parents: ForumPost[];
}


export interface FeedPost {
  postId: number;
  threadId: number;
  title: string;
  link: string;
  authorName: string;
  htmlContent: string;
  publishedAt: Date;
  siteUrl: string;
}


export interface Subscriber {
  username: string;
  wikidotId: number | null;
  enableMention: boolean;
  subscriptions: string[];
  unsubscriptions: string[];
  follow: string[];
  unfollow: string[];
}


export interface PageAuthorInfo {
  author: string | null;
  created_at: string | null;
  lastmod: string | null;
}


export interface NotifyEvent {
  type: "post_reply" | "thread_reply" | "article_reply" | "mention" | "subscription";
  postAuthor: string;
  threadTitle: string;
  postLink: string;
  postTitle: string;
}

export interface NotifyMessage {
  username: string;
  text: string;
}


export interface CheckpointState {
  [siteUrl: string]: string;
}

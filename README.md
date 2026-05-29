# ForumNotifier

Wikidot论坛活动通知服务。监控指定站点的论坛，检测回复、提及和订阅事件，调用WikitAPI向订阅用户的站内信箱发送通知。

## 功能

- **回复通知** — 有人回复了你的帖子、你发起的讨论串、或你的文章讨论区
- **提及通知** — 帖子内容中 使用[[*user]]或[[user]]提及了你
- **订阅通知** — 你订阅的页面/讨论串有新回复
- **退订支持** — 屏蔽特定页面/讨论串的通知
- **多站点** — 同时监控多个Wikit支持的Wikidot站点
- **站点过滤** — 订阅者可通过follow/unfollow选择接收哪些站点的通知

## 配置

创建 `config.yaml`：

```yaml
sites:
  - url: https://your-site.wikidot.com
    wiki: your-site

wikit:
  graphql_url: https://wikit.unitreaty.org/apiv1/graphql
  notify_url: https://wikit.unitreaty.org/api/notify
  users_url: https://wikit.unitreaty.org/api/notification-users

schedule: "*/5 * * * *"
```

配置文件路径可通过环境变量 `NOTIFIER_CONFIG` 覆盖。

## 环境变量

| 变量 | 说明 |
|------|------|
| `NOTIFIER_CONFIG` | 配置文件路径（默认 `./config.yaml`） |
| `NOTIFY_TOKEN` | 通知接口认证 token |
| `LOG_LEVEL` | 日志级别（默认 `info`） |

## 安装与运行

```bash
npm install
npm run build
npm start
```

单次执行（不启动定时任务）：

```bash
npm run cycle
```

开发模式：

```bash
npm run dev
```

## checkpoint.json说明

运行状态保存在 `checkpoint.json`，记录每个站点最后处理的时间戳。首次运行只静默记录时间点，不发送通知。

## 订阅者数据格式

从 `wikit.users_url` 获取的 JSON 数组：

```json
[
  {
    "username": "user1",
    "wikidotId": 12345,
    "enableMention": true,
    "subscriptions": ["your-wiki.wikidot.com/forum/t-123"],
    "unsubscriptions": [],
    "follow": ["your-wiki-2"],
    "unfollow": []
  }
]
```

| 字段 | 说明 |
|------|------|
| `username` | 用户名 |
| `wikidotId` | Wikidot用户ID |
| `enableMention` | 是否接收提及通知 |
| `subscriptions` | 订阅的 URL 片段列表 |
| `unsubscriptions` | 屏蔽的 URL 片段列表 |
| `follow` | 只接收这些站点的通知 |
| `unfollow` | 不接收这些站点的通知 |

---
name: persistent-memory-claw
description: "跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。使用 SQLite 存储，按日期保存对话，支持增量保存。自动保存通过 Hook 实现，支持 LLM 摘要生成。"
metadata: {"openclaw": {"emoji": "🧠", "requires": {"bins": ["node"]}}}
---

# Persistent Memory

为 OpenClaw agent 提供跨会话持久记忆能力。

## 核心功能

### 1. 自动保存会话
当 OpenClaw 会话即将压缩时，自动保存所有对话：

- 存储路径：`{workspace}/memory/{YYYY-MM-DD}.db`
- 增量保存：多次压缩只保存新增消息
- 元数据记录：记录每个 session 保存位置，避免重复

### 2. 搜索记忆
当用户说"搜索 XXX"、"查找 XXX"时：

```javascript
const { search } = require('./actions/search');
await search({
  workspace: '{workspace}',
  query: '关键词',
  date: '2026-03-17'  // 可选
});
```

CLI 用法：
```bash
node actions/search.js --query "关键词"
node actions/search.js --query "关键词" --date 2026-03-17
```

### 3. 列出记忆
当用户说"查看记忆"、"列出记忆"时：

```javascript
const { list } = require('./actions/list');
await list({
  workspace: '{workspace}',
  date: '2026-03-17'  // 可选
});
```

CLI 用法：
```bash
node actions/list.js
node actions/list.js --date 2026-03-17
```

### 4. LLM 摘要生成
当用户说"生成摘要"、"总结"时：

```javascript
const { summarize } = require('./actions/summarize');
await summarize({ 
  workspace: '{workspace}', 
  date: '2026-03-17'
});
```

CLI 用法：
```bash
node actions/summarize.js
node actions/summarize.js --date 2026-03-17
```

## 存储结构

```
{workspace}/memory/
├── 2026-03-17.db   ← 3月17日的对话
├── 2026-03-16.db   ← 3月16日的对话
└── 2026-03-15.db   ← 3月15日的对话
```

## SQLite 表结构

### memories 表
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session ON memories(session_id);
CREATE INDEX idx_timestamp ON memories(timestamp);
```

### meta 表（记录保存位置）
```sql
CREATE TABLE meta (
  session_id TEXT PRIMARY KEY,
  last_line_index INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 意图识别

| 功能 | 触发关键词 |
|------|-----------|
| 搜索记忆 | 搜索、查找、找一下、记得 |
| 查看记忆 | 查看记忆、列出记忆、今天的记忆 |
| LLM 摘要 | 摘要、总结、提炼 |
| 按日期查询 | 2026年3月17日、昨天、上周 |

## 自动保存 Hook

### 首次启用（一次性操作）
```bash
openclaw hooks enable persistent-memory-auto-save
```

### 检查状态
```bash
openclaw hooks list
```

### 禁用
```bash
openclaw hooks disable persistent-memory-auto-save
```

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

---
name: persistent-memory-claw
description: "跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。使用 SQLite 存储，按日期保存对话，支持增量保存。自动保存通过 Hook 实现。"
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

### 2. 列出记忆
当用户说"查看记忆"、"列出记忆"时：

```javascript
const { list } = require('./actions/list');
await list({
  workspace: '{workspace}',
  date: '2026-03-17'  // 可选，指定日期
});
```

CLI 用法：
```bash
# 列出今天的所有对话
node actions/list.js --workspace /path/to/workspace

# 查看指定日期的记忆
node actions/list.js --workspace /path/to/workspace --date 2026-03-17
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
| 查看记忆 | 查看记忆、列出记忆、今天的记忆、昨天的记忆 |
| 按日期查询 | 2026年3月17日、昨天、上周 |

## 自动保存 Hook

### 启用
```bash
openclaw hooks enable persistent-memory-auto-save
```

### 禁用
```bash
openclaw hooks disable persistent-memory-auto-save
```

### 工作流程

```
会话压缩前 → 触发 session:compact:before → 读取 transcript
    ↓
从 meta 表获取上次保存的行号
    ↓
增量读取新消息
    ↓
保存到 memory/YYYY-MM-DD.db
    ↓
更新 meta 表
```

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

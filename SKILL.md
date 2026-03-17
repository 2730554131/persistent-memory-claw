---
name: persistent-memory-claw
description: "跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。使用 SQLite 存储，按日期保存，手动触发更可控。"
metadata: {"openclaw": {"emoji": "🧠", "requires": {"bins": ["node"]}}}
---

# Persistent Memory

为 OpenClaw agent 提供跨会话持久记忆能力。

## 核心功能

### 1. 手动保存记忆 (v2.1 智能标记)
当用户说"记住 XXX"、"保存 XXX"时：

```javascript
const { save } = require('./actions/save');
await save({
  workspace: '{workspace}',
  content: '要记住的内容',
  autoTag: true  // 默认开启智能标记
});
```

CLI 用法：
```bash
# 自动智能标记（默认）
node actions/save.js --content "要记住的内容"

# 指定分类
node actions/save.js --content "任务" --category "task"

# 禁用智能标记
node actions/save.js --content "内容" --no-auto-tag
```

**v2.1 智能标记**：
- 自动分析内容重要性（1-10星）
- 自动分类：task / promise / decision / normal

### 2. 手动生成摘要
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

### 3. 搜索记忆
当用户说"搜索 XXX"、"查找 XXX"时：

```javascript
const { search } = require('./actions/search');
await search({
  workspace: '{workspace}',
  query: '关键词',
  date: '2026-03-17'
});
```

CLI 用法：
```bash
node actions/search.js --query "关键词"
node actions/search.js --query "关键词" --date 2026-03-17
```

### 4. 列出记忆
当用户说"查看记忆"、"列出记忆"时：

```javascript
const { list } = require('./actions/list');
await list({
  workspace: '{workspace}',
  date: '2026-03-17'
});
```

CLI 用法：
```bash
node actions/list.js
node actions/list.js --date 2026-03-17
```

## 存储结构

```
{workspace}/memory/
├── 2026-03-17.db     # 3月17日的记忆
├── 2026-03-16.db     # 3月16日的记忆
├── 2026-03-17-summary.md  # 摘要文件
└── ...
```

## SQLite 表结构

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'default',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 意图识别

| 功能 | 触发关键词 |
|------|-----------|
| 保存记忆（智能标记） | 记住、保存、记录、存一下 |
| 生成摘要 | 摘要、总结、提炼 |
| 搜索记忆 | 搜索、查找、找一下、记得 |
| 列出记忆 | 查看记忆、列出记忆、今天的记忆 |

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

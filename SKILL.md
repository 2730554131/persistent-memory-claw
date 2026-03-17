---
name: persistent-memory-claw
description: "跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。使用 SQLite 存储，支持保存记忆、搜索记忆、列出记忆，自动保存会话功能。触发条件：用户提及'记住'、'记录'、'保存'、'搜索记忆'、'列出记忆'等关键词。"
metadata: {"openclaw": {"emoji": "🧠", "requires": {"bins": ["node"]}}}
---

# Persistent Memory

为 OpenClaw agent 提供跨会话持久记忆能力。

## 核心功能

### 1. 保存记忆
当用户说"记住 XXX"、"记录 XXX"、"保存 XXX"时：

```javascript
const { save } = require('./actions/save');
await save({
  category: 'knowledgeBase',
  content: '要记住的内容',
  workspace: '{workspace}',
  sessionId: '{sessionId}'
});
```

CLI 用法：
```bash
node scripts/memory.cjs save knowledgeBase "记住的内容"
```

### 2. 搜索记忆
当用户说"搜索 XXX"、"查找 XXX"时：

```javascript
const { search } = require('./actions/search');
await search({
  query: '关键词',
  workspace: '{workspace}',
  sessionId: '{sessionId}',
  searchAll: false // 是否搜索所有记忆文件
});
```

CLI 用法：
```bash
node scripts/memory.cjs search 关键词
```

### 3. 列出记忆
当用户说"列出记忆"、"查看所有记忆"时：

```javascript
const { list } = require('./actions/list');
await list({
  workspace: '{workspace}',
  sessionId: '{sessionId}'
});
```

CLI 用法：
```bash
node scripts/memory.cjs list
```

### 4. 自动保存会话
当上下文达到 80% 时自动保存会话并重置：

```javascript
// 1. 保存当前会话到记忆
const { save } = require('./actions/save');
await save({
  category: 'conversation',
  content: { 
    sessionId: '{sessionId}',
    transcript: '会话内容...',
    timestamp: new Date().toISOString()
  },
  workspace: '{workspace}'
});

// 2. 触发 /new 创建新会话
```

## 存储结构

- **数据库路径**：`{workspace}/memory/{sessionId}.db`
- **存储方式**：SQLite

## SQLite 表结构

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'default',
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 意图识别

| 功能 | 触发关键词 |
|------|-----------|
| 保存记忆 | 记住、记录、保存、存一下、记下来、帮我记、别忘了、收藏 |
| 搜索记忆 | 搜索、查找、找一下、记得、之前说、刚才说 |
| 列出记忆 | 列出、查看、看看、显示 |

## 自动保存会话（Hook 方式）

### 启用自动保存 Hook

首次使用需要运行以下命令启用自动保存功能：

```bash
# 启用自动保存 Hook
openclaw hooks enable persistent-memory-auto-save
```

**说明**：
- 启用后，当 OpenClaw 会话即将进行压缩时（context 接近满时），会自动保存会话内容到 SQLite 数据库
- 这是**一次性操作**，启用后会一直生效

### 检查 Hook 状态

```bash
# 查看 Hook 列表
openclaw hooks list
```

### 禁用自动保存

```bash
# 禁用自动保存 Hook
openclaw hooks disable persistent-memory-auto-save
```

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

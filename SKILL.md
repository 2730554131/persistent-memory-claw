---
name: persistent-memory-claw
description: "跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。使用 SQLite 存储，支持按日期保存和查询记忆。触发条件：用户提及'记住'、'记录'、'保存'、'搜索记忆'、'列出记忆'等关键词。"
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
  sessionId: '{sessionId}'
});
```

CLI 用法：
```bash
node scripts/memory.cjs search 关键词
```

### 3. 列出记忆
当用户说"列出记忆"、"查看记忆"时：

```javascript
const { list } = require('./actions/list');
await list({
  workspace: '{workspace}',
  date: '2026-03-17'  // 可选，指定日期
});
```

CLI 用法：
```bash
# 列出所有记忆
node scripts/memory.cjs list

# 列出指定日期的记忆
node scripts/memory.cjs list 2026-03-17
```

**按日期查询示例：**
- 用户说"查看2026年3月17日的记忆" → 返回那天所有对话
- 用户说"列出今天的记忆" → 返回当天对话

### 4. 自动保存会话
当上下文达到 80% 时自动保存会话并重置：

**存储结构按日期组织：**
- 路径：`{workspace}/memory/{YYYY-MM-DD}.db`
- 每条消息包含：session_id, role, content, created_at

## 存储结构

```
{workspace}/memory/
├── 2026-03-17.db   # 2026年3月17日的记忆
├── 2026-03-16.db   # 2026年3月16日的记忆
└── 2026-03-15.db   # 2026年3月15日的记忆
```

## SQLite 表结构

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session ON memories(session_id);
CREATE INDEX idx_created ON memories(created_at);
```

## 意图识别

| 功能 | 触发关键词 |
|------|-----------|
| 保存记忆 | 记住、记录、保存、存一下、记下来、帮我记、别忘了、收藏 |
| 搜索记忆 | 搜索、查找、找一下、记得、之前说、刚才说 |
| 列出记忆 | 列出、查看、看看、显示 |
| 按日期查询 | 2026年3月17日、昨天、上周 |

## 使用示例

**Q: 查看2026年3月17日的记忆**
```
返回：
{
  "date": "2026-03-17",
  "count": 2,
  "results": [
    {
      "sessionId": "abc123",
      "messages": [
        {"role": "user", "content": "我的名字叫小明"},
        {"role": "assistant", "content": "好的，我记住了"}
      ]
    }
  ]
}
```

## 自动保存会话（Hook 方式）

### 启用自动保存 Hook

首次使用需要运行以下命令启用自动保存功能：

```bash
openclaw hooks enable persistent-memory-auto-save
```

### 检查 Hook 状态

```bash
openclaw hooks list
```

### 禁用自动保存

```bash
openclaw hooks disable persistent-memory-auto-save
```

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

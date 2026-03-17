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

### 2. 搜索记忆
当用户说"搜索 XXX"、"查找 XXX"、"N-gram 搜索"、"混合搜索"、"热词"时：

```javascript
const { search } = require('./actions/search');
await search({ workspace: '{workspace}', query: '关键词', searchType: 'keyword' });
await search({ workspace: '{workspace}', query: '电脑', searchType: 'ngram' });
await search({ workspace: '{workspace}', query: '密码', searchType: 'hybrid' });
await search({ workspace: '{workspace}', searchType: 'hotwords' });
```

### 3. LLM 摘要生成
当用户说"生成摘要"、"总结"、"提炼"时：

```javascript
const { summarize } = require('./actions/summarize');
await summarize({ 
  workspace: '{workspace}', 
  date: '2026-03-17',
  gatewayUrl: 'http://localhost:8080',
  token: 'your-token'
});
```

CLI 用法：
```bash
# 生成摘要
node actions/summarize.js --workspace /path/to/workspace
node actions/summarize.js --workspace /path/to/workspace --date 2026-03-17
```

**前提条件：** 需启用 Gateway 的 chatCompletions：
```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

### 4. 列出记忆
当用户说"查看记忆"、"列出记忆"时：

```javascript
const { list } = require('./actions/list');
await list({ workspace: '{workspace}', date: '2026-03-17' });
```

### 4. 知识管理
当用户说"标记重要"、"提取经验"、"积累知识"、"从失败中学习"时：

```javascript
const { knowledge } = require('./actions/knowledge');

// 标记重要事件（1-10星）
await knowledge({ action: 'mark_important', content: '重要内容', importance: 8 });

// 获取重要事件（新会话优先加载）
await knowledge({ action: 'get_important' });

// 提取经验
await knowledge({ action: 'extract_experience', content: '经验', category: 'success' });

// 获取经验
await knowledge({ action: 'get_experiences' });

// 积累知识
await knowledge({ action: 'add_knowledge', content: '知识内容' });

// 获取知识（新会话优先加载）
await knowledge({ action: 'get_knowledge' });

// 从失败中学习
await knowledge({ action: 'learn_from_failure', content: '失败教训' });

// 获取学习记录
await knowledge({ action: 'get_learning' });
```

CLI 用法：
```bash
# 搜索
node actions/search.js --query "关键词" --search-type keyword
node actions/search.js --query "电脑" --search-type ngram
node actions/search.js --search-type hotwords

# 列出记忆
node actions/list.js --date 2026-03-17

# 知识管理
node actions/knowledge.js --action mark_important --content "重要内容" --importance 8
node actions/knowledge.js --action get_important
node actions/knowledge.js --action extract_experience --content "经验" --type success
node actions/knowledge.js --action get_experiences
node actions/knowledge.js --action add_knowledge --content "知识内容"
node actions/knowledge.js --action get_knowledge
node actions/knowledge.js --action learn_from_failure --content "失败教训"
node actions/knowledge.js --action get_learning
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
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  role TEXT,
  content TEXT,
  timestamp TEXT,
  created_at TIMESTAMP
);
```

### meta 表
```sql
CREATE TABLE meta (
  session_id TEXT PRIMARY KEY,
  last_line_index INTEGER,
  updated_at TIMESTAMP
);
```

### hotwords 表
```sql
CREATE TABLE hotwords (
  id INTEGER PRIMARY KEY,
  word TEXT,
  count INTEGER,
  updated_at TIMESTAMP
);
```

### important_events 表（重要事件）
```sql
CREATE TABLE important_events (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  content TEXT,
  importance INTEGER DEFAULT 5,
  category TEXT,
  created_at TIMESTAMP,
  loaded_at TIMESTAMP
);
```

### experiences 表（经验）
```sql
CREATE TABLE experiences (
  id INTEGER PRIMARY KEY,
  event_id INTEGER,
  content TEXT,
  type TEXT,
  extracted_at TIMESTAMP
);
```

### knowledge 表（知识）
```sql
CREATE TABLE knowledge (
  id INTEGER PRIMARY KEY,
  content TEXT,
  source TEXT,
  loaded_count INTEGER DEFAULT 0,
  last_loaded_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### learning 表（学习记录）
```sql
CREATE TABLE learning (
  id INTEGER PRIMARY KEY,
  event_id INTEGER,
  lesson TEXT,
  action_taken TEXT,
  result TEXT,
  learned_at TIMESTAMP
);
```

### summaries 表（LLM 摘要）
```sql
CREATE TABLE summaries (
  id INTEGER PRIMARY KEY,
  content TEXT,
  key_info TEXT,
  created_at TIMESTAMP
);
```

## 意图识别

| 功能 | 触发关键词 |
|------|-----------|
| LLM 摘要 | 摘要、总结、提炼、生成摘要 |
| 搜索记忆 | 搜索、查找、找一下、记得 |
| N-gram搜索 | N-gram、语义搜索、相似 |
| 混合搜索 | 混合搜索、综合搜索 |
| 热词统计 | 热词、热门词、高频词 |
| 标记重要 | 重要、标记、标记重要、星 |
| 提取经验 | 经验、提取经验、成功经验 |
| 积累知识 | 知识、积累、记录知识 |
| 从失败中学习 | 失败、教训、错误 |
| 查看记忆 | 查看记忆、列出记忆 |
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

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

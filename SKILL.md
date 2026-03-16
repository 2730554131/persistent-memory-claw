---
name: persistent-memory
description: "OpenClaw 持久记忆系统，提供跨会话的长期记忆存储和搜索功能。Use when: user wants to remember something, search past conversations, or build a personal knowledge base. NOT for: temporary notes that don't need persistence."
metadata: { "openclaw": { "emoji": "🧠", "requires": { "bins": ["node"] } } }
---

# Persistent Memory

OpenClaw 持久记忆系统 - 极简版。

## When to Use

✅ **USE this skill when:**

- 用户说"记住 XXX"、"记录一下"、"保存这个"
- 用户说"搜索之前说过的事"、"找找上次"、"帮我搜一下"
- 用户说"列出我的记忆"、"查看记录"、"有哪些记忆"

❌ **NOT use this skill when:**

- 临时笔记（不需要持久化）
- 应存在其他系统的数据

## Actions

这个 skill 提供三个 action，可被意图路由自动调用：

### 1. persistent_memory_save

保存记忆。

```javascript
// 参数
{
  content: "要记住的内容",  // 必填
  category: "knowledgeBase"  // 可选，默认 knowledgeBase
}
```

### 2. persistent_memory_search

搜索记忆。

```javascript
// 参数
{
  query: "搜索关键词"  // 必填
}
```

### 3. persistent_memory_list

列出所有记忆。

```javascript
// 参数
{}  // 无需参数
```

## 存储结构

```
{workspace}/
└── memorys/
    └── knowledge-base.json
```

## 配置

```bash
# 可选：设置工作目录（默认当前目录）
export OPENCLAW_WORKSPACE=/path/to/workspace
```

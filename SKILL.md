---
name: persistent-memory
description: "OpenClaw 持久记忆系统，提供跨会话的长期记忆存储和搜索功能。Use when: user wants to remember something, search past conversations, or build a personal knowledge base. NOT for: temporary notes that don't need persistence."
metadata: { "openclaw": { "emoji": "🧠", "requires": { "bins": ["node"] } } }
---

# Persistent Memory

OpenClaw 持久记忆系统 - 极简版。

## When to Use

✅ **USE this skill when:**

- 用户说"记住 XXX"、"记录一下"
- 用户说"搜索之前说过的事"、"找找上次"
- 用户说"列出我的记忆"、"查看记录"

❌ **NOT use this skill when:**

- 临时笔记（不需要持久化）
- 应存在其他系统的数据

## Commands

### 保存记忆

```bash
node memory.cjs save knowledgeBase '{"content":"要记住的内容"}'
```

### 搜索记忆

```bash
node memory.cjs search 关键词
```

### 列出记忆

```bash
node memory.cjs list
```

## OpenClaw LLM 调用

```bash
node memory.cjs processIntent save "用户想要记住的内容"
node memory.cjs processIntent search "搜索关键词"
node memory.cjs processIntent list ""
```

## 存储结构

```
memorys/
└── knowledge-base.json
```

## 配置

```bash
export OPENCLAW_WORKSPACE=/path/to/workspace
```

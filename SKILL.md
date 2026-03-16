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

这个 skill 提供四个 action，可被意图路由自动调用：

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

### 4. persistent_memory_save_and_reset

**保存会话并新建会话** - 当上下文使用比例达到阈值时，保存当前会话到记忆并触发 /new 创建全新会话。

```javascript
// 参数
{
  threshold: 0.8    // 可选，触发阈值 (0-1)，默认 0.8 (80%)
}
```

**执行流程：**

1. 检查当前会话的上下文使用比例
2. 如果达到阈值（默认 80%）：
   - 提取当前会话的所有对话内容
   - 保存到记忆系统（分类：conversation，包含时间戳）
   - 触发 /new 命令，创建全新 sessionId
3. 返回保存结果和新会话信息

**返回结果：**

```javascript
{
  success: true,
  action: 'saved_and_reset',
  message: '会话已保存到记忆系统，并创建新会话',
  memoryId: 123,
  oldSessionId: 'session-xxx',
  newSessionId: 'session-yyy',
  usageRatio: 0.85,
  messageCount: 50
}
```

**使用场景：**

- 配置 heartbeat 定期检查上下文使用比例
- 在 OpenClaw 压缩前自动保存会话，防止丢失重要上下文
- 手动调用：`persistent_memory_save_and_reset`

## 存储结构

```
{workspace}/
└── memorys/
    └── memory.db         # SQLite 数据库
```

## 配置

```bash
# 可选：设置工作目录（默认当前目录）
export OPENCLAW_WORKSPACE=/path/to/workspace
```

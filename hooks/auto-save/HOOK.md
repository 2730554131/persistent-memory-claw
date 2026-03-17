---
name: persistent-memory-auto-save
description: "自动保存会话到 SQLite 数据库，在 OpenClaw 压缩会话之前触发"
metadata: 
  openclaw: 
    emoji: "💾"
    events: 
      - "session:compact:before"
    requires:
      bins:
        - "node"
---

# Persistent Memory Auto Save

在 OpenClaw 自动压缩会话之前，自动保存当前会话内容到 SQLite 数据库。

## 功能

- 监听 `session:compact:before` 事件
- 在会话压缩前保存当前会话内容
- 存储到 `{workspace}/memory/{sessionId}.db`

## 工作原理

1. 当 OpenClaw 检测到会话即将压缩时，触发 `session:compact:before` 事件
2. Hook 读取当前会话的 transcript 文件
3. 将会话内容保存到 SQLite 数据库
4. 压缩继续执行

## 启用方式

```bash
openclaw hooks enable persistent-memory-auto-save
```

## 禁用方式

```bash
openclaw hooks disable persistent-memory-auto-save
```

## 存储位置

- 数据库路径：`{workspace}/memory/{sessionId}.db`
- 表名：`memories`
- 分类：`conversation`

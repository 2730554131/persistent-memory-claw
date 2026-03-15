# Persistent Memory / 持久记忆系统

[English](#english) | [中文](#中文)

---

## English

### Overview

Persistent Memory is an OpenClaw skill that provides cross-session long-term memory storage, search, and context inheritance capabilities.

### Features

- **Auto-Save**: Automatically saves memory when context reaches 70% threshold
- **Multi-Agent Isolation**: Each agent has independent memory directory
- **Long-Term Storage**: JSON files with gzip compression
- **Search**: Keyword search, vector search, semantic search
- **Important Events**: 1-5 star importance levels
- **Self-Learning**: Experience extraction, knowledge accumulation
- **Confidence Tracking**: Usage frequency + time decay
- **Work Context**: Code location + thinking chain
- **98% Accuracy**: Snapshots + SHA256 verification
- **Auto Backup**: Daily backup with 90-day retention

### Trigger Keywords

When user mentions: "记忆", "记住", "继续上次", "搜索记忆", "知识库"

### Quick Start

```bash
# Save memory
node scripts/memory.cjs save knowledgeBase '{"key":"value"}'

# Load memory
node scripts/memory.cjs load knowledgeBase

# Search memory
node scripts/memory.cjs search keyword

# Vector search
node scripts/memory.cjs vector keyword

# Semantic search
node scripts/memory.cjs semantic keyword

# List all memory
node scripts/memory.cjs list
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| triggerThreshold | 0.7 | Auto-save threshold (70%) |
| maxAutoLoad | 5KB | Auto-load max tokens |
| backupRetentionDays | 90 | Backup retention days |
| confidenceHalfLifeDays | 30 | Confidence decay half-life |

### Project Structure

```
persistent-memory/
├── SKILL.md           # Skill definition
└── scripts/
    └── memory.cjs    # Core script
```

### Integration

Add to OpenClaw config:

```json
{
  "skills": {
    "load": {
      "extraDirs": ["/path/to/skills"]
    }
  }
}
```

---

## 中文

### 项目简介

持久记忆系统是一个 OpenClaw 技能，提供跨会话的长期记忆存储、搜索和上下文继承功能。

### 核心功能

| 功能 | 说明 |
|------|------|
| 自动记忆 | 上下文达到 70% 时自动保存 |
| 多 Agent 隔离 | 每个 agent 独立存储目录 |
| 长期存储 | JSON 文件 + gzip 压缩 |
| 搜索功能 | 关键词搜索、向量搜索、语义搜索 |
| 重要事件 | 1-5 星重要度等级 |
| 自我学习 | 经验提取、知识积累 |
| 置信度追踪 | 使用频率 + 时间衰减 |
| 工作上下文 | 代码位置 + 思维链 |
| 98% 准确率 | 快照 + SHA256 校验 |
| 自动备份 | 每日备份，保留 90 天 |

### 触发关键词

当用户提及："记忆"、"记住"、"继续上次"、"搜索记忆"、"知识库"

### 快速开始

```bash
# 保存记忆
node scripts/memory.cjs save knowledgeBase '{"喜欢":"蓝色"}'

# 加载记忆
node scripts/memory.cjs load knowledgeBase

# 关键词搜索
node scripts/memory.cjs search 蓝色

# 向量搜索
node scripts/memory.cjs vector 蓝色

# 语义搜索
node scripts/memory.cjs semantic 蓝色

# 列出所有记忆
node scripts/memory.cjs list
```

### 存储结构

```
{workspace}/memorys/
├── knowledge-base.json     # 知识库
├── important-events.json # 重要事件
├── work-context.json    # 工作上下文
├── config.json          # 配置文件
└── session-summaries/  # 历史摘要
```

### 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| triggerThreshold | 0.7 | 自动保存阈值 (70%) |
| maxAutoLoad | 5KB | 自动加载最大 tokens |
| backupRetentionDays | 90 | 备份保留天数 |
| confidenceHalfLifeDays | 30 | 置信度半衰期(天) |
| compressionEnabled | true | 启用压缩 |
| compressionLevel | 6 | 压缩级别 |

### 集成到 OpenClaw

1. 复制 skill 到工作目录：

```bash
cp -r persistent-memory /path/to/workspace/skills/
```

2. 配置 OpenClaw：

```json
{
  "skills": {
    "load": {
      "extraDirs": ["/path/to/workspace/skills"],
      "watch": true
    }
  }
}
```

3. 重启 OpenClaw：

```bash
openclaw gateway restart
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| save <key> <json> | 保存记忆 |
| load <key> | 加载记忆 |
| search <query> | 关键词搜索 |
| vector <query> | 向量搜索 |
| semantic <query> | 语义搜索 |
| important <json> [level] | 标记重要 |
| events | 列出重要事件 |
| work save/load | 工作上下文 |
| snapshot | 创建快照 |
| versions | 列出快照版本 |
| rollback <version> | 回滚快照 |
| backup | 创建备份 |
| list | 列出所有记忆 |

### 版本

当前版本：v0.3.0

### 许可证

MIT License

---

## Project Design Purpose

This skill is designed to solve the following problems:

1. **Memory Loss**: Conversations are lost after session ends
2. **Context Isolation**: Different agents' memories should not mix
3. **Search Difficulty**: Hard to find historical information
4. **Work Continuity**: Cannot continue previous work after /new or /reset

Persistent Memory provides a complete solution for AI assistants to have persistent memory capabilities.

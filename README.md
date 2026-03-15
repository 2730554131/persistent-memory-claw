# persistent-memory-claw

[English](./README_EN.md) | [中文](#中文)

---

## 🎯 项目设计初衷 / Project Design Purpose

This project was created to solve the "memory loss" problem in AI assistants. Traditional AI conversations lose all context after each session ends - this system provides persistent memory capabilities for OpenClaw agents.

本项目旨在解决 AI 助手的"失忆症"问题。传统 AI 对话在会话结束后丢失所有上下文，本系统为 OpenClaw agent 提供持久记忆能力。

**核心目标 / Core Goals:**

- 实现跨会话的记忆持久化 / Enable cross-session memory persistence
- 多 Agent 环境下的记忆隔离 / Memory isolation for multiple agents
- 智能搜索与知识提取 / Intelligent search and knowledge extraction
- 高效的存储与检索 / Efficient storage and retrieval

---

## ✨ 功能介绍 / Features

### 核心存储 / Core Storage

| 功能 / Feature | 说明 / Description |
|---------------|-------------------|
| 持久化存储 | JSON 文件 + gzip 压缩，节省空间 |
| 独立目录 | 每个 Agent 独立存储，互不干扰 |
| 分片存储 | 按日期/类型分片，优化大文件 |
| 增量模式 | 只存储增量变化，减少冗余 |

### 智能搜索 / Smart Search

| 功能 / Feature | 说明 / Description |
|---------------|-------------------|
| 关键词搜索 | 快速定位匹配内容 |
| 向量搜索 | 基于关键词权重的语义匹配 |
| 语义搜索 | N-gram + 余弦相似度 |
| 混合搜索 | 结合多种搜索方式 |
| 搜索热度 | 记录热门搜索关键词 |

### 知识管理 / Knowledge Management

| 功能 / Feature | 说明 / Description |
|---------------|-------------------|
| 经验提取 | 从对话中自动提取知识 |
| 置信度追踪 | 使用频率 + 时间衰减 |
| 重要度标记 | 1-5 星等级 |
| 主动确认 | 待确认知识队列 |

### 工作继承 / Work Inheritance

| 功能 / Feature | 说明 / Description |
|---------------|-------------------|
| 代码继承 | 文件路径、行号、函数名 |
| 任务继承 | 任务进度、TODO |
| 变量继承 | 状态变量保持 |
| 思维链 | 分层记忆上下文 |

### 快照与备份 / Snapshot & Backup

| 功能 / Feature | 说明 / Description |
|---------------|-------------------|
| 多版本快照 | 保留历史版本 |
| 增量快照 | 高效存储变化 |
| SHA256 校验 | 98% 准确率 |
| 自动备份 | 每日自动备份 |
| 90天保留 | 长期历史回溯 |

---

## 🚀 快速开始 / Quick Start

### 安装 / Installation

```bash
# 克隆仓库
git clone https://github.com/2730554131/persistent-memory-claw.git

# 进入目录
cd persistent-memory-claw
```

### 基本使用 / Basic Usage

```javascript
const PersistentMemory = require('./scripts/memory.cjs');

// 初始化
const mem = new PersistentMemory({
  workspace: '/path/to/workspace'
});

// 保存记忆
await mem.save('knowledge', { name: '测试', value: '数据' });

// 加载记忆
const data = mem.load('knowledge');

// 搜索
const results = mem.search('测试');
```

### CLI 使用 / CLI Usage

```bash
# 设置工作目录
export OPENCLAW_WORKSPACE=/path/to/workspace

# 保存
node scripts/memory.cjs save knowledge '{"key":"value"}'

# 加载
node scripts/memory.cjs load knowledge

# 搜索
node scripts/memory.cjs search 关键词

# 创建快照
node scripts/memory.cjs snapshot

# 备份
node scripts/memory.cjs backup
```

---

## 📖 配置 OpenClaw / Configure with OpenClaw

### 步骤 1: 配置 skills

编辑 OpenClaw 配置文件 `openclaw.json`:

```json
{
  "skills": {
    "load": {
      "extraDirs": [
        "/path/to/persistent-memory-claw"
      ],
      "watch": true
    },
    "entries": {
      "persistent-memory": {
        "enabled": true,
        "path": "persistent-memory-claw"
      }
    }
  }
}
```

### 步骤 2: 重启网关

```bash
openclaw gateway restart
```

### 步骤 3: 验证

```bash
# 检查健康状态
node scripts/memory.cjs health
```

---

## ⚙️ 参数说明 / Configuration

### 存储配置 / Storage

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `workspace` | string | process.cwd() | 工作目录 |
| `storagePath` | string | {workspace}/memorys | 记忆存储路径 |
| `backupPath` | string | {workspace}/memory-backup | 备份路径 |
| `enableSharding` | boolean | true | 启用分片存储 |
| `compressionEnabled` | boolean | true | 启用压缩 |

### 触发配置 / Trigger

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxAutoLoad` | number | 5120 | 自动加载上限(字节) |
| `storageMode` | string | 'incremental' | 存储模式 |

### 快照配置 / Snapshot

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enableIncrementalSnapshot` | boolean | true | 增量快照 |
| `maxSnapshotVersions` | number | 5 | 版本数量 |
| `snapshotInterval` | number | 5 | 快照间隔 |

### 内存管理 / Memory

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxCacheSize` | number | 10 | 缓存大小 |
| `importantEventsRetentionDays` | number | 365 | 重要事件保留 |
| `maxSearchHistory` | number | 100 | 搜索历史 |

### 性能优化 / Performance

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enableAsyncIO` | boolean | true | 异步 I/O |
| `enableIndexPersistence` | boolean | true | 索引持久化 |

---

## 📁 项目结构 / Project Structure

```
persistent-memory-claw/
├── .gitignore              # Git 忽略配置
├── README.md               # 中文文档
├── README_EN.md           # English docs
├── SKILL.md               # OpenClaw Skill 定义
├── scripts/
│   └── memory.cjs         # 核心库 (v0.3.7)
└── docs/                  # 文档目录 (可选)
```

---

## 📋 API 参考 / API Reference

### 基础操作

```javascript
// 保存
await mem.save(key, data)

// 加载
mem.load(key)

// 批量
await mem.saveBatch([{key, data}, ...])
mem.loadBatch([key1, key2])
```

### 搜索

```javascript
mem.search(query)           // 关键词
mem.vectorSearch(query)    // 向量
mem.semanticSearch(query) // 语义
mem.getSearchHotness()    // 热度
```

### 知识管理

```javascript
mem.markImportant(event, 5)     // 标记重要
mem.autoLearn(messages)         // 自动学习
mem.extractExperience(msgs)    // 经验提取
mem.updateConfidence(key, 1)   // 更新置信度
```

### 快照备份

```javascript
mem.createSnapshot(state)       // 创建快照
mem.rollbackToVersion(v)       // 回滚
mem.createBackup()              // 备份
mem.restoreBackup(name)        // 恢复
```

### 系统

```javascript
mem.healthCheck()         // 健康检查
mem.getSystemSummary()   // 系统摘要
mem.getStats()          // 统计信息
```

---

## 🔧 钩子系统 / Hooks

```javascript
const mem = new PersistentMemory({
  workspace: '/path/to/workspace',
  hooks: {
    afterSave: [(data) => console.log('Saved:', data.key)],
    onError: [(err) => console.error('Error:', err)]
  }
});

// 运行时注册
mem.registerHook('afterSave', (data) => {
  console.log('Key saved:', data.key);
});
```

---

## 📝 更新日志 / Changelog

### v0.3.7
- 意图识别系统
- 支持多种语义表达方式
- 自动处理用户意图

### v0.3.6
- 配置验证
- 钩子/事件系统
- 搜索热度统计
- 批量操作 API
- 向量缓存
- 动态备份文件列表

### v0.3.5
- 索引持久化
- 健康检查接口
- 系统摘要接口

### v0.3.4
- 异步 I/O
- 异步压缩解压

### v0.3.3
- 文件锁机制
- 内存索引优化

### v0.3.2
- 日志分级
- 错误模式库清理
- 学习历史清理

### v0.3.1
- 正则预编译
- 校验和修复
- LRU 优化
- 重要事件365天保留

---

## 📄 许可证 / License

MIT License

---

## 🤝 贡献 / Contributing

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式 / Contact

如有问题，请提交 Issue。

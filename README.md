# persistent-memory-claw

[English](./README_EN.md) | [中文](#中文)

---

## 🎯 项目设计初衷

本项目旨在解决 AI 助手的"失忆症"问题。传统 AI 对话在会话结束后丢失所有上下文，本系统为 OpenClaw agent 提供持久记忆能力。

**核心目标：**

- 跨会话的记忆持久化
- 多 Agent 环境下的记忆隔离
- 高效的存储与检索

---

## ✨ 功能介绍

### 核心功能

| 功能 | 说明 |
|------|------|
| 保存记忆 | 保存用户想要记住的内容 |
| 搜索记忆 | 关键词搜索 |
| 列出记忆 | 查看所有记忆 |

### 技术特性

- **SQLite 存储** - 高效、可靠的本地数据库
- **Skill Actions** - 可被 OpenClaw 意图路由自动调用
- **多分类支持** - 支持不同的记忆分类

---

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/2730554131/persistent-memory-claw.git
cd persistent-memory-claw

# 安装依赖
npm install
```

### 移动到 skills 目录

```bash
# 移动到你的 OpenClaw workspace skills 目录
mv persistent-memory-claw /path/to/your-workspace/skills/

# 重启 gateway
openclaw gateway restart
```

### CLI 使用

```bash
# 设置工作目录（可选，默认当前目录）
export OPENCLAW_WORKSPACE=/path/to/workspace

# 保存记忆
node scripts/memory.cjs save knowledgeBase "要记住的内容"

# 搜索记忆
node scripts/memory.cjs search 关键词

# 列出记忆
node scripts/memory.cjs list
```

### OpenClaw Skill Actions 调用

在 OpenClaw 中，这个 skill 提供三个 action：

| Action | 说明 | 触发关键词 |
|--------|------|------------|
| `persistent_memory_save` | 保存记忆 | 记住、记录、保存 |
| `persistent_memory_search` | 搜索记忆 | 搜索、找找 |
| `persistent_memory_list` | 列出记忆 | 列出、查看记忆 |

---

## 📁 项目结构

```
persistent-memory-claw/
├── README.md               # 中文文档
├── README_EN.md           # English docs
├── SKILL.md               # OpenClaw Skill 定义
├── package.json           # 依赖配置
├── actions/               # Skill Actions
│   ├── save.js           # 保存记忆
│   ├── search.js         # 搜索记忆
│   └── list.js           # 列出记忆
└── scripts/
    └── memory.cjs        # 核心库 (v0.5.0)
```

---

## 💾 存储结构

```
{workspace}/
└── memorys/
    └── memory.db         # SQLite 数据库
```

---

## 📖 配置 OpenClaw（可选）

如果移动到 workspace skills 目录，无需额外配置。

如需自定义路径，编辑 `openclaw.json`:

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
        "enabled": true
      }
    }
  }
}
```

---

## 📝 更新日志

### v0.5.0
- 升级为 SQLite 存储（支持多条记忆）
- 新增 Skill Actions 支持
- 支持意图路由自动调用

### v0.4.2
- 极简版本
- 只保留核心功能：保存、搜索、列表

### v0.3.7
- 意图识别系统
- 支持多种语义表达方式

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式

如有问题，请提交 Issue。

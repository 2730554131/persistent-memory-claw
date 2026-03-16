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

### 核心功能（极简版）

| 功能 | 说明 |
|------|------|
| 保存记忆 | 保存用户想要记住的内容 |
| 搜索记忆 | 关键词搜索 |
| 列出记忆 | 查看所有记忆 |

---

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/2730554131/persistent-memory-claw.git
cd persistent-memory-claw
```

### CLI 使用

```bash
# 设置工作目录
export OPENCLAW_WORKSPACE=/path/to/workspace

# 保存记忆
node scripts/memory.cjs save knowledgeBase '{"content":"要记住的内容"}'

# 搜索记忆
node scripts/memory.cjs search 关键词

# 列出记忆
node scripts/memory.cjs list
```

### OpenClaw LLM 调用

```bash
node scripts/memory.cjs processIntent save "用户想要记住的内容"
node scripts/memory.cjs processIntent search "搜索关键词"
node scripts/memory.cjs processIntent list ""
```

---

## 📖 配置 OpenClaw

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

---

## 📁 项目结构

```
persistent-memory-claw/
├── README.md               # 中文文档
├── README_EN.md           # English docs
├── SKILL.md               # OpenClaw Skill 定义
└── scripts/
    └── memory.cjs         # 核心库 (v0.4.2)
```

---

## 📝 更新日志

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

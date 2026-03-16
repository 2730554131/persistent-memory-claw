# persistent-memory-claw

跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。

---

## 项目设计初衷

本项目旨在解决 AI 助手的"失忆症"问题。传统 AI 对话在会话结束后丢失所有上下文，本系统为 OpenClaw agent 提供持久记忆能力。

**核心目标：**

- 跨会话的记忆持久化
- 多 Agent 环境下的记忆隔离
- 高效的存储与检索

---

## 功能

| 功能 | 说明 |
|------|------|
| 保存记忆 | 保存用户想要记住的内容 |
| 搜索记忆 | 关键词搜索 |
| 列出记忆 | 查看所有记忆 |
| 自动保存会话 | 当上下文达到 80% 时自动保存会话并重置 |

---

## 特性

- **SQLite 存储** - 高效、可靠的本地数据库
- **Skill Actions** - 可被 OpenClaw 意图路由自动调用
- **多分类支持** - 支持不同的记忆分类
- **自动安装依赖** - 首次使用自动安装所需依赖

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/2730554131/persistent-memory-claw.git

# 进入目录
cd persistent-memory-claw

# ✅ 无需手动安装依赖！首次使用时会自动安装

# 移动到你的 OpenClaw workspace skills 目录
mv persistent-memory-claw /path/to/your-workspace/skills/

# 重启 gateway
openclaw gateway restart
```

---

## 使用方法

### CLI 模式

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

### OpenClaw Skill Actions

在 OpenClaw 中，这个 skill 提供四个 action：

| Action | 说明 | 触发关键词 |
|--------|------|-----------|
| persistent_memory_save | 保存记忆 | 记住、记录、保存 |
| persistent_memory_search | 搜索记忆 | 搜索、找找 |
| persistent_memory_list | 列出记忆 | 列出、查看记忆 |
| persistent_memory_auto_save | 自动保存会话 | （需配合 heartbeat 使用） |

---

## 自动保存会话

当上下文使用比例达到阈值（默认 80%）时，自动保存完整会话记录并重置：

**参数：**

```javascript
{
  threshold: 0.8,  // 触发阈值 (0-1)，默认 0.8
  autoReset: true   // 是否自动创建新会话，默认 true
}
```

**工作流程：**

1. 检查当前会话的上下文使用比例
2. 如果达到阈值（默认 80%）：
   - 提取当前会话的所有对话内容
   - 自动保存到记忆系统（分类：conversation，包含时间戳）
   - 归档当前会话文件
   - 创建新会话
3. 返回保存结果和新会话信息

**使用方式：**

```bash
# CLI 模式
node scripts/memory.cjs auto-save 0.8 --save-reset

# 参数说明：
# 0.8 - 阈值 (80%)
# --save-reset - 自动保存并创建新会话
```

**配置 heartbeat 定期检查：**

在 workspace 的 HEARTBEAT.md 中添加定时任务，定期调用 persistent_memory_auto_save action。

---

## 项目结构

```
persistent-memory-claw/
├── README.md               # 文档
├── SKILL.md                # OpenClaw Skill 定义
├── package.json            # 依赖配置
├── actions/                # Skill Actions
│   ├── save.js            # 保存记忆
│   ├── search.js          # 搜索记忆
│   └── list.js            # 列出记忆
└── scripts/
    └── memory.cjs         # 核心库
```

---

## 存储结构

```
{workspace}/
└── memory/
    └── {sessionId}.db     # SQLite 数据库
```

每个会话对应一个独立的 SQLite 数据库文件，通过 workspace + sessionId 实现多 Agent 记忆隔离。

---

## 许可证

MIT License

欢迎提交 Issue 和 Pull Request！

如有问题，请提交 Issue。

# persistent-memory-claw

跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。

---

## 项目设计初衷

本项目旨在解决 AI 助手的"失忆症"问题。传统 AI 对话在会话结束后丢失所有上下文，本系统为 OpenClaw agent 提供持久记忆能力。

---

## 功能

| 功能 | 说明 |
|------|------|
| 手动保存记忆 | 用户主动保存，v2.1 支持智能标记重要性 |
| RAG 问答 | v2.2 基于记忆的智能问答 |
| 手动生成摘要 | 用户手动生成对话摘要 |
| 搜索记忆 | 关键词搜索历史对话 |
| 列出记忆 | 按日期查看历史对话 |

---

## 特性

- **手动触发** - 完全由用户控制，按需保存
- **SQLite 存储** - 高效、可靠的本地数据库
- **按日期存储** - 每天的记忆单独存储
- **简单可靠** - 无需复杂配置，开箱即用

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/2730554131/persistent-memory-claw.git

# 进入目录
cd persistent-memory-claw

# 移动到你的 OpenClaw workspace skills 目录
mv persistent-memory-claw /path/to/your-workspace/skills/

# 重启 gateway
openclaw gateway restart
```

---

## 使用方法

### 保存记忆

```bash
# 保存记忆（自动智能标记）
node actions/save.js --workspace /path/to/workspace --content "要记住的内容"

# 指定分类（跳过智能标记）
node actions/save.js --workspace /path/to/workspace --content "重要内容" --category "task"

# 禁用智能标记
node actions/save.js --workspace /path/to/workspace --content "内容" --no-auto-tag

# 指定日期
node actions/save.js --workspace /path/to/workspace --content "内容" --date 2026-03-17
```

**v2.1 智能标记**：
- 自动分析内容重要性（1-10星）
- 自动分类：task(任务) / promise(承诺) / decision(决定) / normal(普通)

### RAG 问答

```bash
# 智能问答
node actions/ask.js --workspace /path/to/workspace --question "之前我们聊了什么？"

# 指定日期范围
node actions/ask.js --workspace /path/to/workspace --question "之前说的密码是什么" --date 2026-03-17
```

**v2.2 RAG 问答**：
- 基于记忆的智能问答
- 自动检索相关记忆
- LLM 生成自然语言答案

### 生成摘要

```bash
# 生成今天和昨天的摘要
node actions/summarize.js --workspace /path/to/workspace

# 生成指定日期的摘要
node actions/summarize.js --workspace /path/to/workspace --date 2026-03-17
```

### 搜索记忆

```bash
# 搜索所有记忆
node actions/search.js --workspace /path/to/workspace --query "关键词"

# 搜索指定日期
node actions/search.js --workspace /path/to/workspace --query "关键词" --date 2026-03-17
```

### 列出记忆

```bash
# 列出今天的所有记忆
node actions/list.js --workspace /path/to/workspace

# 列出指定日期的记忆
node actions/list.js --workspace /path/to/workspace --date 2026-03-17
```

---

## 项目结构

```
persistent-memory-claw/
├── README.md               # 文档
├── SKILL.md                # OpenClaw Skill 定义
├── package.json            # 依赖配置
└── actions/
    ├── save.js           # 手动保存（v2.1 智能标记）
    ├── ask.js            # RAG 问答（v2.2）
    ├── list.js           # 列出记忆
    ├── search.js         # 搜索记忆
    └── summarize.js      # 手动生成摘要
```

---

## 存储结构

```
{workspace}/memory/
├── 2026-03-17.db     # 3月17日的记忆
├── 2026-03-16.db     # 3月16日的记忆
├── 2026-03-17-summary.md  # 摘要文件
└── ...
```

### 数据库表结构

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  content TEXT,
  category TEXT DEFAULT 'normal',  -- task/promise/decision/normal
  importance INTEGER DEFAULT 5,    -- 1-10 重要程度
  created_at TIMESTAMP
);
```

---

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

---

## 许可证

MIT License

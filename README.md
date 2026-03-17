# persistent-memory-claw

跨会话持久记忆系统：为 OpenClaw agent 提供持久记忆能力。

---

## 项目设计初衷

本项目旨在解决 AI 助手的"失忆症"问题。传统 AI 对话在会话结束后丢失所有上下文，本系统为 OpenClaw agent 提供持久记忆能力。

---

## 功能

| 功能 | 说明 |
|------|------|
| 手动保存记忆 | 用户主动保存重要内容 |
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

# 无需手动安装依赖！首次使用时会自动安装

# 移动到你的 OpenClaw workspace skills 目录
mv persistent-memory-claw /path/to/your-workspace/skills/

# 重启 gateway
openclaw gateway restart
```

---

## 使用方法

### 保存记忆

```bash
# 保存记忆
node actions/save.js --workspace /path/to/workspace --content "要记住的内容"

# 指定分类
node actions/save.js --workspace /path/to/workspace --content "重要内容" --category "work"

# 指定日期
node actions/save.js --workspace /path/to/workspace --content "内容" --date 2026-03-17
```

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
├── actions/
│   ├── save.js           # 手动保存记忆
│   ├── list.js           # 列出记忆
│   ├── search.js         # 搜索记忆
│   └── summarize.js      # 手动生成摘要
└── hooks/
    └── auto-save/
        ├── HOOK.md       # Hook 定义
        └── handler.ts    # 占位（已简化）
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
  category TEXT DEFAULT 'default',
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

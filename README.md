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
| 自动保存会话 | OpenClaw 自动压缩前保存对话到 SQLite |
| 自动摘要生成 | 每次保存时自动生成 LLM 摘要 |
| 搜索记忆 | 关键词搜索历史对话 |
| 列出记忆 | 按日期查看历史对话 |

---

## 特性

- **SQLite 存储** - 高效、可靠的本地数据库
- **Hook 机制** - 监听 OpenClaw 压缩事件自动保存
- **按日期存储** - 每天的对话单独存储
- **增量保存** - 多次压缩只保存新增消息，不重复
- **LLM 摘要** - 使用 OpenClaw LLM 生成智能摘要

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

## 启用自动保存 Hook

**首次使用需要运行以下命令启用自动保存功能：**

```bash
openclaw hooks enable persistent-memory-auto-save
```

**说明**：
- 启用后，当 OpenClaw 会话即将进行压缩时，会自动保存会话内容到 SQLite 数据库
- 这是**一次性操作**，启用后会一直生效

### 检查 Hook 状态

```bash
# 查看 Hook 列表
openclaw hooks list
```

### 禁用自动保存

```bash
# 禁用自动保存 Hook
openclaw hooks disable persistent-memory-auto-save
```

---

## 使用方法

### 搜索记忆

```bash
# 搜索所有记忆
node actions/search.js --workspace /path/to/workspace --query "关键词"

# 搜索指定日期的记忆
node actions/search.js --workspace /path/to/workspace --query "关键词" --date 2026-03-17
```

### 查看记忆

```bash
# 列出今天的所有对话
node actions/list.js --workspace /path/to/workspace

# 查看指定日期的记忆
node actions/list.js --workspace /path/to/workspace --date 2026-03-17

# 查看历史摘要
node actions/list.js --workspace /path/to/workspace --date 2026-03-17 --type summaries
```

**注意**：摘要会在每次自动保存时自动生成，无需手动触发。

### LLM 摘要生成

```bash
# 生成今天和昨天的对话摘要
node actions/summarize.js --workspace /path/to/workspace

# 生成指定日期的摘要
node actions/summarize.js --workspace /path/to/workspace --date 2026-03-17
```

**前提条件：**
- 需启用 Gateway 的 chatCompletions：
```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

---

## 自动保存机制

**工作流程：**

```
用户会话进行中...
    ↓
OpenClaw 检测到上下文即将压缩
    ↓
触发 session:compact:before 事件
    ↓
Hook 执行：
  1. 读取 transcript 全部内容
  2. 从上次保存的位置继续读取
  3. 增量保存新消息到 SQLite
  4. 更新 meta 表记录位置
    ↓
OpenClaw 执行压缩
    ↓
用户继续新会话（对话已保存）
```

---

## 项目结构

```
persistent-memory-claw/
├── README.md               # 文档
├── SKILL.md                # OpenClaw Skill 定义
├── package.json            # 依赖配置
├── actions/
│   ├── list.js           # 列出记忆
│   ├── search.js         # 搜索记忆
│   └── summarize.js      # LLM 摘要生成
└── hooks/
    └── auto-save/
        ├── HOOK.md       # Hook 定义
        └── handler.ts     # 自动保存逻辑
```

---

## 存储结构

```
{workspace}/memory/
├── 2026-03-17.db     # 3月17日的对话
├── 2026-03-16.db     # 3月16日的对话
└── 2026-03-15.db     # 3月15日的对话
```

### 数据库表结构

**memories 表：**
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  session_id TEXT,        -- 会话ID
  role TEXT,              -- user / assistant
  content TEXT,           -- 消息内容
  timestamp TEXT,         -- 消息时间
  created_at TIMESTAMP
);
```

**meta 表：**
```sql
CREATE TABLE meta (
  session_id TEXT PRIMARY KEY,
  last_line_index INTEGER,  -- 上次保存到的行号
  updated_at TIMESTAMP
);
```

---

## 依赖

- Node.js
- sqlite3（首次使用自动安装）

---

## 许可证

MIT License

欢迎提交 Issue 和 Pull Request！

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
| 自动保存会话 | OpenClaw 自动压缩前保存所有对话到 SQLite |
| 关键词搜索 | 精确匹配关键词 |
| 语义(N-gram)搜索 | 基于 N-gram 的语义相似度搜索 |
| 混合搜索 | 关键词 + N-gram 组合搜索 |
| 热词统计 | 统计高频词汇，按日期存储 |
| 列出记忆 | 按日期查看历史对话 |

---

## 特性

- **SQLite 存储** - 高效、可靠的本地数据库
- **Hook 机制** - 监听 OpenClaw 压缩事件自动保存
- **按日期存储** - 每天的对话单独存储
- **增量保存** - 多次压缩只保存新增消息，不重复

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

## 启用自动保存

```bash
# 启用 Hook
openclaw hooks enable persistent-memory-auto-save
```

---

## 使用方法

### 关键词搜索

```bash
# 搜索所有记忆
node actions/search.js --workspace /path/to/workspace --query "关键词"

# 搜索指定日期
node actions/search.js --workspace /path/to/workspace --query "关键词" --date 2026-03-17
```

### N-gram 语义搜索

```bash
# 语义搜索
node actions/search.js --workspace /path/to/workspace --query "电脑" --search-type ngram
```

### 混合搜索

```bash
# 混合搜索（关键词 + N-gram）
node actions/search.js --workspace /path/to/workspace --query "密码" --search-type hybrid
```

### 热词统计

```bash
# 统计热词
node actions/search.js --workspace /path/to/workspace --search-type hotwords

# 统计指定日期热词
node actions/search.js --workspace /path/to/workspace --search-type hotwords --date 2026-03-17
```

### 查看记忆

```bash
# 列出今天的所有对话
node actions/list.js --workspace /path/to/workspace

# 查看指定日期的记忆
node actions/list.js --workspace /path/to/workspace --date 2026-03-17
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

**增量保存说明：**

- 同一个会话多次压缩时，只保存新增的对话
- meta 表记录每个 session 保存到的行号
- 避免重复存储

---

## 项目结构

```
persistent-memory-claw/
├── README.md               # 文档
├── SKILL.md                # OpenClaw Skill 定义
├── package.json            # 依赖配置
├── actions/
│   ├── list.js           # 列出记忆
│   └── search.js         # 搜索记忆
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
  timestamp TEXT,          -- 消息时间
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

---
name: persistent-memory
description: OpenClaw 持久记忆系统，提供跨会话的长期记忆存储、搜索和上下文继承功能。适用于：(1) 需要记住用户偏好和重要信息 (2) 需要在会话间继承工作进度 (3) 需要搜索历史记忆 (4) 需要构建个人知识库。触发条件：用户提及"记忆"、"记住"、"继续上次"、"搜索记忆"、"知识库"等关键词时。
---

# Persistent Memory v0.3.6 - 持久记忆系统（优化版）

本 skill 为 OpenClaw 提供跨会话的长期记忆能力，支持记忆存储、搜索、上下文继承等功能。

## 四大核心功能使用指南

### 1. 记住/记录 - 保存内容到记忆系统

当用户说"记住 XXX"、"记录 XXX"、"帮我记住 XXX"时：

```javascript
// 保存到知识库
mem.save('knowledgeBase', { key: 'value' });

// 或使用 CLI
// node memory.cjs save knowledgeBase '{"key":"value"}'

// 保存重要事件
mem.markImportant({ event: '重要事件内容' }, 5);
```

**触发关键词：** 记住、记录、保存、帮我记住

### 2. 搜索/查找 - 在记忆库中搜索

当用户说"搜索 XXX"、"查找 XXX"、"我之前说过什么"时：

```javascript
// 关键词搜索
mem.search('关键词');

// 向量搜索（权重）
mem.vectorSearch('关键词');

// 语义搜索（N-gram 余弦相似度）
mem.semanticSearch('语义查询');

// CLI
// node memory.cjs search 蓝色
// node memory.cjs vector 蓝色
// node memory.cjs semantic 蓝色
```

**触发关键词：** 搜索、查找、查找、记得吗

### 3. 继续项目 - 恢复工作上下文

当用户说"继续上次的项目"、"继续写那个文件"时：

```javascript
// 加载工作上下文
const context = mem.loadWorkContext();

// CLI
// node memory.cjs work load
```

返回内容包括：
- filePath：当前文件路径
- lineNumber：当前行号
- functionName：当前函数名
- task：当前任务
- 项目：项目名称
- 进度：完成进度

**触发关键词：** 继续、继续写、上次

### 4. 列出项目 - 列出已记录的项目

当用户说"列出所有记忆"、"查看我的记录"时：

```javascript
// 列出所有
mem.list();

// CLI
// node memory.cjs list
```

返回：
- knowledge：知识库
- important-events：重要事件
- work-context：工作上下文

**触发关键词：** 列出、查看、有什么

## 核心架构

### 存储结构

每个 agent 的记忆存储在独立目录中，路径为 `{workspace}/memorys/{agentName}/`：

```
{workspace}/memorys/{agentName}/
├── index.json              # 索引（P0 ~1KB，自动加载）
├── important-events.json   # 重要事件（P1 ~2KB，自动加载）
├── knowledge-base.json    # 知识库（P2 ~2KB，自动加载）
├── error-patterns.json    # 错误模式库
├── work-context.json     # 工作上下文（按需加载）
├── config.json            # 配置文件
├── snapshot.json         # 快照（98%准确率）
├── session-summaries/    # 历史摘要（按需）
│   └── *.json
└── shards/               # 分片存储（可选）
    └── ...
```

### 分层加载策略

| 层级 | 内容 | 大小 | 加载时机 |
|------|------|------|----------|
| P0 | 索引 | ~1KB | 始终自动加载 |
| P1 | 重要事件 | ~2KB | 始终自动加载 |
| P2 | 知识库 | ~2KB | 始终自动加载 |
| P3 | 工作上下文 | ~5KB | 用户说"继续上次"时 |
| P4 | 历史摘要 | 按需 | 用户说"查看上次"时 |

**自动加载上限：5KB**（P0-P2 必须加载）

## 功能模块

### 1. 自动记忆功能（用户触发）

**配置参数**：
- `triggerThreshold`: 0.75（可配置）
- `storagePath`: {workspace}/memorys/

### 2. 多 Agent 记忆隔离

每个 agent 有独立的 `memorys/{agentName}/` 目录，确保记忆不混淆。

### 3. 长期记忆存储

- 使用 JSON 文件持久化存储
- 支持 gzip 压缩（可配置开关）
- 存储在会话外部，不随 /new 或 /reset 丢失

### 4. 搜索功能

支持多种搜索模式：
- **关键词搜索**：直接匹配文本
- **模糊匹配**：支持部分匹配
- **向量搜索**：语义相似度搜索（基于权重）
- **混合搜索**：关键词 + 向量组合

### 5. 记住重要事件

- 可通过指令标记重要事件
- 重要事件在 P1 层，每次启动优先加载

### 6. 自我进化和学习

- 从对话中提取可复用知识
- 记录错误到 `error-patterns.json`
- 错误计数和重复检测
- 根据使用频率调整知识权重（置信度追踪）
- 从对话中自动提取并保存知识（自动学习）
- 分析对话主题和情感（趋势分析）

### 7. 会话重置保留

- /new 和 /reset 命令不删除 memorys/ 目录
- 工作进度自动继承

### 8. 工作上下文继承（重点功能）

#### 触发流程
1. 用户说"继续帮我写某某项目"
2. 展示项目信息（当前进度、代码位置、任务列表）
3. 询问用户"是否确定继续？"
4. 用户确认后，才开始继续编写
5. 用户拒绝后，返回等待其他指令

#### 98%准确率机制
- **定期快照**：每 N 步（`snapshotInterval`，默认5）创建完整快照
- **校验机制**：SHA256 验证完整性
- **状态追踪**：每个关键节点记录
- **完整性检查**：启动时验证上下文

#### 思维链结构（分层）
```json
{
  "projectChain": {
    "milestones": [
      {"id": "m1", "title": "项目里程碑", "reason": "原因", "impact": "影响"}
    ],
    "phases": [
      {"id": "p1", "title": "阶段目标", "goal": "目标", "milestone": "m1"}
    ],
    "currentTask": {
      "phase": "p1",
      "task": "当前任务",
      "previous": "上一步",
      "next": "下一步",
      "filePath": "文件路径",
      "lineNumber": 行号,
      "functionName": "函数名",
      "className": "类名"
    },
    "projectSummary": "项目摘要",
    "keyDecisions": [
      {"decision": "决策", "reason": "原因"}
    ]
  }
}
```

### 9. 存储优化

- **分片存储**：按日期/项目/类型分文件
- **存储模式**：`storageMode` 可配置为 `full`（全量）或 `incremental`（增量）
- **压缩开关**：可配置开启/关闭 gzip
- **二级索引**：内存索引 → 文件位置 → 具体内容
- **懒加载**：只加载需要的片段
- **LRU 缓存**：最近使用的记忆

### 10. Token 优化

- 智能摘要：只保留关键信息
- 压缩率控制：可配置（1-9）
- 只读索引：避免重复加载

## 可配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| triggerThreshold | - | 已移除，自动保存改为用户触发 |
| storagePath | {workspace}/memorys/ | 记忆存储路径 |
| agentName | default | Agent 名称（用于隔离） |
| maxAutoLoad | 5KB | 自动加载的最大 token 数 |
| enableVectorSearch | true | 是否启用向量搜索 |
| compressionEnabled | true | 是否启用压缩 |
| compressionLevel | 6 | gzip 压缩级别 (1-9) |
| snapshotInterval | 5 | 每N步创建快照 |
| storageStrategy | by-type | 存储策略：by-date/by-project/by-type |
| storageMode | incremental | 存储模式：full/incremental |
| enableSharding | false | 是否启用分片存储 |
| shardBy | date | 分片方式：date/project/type |

## 使用示例

### 保存记忆
```bash
node memory.cjs save knowledgeBase '{"color":"蓝色","food":"火锅"}'
```

### 加载记忆
```bash
node memory.cjs load knowledgeBase
```

### 搜索记忆
```bash
# 关键词搜索
node memory.cjs search 蓝色

# 向量搜索
node memory.cjs vector 颜色偏好
```

### 标记重要
```bash
node memory.cjs important '{"event":"用户生日","date":"2024-01-01"}'
```

### 记录错误
```bash
node memory.cjs error '{"message":"连接超时","context":"API调用"}'
```

### 工作上下文
```bash
# 保存工作上下文
node memory.cjs work save '{"filePath":"/root/project/main.js","lineNumber":42,"functionName":"handleRequest"}'

# 加载工作上下文
node memory.cjs work load
```

### 快照管理
```bash
# 创建快照
node memory.cjs snapshot '{"step":5,"state":"已完成初始化"}'

# 验证快照
node memory.cjs validate
```

### 配置管理
```bash
# 查看配置
node memory.cjs config

# 更新配置
node memory.cjs config compressionEnabled false
node memory.cjs config snapshotInterval 10
```

### 统计和导出
```bash
# 获取存储统计
node memory.cjs stats

# 导出所有记忆
node memory.cjs export
```

### 置信度追踪
```bash
# 更新置信度
node memory.cjs confidence update 喜欢 5

# 获取置信度
node memory.cjs confidence get 喜欢

# 按权重列出知识
node memory.cjs confidence list

# 清理低置信度知识
node memory.cjs confidence prune 0.2
```

### 经验提取
```bash
# 提取经验
node memory.cjs learn extract '[{"content":"我喜欢蓝色","timestamp":1234567890}]'

# 自动学习
node memory.cjs learn auto '[{"content":"我喜欢蓝色","timestamp":1234567890}]'

# 趋势分析
node memory.cjs learn trends '[{"content":"我喜欢蓝色","timestamp":1234567890}]'
```

## 编程接口

### Node.js 中使用

```javascript
const PersistentMemory = require('./memory.cjs');

// 初始化
const mem = new PersistentMemory({
  workspace: '/root/.openclaw/workspace/my-agent',
  agentName: 'my-agent',
  compressionEnabled: true,
  enableVectorSearch: true
});

// 保存记忆
await mem.save('knowledgeBase', { name: '张三',爱好: '摄影' });

// 加载记忆
const data = mem.load('knowledgeBase');

// 搜索
const results = mem.search('摄影');
const vectorResults = mem.vectorSearch('爱好');

// 工作上下文
await mem.saveWorkContext({
  filePath: '/root/project/index.js',
  lineNumber: 100,
  task: '实现用户认证'
});

const context = mem.loadWorkContext();

// 快照
mem.createSnapshot({ step: 10, progress: '完成50%' });
const validation = mem.validateSnapshot();

// 标记重要
await mem.markImportant({ event: '用户偏好', detail: '喜欢简洁设计' });

// 记录错误
await mem.recordError({ message: 'TypeError', stack: '...' });

// 获取自动加载内容
const autoLoad = mem.getAutoLoadMemory();

// 智能摘要
const summary = mem.summarize(largeData, 500);

// 统计
const stats = mem.getStats();
```

## 故障排查

### 常见问题

#### 1. 记忆加载失败
- **症状**：`load()` 返回空对象
- **原因**：文件不存在或格式错误
- **解决**：检查文件路径，确认 JSON 格式正确

#### 2. 搜索不到结果
- **症状**：搜索返回空数组
- **原因**：关键词不匹配或分片存储未启用
- **解决**：使用模糊搜索 `mem.search(query, { fuzzy: true })`

#### 3. 快照验证失败
- **症状**：`validateSnapshot()` 返回 invalid
- **原因**：数据被修改或文件损坏
- **解决**：检查 checksum，手动恢复或重新创建快照

#### 4. 存储空间过大
- **症状**：memorys/ 目录占用大量空间
- **原因**：未启用压缩或分片
- **解决**：启用 `compressionEnabled` 和 `enableSharding`

#### 5. 缓存未更新
- **症状**：加载的数据是旧的
- **解决**：调用 `mem.clearCache()` 清除缓存，或使用 `{ useCache: false }` 选项

### 调试技巧

```javascript
// 查看详细统计
console.log(mem.getStats());

// 检查索引
const index = mem.load('index');
console.log(index);

// 验证文件完整性
const fs = require('fs');
const files = fs.readdirSync(mem.storagePath);
console.log('Files:', files);
```

## 与其他技能的协作

- 可与 session-logs 协作获取历史会话
- 可与 coding-agent 协作继承代码编写进度
- 可与 weather 协作记住用户偏好天气

## 版本历史

### v0.3.6
- 配置验证
- 钩子/事件系统
- 搜索热度统计
- 批量操作 API
- 向量缓存
- 动态备份文件列表
- 增量快照默认开启
- 分片存储默认开启

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
- summarize 返回值统一
- CLI 异常保护

### v0.3.1
- 正则预编译
- 校验和递归排序
- LRU 缓存优化
- 批量更新置信度
- 重要事件 365 天保留

### v0.3.0
- 正式发布版本
- 完整功能实现
- 多语言 README
- 存储路径优化

# persistent-memory-claw

[English](#english) | [中文](./README.md)

---

## 🎯 Project Design Purpose

This project was created to solve the "memory loss" problem in AI assistants. Traditional AI conversations lose all context after each session ends - this system provides persistent memory capabilities for OpenClaw agents.

**Core Goals:**

- Enable cross-session memory persistence
- Memory isolation for multiple agents
- Intelligent search and knowledge extraction
- Efficient storage and retrieval

---

## ✨ Features

### Core Storage

| Feature | Description |
|---------|-------------|
| Persistent Storage | JSON files + gzip compression |
| Independent Directory | Each Agent has isolated storage |
| Sharded Storage | Split by date/type for large files |
| Incremental Mode | Store only changes, reduce redundancy |

### Smart Search

| Feature | Description |
|---------|-------------|
| Keyword Search | Fast content matching |
| Vector Search | Keyword weight-based semantic matching |
| Semantic Search | N-gram + cosine similarity |
| Mixed Search | Combine multiple search methods |
| Search Hotness | Track popular search keywords |

### Knowledge Management

| Feature | Description |
|---------|-------------|
| Experience Extraction | Auto-extract knowledge from conversations |
| Confidence Tracking | Usage frequency + time decay |
| Importance Marking | 1-5 star levels |
| Active Confirmation | Pending knowledge queue |

### Work Inheritance

| Feature | Description |
|---------|-------------|
| Code Inheritance | File path, line number, function name |
| Task Inheritance | Task progress, TODO |
| Variable Inheritance | State variables preservation |
| Thinking Chain | Layered context memory |

### Snapshot & Backup

| Feature | Description |
|---------|-------------|
| Multi-version Snapshots | Keep historical versions |
| Incremental Snapshots | Efficient change storage |
| SHA256 Validation | 98% accuracy |
| Auto Backup | Daily automatic backup |
| 90-day Retention | Long-term history |

---

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/2730554131/persistent-memory-claw.git

# Enter directory
cd persistent-memory-claw

# ✅ No need to manually install dependencies! They will be installed automatically on first use
```

### Basic Usage

```javascript
const PersistentMemory = require('./scripts/memory.cjs');

// Initialize
const mem = new PersistentMemory({
  workspace: '/path/to/workspace'
});

// Save memory
await mem.save('knowledge', { name: 'test', value: 'data' });

// Load memory
const data = mem.load('knowledge');

// Search
const results = mem.search('test');
```

### CLI Usage

```bash
# Set workspace
export OPENCLAW_WORKSPACE=/path/to/workspace

# Save
node scripts/memory.cjs save knowledge '{"key":"value"}'

# Load
node scripts/memory.cjs load knowledge

# Search
node scripts/memory.cjs search keyword

# Snapshot
node scripts/memory.cjs snapshot

# Backup
node scripts/memory.cjs backup
```

---

## 📖 Configure with OpenClaw

### Step 1: Configure skills

Edit OpenClaw config `openclaw.json`:

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

### Step 2: Restart gateway

```bash
openclaw gateway restart
```

### Step 3: Verify

```bash
# Check health
node scripts/memory.cjs health
```

---

## ⚙️ Configuration

### Storage

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `workspace` | string | process.cwd() | Workspace directory |
| `storagePath` | string | {workspace}/memorys | Memory storage path |
| `backupPath` | string | {workspace}/memory-backup | Backup path |
| `enableSharding` | boolean | true | Enable sharded storage |
| `compressionEnabled` | boolean | true | Enable compression |

### Trigger

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `triggerThreshold` | number | 0.7 | Trigger threshold (0-1) |
| `maxAutoLoad` | number | 5120 | Auto load limit (bytes) |
| `storageMode` | string | 'incremental' | Storage mode |

### Snapshot

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enableIncrementalSnapshot` | boolean | true | Incremental snapshot |
| `maxSnapshotVersions` | number | 5 | Version count |
| `snapshotInterval` | number | 5 | Snapshot interval |

### Memory

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxCacheSize` | number | 10 | Cache size |
| `importantEventsRetentionDays` | number | 365 | Important events retention |
| `maxSearchHistory` | number | 100 | Search history |

### Performance

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enableAsyncIO` | boolean | true | Async I/O |
| `enableIndexPersistence` | boolean | true | Index persistence |

---

## 📁 Project Structure

```
persistent-memory-claw/
├── .gitignore              # Git ignore config
├── README.md               # Chinese docs
├── README_EN.md           # English docs
├── SKILL.md               # OpenClaw Skill definition
├── scripts/
│   └── memory.cjs         # Core library (v0.3.6)
└── docs/                  # Documentation (optional)
```

---

## 📋 API Reference

### Basic Operations

```javascript
// Save
await mem.save(key, data)

// Load
mem.load(key)

// Batch
await mem.saveBatch([{key, data}, ...])
mem.loadBatch([key1, key2])
```

### Search

```javascript
mem.search(query)           // Keyword
mem.vectorSearch(query)    // Vector
mem.semanticSearch(query) // Semantic
mem.getSearchHotness()    // Hotness
```

### Knowledge Management

```javascript
mem.markImportant(event, 5)     // Mark important
mem.autoLearn(messages)         // Auto learn
mem.extractExperience(msgs)    // Extract experience
mem.updateConfidence(key, 1)   // Update confidence
```

### Snapshot & Backup

```javascript
mem.createSnapshot(state)       // Create snapshot
mem.rollbackToVersion(v)       // Rollback
mem.createBackup()              // Backup
mem.restoreBackup(name)        // Restore
```

### System

```javascript
mem.healthCheck()         // Health check
mem.getSystemSummary()   // System summary
mem.getStats()          // Statistics
```

---

## 🔧 Hooks

```javascript
const mem = new PersistentMemory({
  workspace: '/path/to/workspace',
  hooks: {
    afterSave: [(data) => console.log('Saved:', data.key)],
    onError: [(err) => console.error('Error:', err)]
  }
});

// Runtime registration
mem.registerHook('afterSave', (data) => {
  console.log('Key saved:', data.key);
});
```

---

## 📝 Changelog

### v0.3.6
- Configuration validation
- Hook/event system
- Search hotness tracking
- Batch operation API
- Vector caching
- Dynamic backup file list

### v0.3.5
- Index persistence
- Health check interface
- System summary interface

### v0.3.4
- Async I/O
- Async compression/decompression

### v0.3.3
- File lock mechanism
- Memory index optimization

### v0.3.2
- Log level
- Error pattern cleanup
- Learning history cleanup

### v0.3.1
- Regex precompilation
- Checksum fix
- LRU optimization
- 365-day important events

---

## 📄 License

MIT License

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📧 Contact

For issues, please submit an Issue.

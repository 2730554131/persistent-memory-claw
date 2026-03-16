# persistent-memory-claw

[English](#english) | [中文](./README.md)

---

## 🎯 Project Design Purpose

This project was created to solve the "memory loss" problem in AI assistants. Traditional AI conversations lose all context after each session ends - this system provides persistent memory capabilities for OpenClaw agents.

**Core Goals:**

- Cross-session memory persistence
- Memory isolation for multiple agents
- Efficient storage and retrieval

---

## ✨ Features

### Core Features

| Feature | Description |
|---------|-------------|
| Save Memory | Save content you want to remember |
| Search Memory | Keyword search |
| List Memory | View all saved memories |
| Auto-save Session | Auto-save conversation and create new session when context reaches 80% |

### Technical Features

- **SQLite Storage** - Efficient, reliable local database
- **Skill Actions** - Can be automatically called via OpenClaw intent routing
- **Multi-category Support** - Support different memory categories
- **Auto-install Dependencies** - Auto-install required dependencies on first use

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/2730554131/persistent-memory-claw.git
cd persistent-memory-claw

# ✅ No need to manually install dependencies! They will be installed automatically on first use
```

### Move to skills directory

```bash
# Move to your OpenClaw workspace skills directory
mv persistent-memory-claw /path/to/your-workspace/skills/

# Restart gateway
openclaw gateway restart
```

### CLI Usage

```bash
# Set workspace (optional, default is current directory)
export OPENCLAW_WORKSPACE=/path/to/workspace

# Save memory
node scripts/memory.cjs save knowledgeBase "content to remember"

# Search memory
node scripts/memory.cjs search keyword

# List memories
node scripts/memory.cjs list
```

### OpenClaw Skill Actions

This skill provides four actions:

| Action | Description | Trigger Keywords |
|--------|-------------|------------------|
| `persistent_memory_save` | Save memory | Remember, save, record |
| `persistent_memory_search` | Search memory | Search, find |
| `persistent_memory_list` | List memories | List, view memories |
| `persistent_memory_auto_save` | Auto-save session | (use with heartbeat) |

### Auto-save Session Function

When context usage ratio reaches threshold (default 80%), automatically save conversation and create new session:

```javascript
// Parameters
{
  threshold: 0.8,    // Trigger threshold (0-1), default 0.8
  autoReset: true     // Whether to create new session, default true
}
```

**Workflow:**

1. Check current session's context usage ratio
2. If threshold reached (default 80%):
   - Extract all conversation content
   - Auto-save to memory system (category: conversation, with timestamps)
   - Archive current session file
   - Create new session
3. Return save result and new session info

**Usage:**

```bash
# CLI mode
node scripts/auto-save.cjs 0.8 --save-reset

# Parameters:
# 0.8 - threshold (80%)
# --save-reset - auto save and create new session
```

**Configure heartbeat for periodic checks:**

Add scheduled task in workspace's `HEARTBEAT.md`, periodically call `persistent_memory_auto_save` action.

---

## 📁 Project Structure

```
persistent-memory-claw/
├── README.md               # Chinese docs
├── README_EN.md           # English docs
├── SKILL.md               # OpenClaw Skill definition
├── package.json           # Dependencies
├── actions/               # Skill Actions
│   ├── save.js           # Save memory
│   ├── search.js         # Search memory
│   ├── list.js           # List memories
│   └── auto-save.js      # Auto-save session
└── scripts/
    ├── memory.cjs         # Core library
    └── auto-save.cjs     # Auto-save logic
```

---

## 💾 Storage Structure

```
{workspace}/
└── memorys/
    └── memory.db         # SQLite database
```

---

## 📖 Configuration (Optional)

If moved to workspace skills directory, no additional config needed.

To customize path, edit `openclaw.json`:

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

## 📝 Changelog

### v0.6.1
- Enhanced auto-save function: automatically save conversation to memory and create new session
- Added session archive functionality
- Added conversation timestamp tracking

### v0.6.0
- Auto-save session function: save conversation and reset when context reaches 80%

### v0.5.1
- Auto-install dependencies feature

### v0.5.0
- Upgraded to SQLite storage
- Added Skill Actions support
- Intent routing support

---

## 📄 License

MIT License

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📧 Contact

For issues, please submit an Issue.

#!/usr/bin/env node

/**
 * Persistent Memory System v0.5.0
 * OpenClaw 持久记忆系统 - SQLite 版
 * 
 * 核心功能：保存、搜索、列表
 * 存储：SQLite 数据库
 */

const fs = require('fs');
const path = require('path');

/**
 * 自动安装依赖 - 从 package.json 读取所有依赖并自动安装
 */
function ensureDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  
  let deps = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    deps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ];
  } catch (e) {
    // 如果读取失败，使用默认依赖
    deps = ['sqlite3'];
  }
  
  for (const dep of deps) {
    try {
      require(dep);
    } catch (e) {
      console.log(`Auto-installing missing dependency: ${dep}...`);
      const { execSync } = require('child_process');
      try {
        execSync(`npm install ${dep}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        console.log(`${dep} installed successfully`);
      } catch (installError) {
        console.error(`Failed to install ${dep}:`, installError.message);
      }
    }
  }
}

// 自动检查并安装依赖
ensureDependencies();

// 动态加载 sqlite3
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.error('Failed to load sqlite3 after auto-install');
  process.exit(1);
}

// ==================== 意图处理 ====================

class IntentHandler {
  async handleSave(message, mem) {
    const id = await mem.save('knowledgeBase', message);
    return { action: 'saved', id, content: message };
  }
  
  handleSearch(message, mem) {
    const results = mem.search(message);
    return { action: 'search', query: message, results, count: results.length };
  }
  
  handleList(message, mem) {
    const list = mem.list();
    return { action: 'list', data: list, count: list.length };
  }
  
  handleUnclear(message) {
    return { action: 'unclear', message: '我没能理解您的意图', original: message };
  }
  
  async process(intentType, message, mem) {
    const handlers = {
      save: this.handleSave,
      search: this.handleSearch,
      list: this.handleList
    };
    const handler = handlers[intentType];
    return handler ? await handler.call(this, message, mem) : this.handleUnclear(message);
  }
}

// ==================== 主类 ====================

class PersistentMemory {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    this.dbPath = options.dbPath || path.join(this.workspace, 'memorys', 'memory.db');
    this.agentName = options.agentName || 'default';
    this.intentHandler = new IntentHandler();
    this.db = null;
    this.initialized = false;
  }
  
  async init() {
    if (this.initialized) return;
    
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 初始化数据库
    this.db = new sqlite3.Database(this.dbPath);
    
    // 创建表
    await new Promise((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL DEFAULT 'knowledgeBase',
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          agent TEXT NOT NULL DEFAULT 'default'
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 创建索引
    await new Promise((resolve, reject) => {
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_category ON memories(category)
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    this.initialized = true;
  }
  
  async save(category, content) {
    await this.init();
    
    const timestamp = Date.now();
    const agent = this.agentName;
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO memories (category, content, timestamp, agent) VALUES (?, ?, ?, ?)',
        [category, content, timestamp, agent],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }
  
  load(category, options = {}) {
    // 同步加载（兼容旧接口）
    return {};
  }
  
  search(query) {
    return new Promise((resolve, reject) => {
      this.init().then(() => {
        const results = [];
        const queryLower = query.toLowerCase();
        
        this.db.all(
          'SELECT id, category, content, timestamp, agent FROM memories WHERE content LIKE ? ORDER BY timestamp DESC LIMIT 50',
          [`%${query}%`],
          (err, rows) => {
            if (err) reject(err);
            else {
              for (const row of rows) {
                results.push({
                  id: row.id,
                  category: row.category,
                  content: row.content,
                  timestamp: row.timestamp,
                  agent: row.agent,
                  match: 'keyword'
                });
              }
              resolve(results);
            }
          }
        );
      });
    });
  }
  
  list() {
    return new Promise((resolve, reject) => {
      this.init().then(() => {
        this.db.all(
          'SELECT id, category, content, timestamp, agent FROM memories ORDER BY timestamp DESC',
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
    });
  }
  
  async processIntent(intentType, message) {
    await this.init();
    return await this.intentHandler.process(intentType, message, this);
  }
  
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

// ==================== CLI ====================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const arg1 = args[1];
  const arg2 = args[2];
  const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
  const mem = new PersistentMemory({ workspace });
  
  async function run() {
    try {
      switch (command) {
        case 'save':
          const id = await mem.save(arg1 || 'knowledgeBase', arg2 || '');
          console.log('Saved:', id);
          break;
        case 'search':
          const results = await mem.search(arg1 || '');
          console.log(JSON.stringify(results, null, 2));
          break;
        case 'list':
          const list = await mem.list();
          console.log(JSON.stringify(list, null, 2));
          break;
        case 'processIntent':
          console.log(JSON.stringify(await mem.processIntent(arg1, arg2 || ''), null, 2));
          break;
        default:
          console.log(`
Persistent Memory CLI v0.5.0

Usage: node memory.cjs <command> [args]

Commands:
  save <category> <content>   Save memory
  search <query>              Search memory
  list                        List all memories
  processIntent <type> <msg>  Process intent
          `);
      }
    } catch (e) { 
      console.error('Error:', e.message); 
      process.exit(1); 
    } finally {
      mem.close();
    }
  }
  run();
}

module.exports = { PersistentMemory };

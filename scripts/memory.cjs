#!/usr/bin/env node

/**
 * Persistent Memory System - SQLite 版本
 * 持久记忆系统 - 简洁版
 * 
 * 存储路径：{workspace}/memory/{sessionId}.db
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PersistentMemory {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    this.sessionId = options.sessionId || this.generateSessionId();
    
    // 存储路径：{workspace}/memory/
    this.memoryPath = path.join(this.workspace, 'memory');
    
    // 确保目录存在
    if (!fs.existsSync(this.memoryPath)) {
      fs.mkdirSync(this.memoryPath, { recursive: true });
    }
    
    // 数据库路径：{sessionId}.db
    this.dbPath = path.join(this.memoryPath, `${this.sessionId}.db`);
    
    // 初始化数据库
    this.initDb();
  }
  
  generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }
  
  initDb() {
    const sqlite3 = require('sqlite3').verbose();
    this.db = new sqlite3.Database(this.dbPath);
    
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'default',
          tags TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_category ON memories(category)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at)`);
    });
  }
  
  // 保存记忆
  save(category, content) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(
        'INSERT INTO memories (content, category, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
      );
      stmt.run(JSON.stringify(content), category, (err) => {
        if (err) reject(err);
        else resolve({ success: true, category, content });
      });
      stmt.finalize();
    });
  }
  
  // 搜索记忆
  search(query) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stmt = this.db.prepare(
        'SELECT * FROM memories WHERE content LIKE ? ORDER BY created_at DESC'
      );
      stmt.each(`%${query}%`, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          row.content = JSON.parse(row.content);
        } catch {}
        results.push(row);
      }, (err) => {
        if (err) reject(err);
        else resolve(results);
      });
      stmt.finalize();
    });
  }
  
  // 列出所有记忆
  list() {
    return new Promise((resolve, reject) => {
      const results = [];
      this.db.each(
        'SELECT id, category, created_at FROM memories ORDER BY created_at DESC',
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          results.push(row);
        },
        (err) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
  }
  
  getDbPath() {
    return this.dbPath;
  }
  
  getSessionId() {
    return this.sessionId;
  }
  
  close() {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }
  
  // 获取所有记忆文件
  static listMemoryFiles(workspace) {
    const memoryPath = path.join(workspace, 'memory');
    if (!fs.existsSync(memoryPath)) {
      return [];
    }
    return fs.readdirSync(memoryPath)
      .filter(f => f.endsWith('.db'))
      .map(f => path.join(memoryPath, f));
  }
  
  // 搜索所有记忆文件
  static searchAll(workspace, query) {
    const files = this.listMemoryFiles(workspace);
    const sqlite3 = require('sqlite3').verbose();
    const results = [];
    
    for (const file of files) {
      const db = new sqlite3.Database(file);
      const stmt = db.prepare('SELECT * FROM memories WHERE content LIKE ?');
      stmt.each(`%${query}%`, (err, row) => {
        if (!err && row) {
          try {
            row.content = JSON.parse(row.content);
          } catch {}
          row.file = path.basename(file);
          results.push(row);
        }
      });
      stmt.finalize();
      db.close();
    }
    return results;
  }
}

// CLI 接口
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
  const sessionId = process.argv.find(arg => arg.length === 16) || undefined;
  
  const mem = new PersistentMemory({ workspace, sessionId });
  
  try {
    switch (command) {
      case 'save': {
        const category = args[1] || 'default';
        const content = args[2] || '';
        const result = await mem.save(category, content);
        console.log(JSON.stringify({ success: true, ...result }));
        break;
      }
      
      case 'search': {
        const query = args[1] || '';
        const results = await mem.search(query);
        console.log(JSON.stringify({ success: true, results }));
        break;
      }
      
      case 'list': {
        const results = await mem.list();
        console.log(JSON.stringify({ success: true, results }));
        break;
      }
      
      case 'path': {
        console.log(mem.getDbPath());
        break;
      }
      
      default:
        console.log('用法:');
        console.log('  node memory.cjs save <分类> <内容>');
        console.log('  node memory.cjs search <关键词>');
        console.log('  node memory.cjs list');
        console.log('  node memory.cjs path');
    }
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error.message }));
  } finally {
    await mem.close();
  }
}

main();

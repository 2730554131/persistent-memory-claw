#!/usr/bin/env node

/**
 * Persistent Memory System v0.4.2
 * OpenClaw 持久记忆系统 - 极简版
 * 
 * 核心功能：保存、搜索、列表
 * 存储：JSON 文件
 */

const fs = require('fs');
const path = require('path');

// ==================== 意图处理 ====================

class IntentHandler {
  async handleSave(message, mem) {
    await mem.save('knowledgeBase', { content: message, timestamp: Date.now() });
    return { action: 'saved', content: message };
  }
  
  handleSearch(message, mem) {
    const results = mem.search(message);
    return { action: 'search', content: message, results };
  }
  
  handleList(message, mem) {
    const list = mem.list();
    return { action: 'list', data: list };
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
    this.storagePath = options.storagePath || path.join(this.workspace, 'memorys');
    this.agentName = options.agentName || 'default';
    this.intentHandler = new IntentHandler();
    this.stepCount = 0;
    this.ensureStorageDir();
  }
  
  ensureStorageDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }
  
  getFilePath(key) {
    const files = { knowledgeBase: 'knowledge-base.json' };
    return path.join(this.storagePath, files[key] || `${key}.json`);
  }
  
  async save(key, data) {
    const filePath = this.getFilePath(key);
    let saveData = data;
    if (fs.existsSync(filePath)) {
      try { saveData = { ...JSON.parse(fs.readFileSync(filePath, 'utf8')), ...data, timestamp: Date.now() }; } catch (e) { /* ignore */ }
    }
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    return { filePath, data: saveData };
  }
  
  load(key, options = {}) {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) return options.defaultValue || {};
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return options.defaultValue || {}; }
  }
  
  search(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const file of fs.readdirSync(dir)) {
        if (file === 'config.json') continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) { scanDir(filePath); continue; }
        if (!file.endsWith('.json')) continue;
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.toLowerCase().includes(queryLower)) {
            results.push({ file: filePath, match: 'keyword', snippet: content.substring(0, 200) });
          }
        } catch (e) { /* skip */ }
      }
    };
    scanDir(this.storagePath);
    return results;
  }
  
  list() {
    return { knowledge: this.load('knowledgeBase') };
  }
  
  async processIntent(intentType, message) {
    return await this.intentHandler.process(intentType, message, this);
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
          await mem.save(arg1, JSON.parse(arg2 || '{}'));
          console.log('Saved:', arg1);
          break;
        case 'load':
          console.log(JSON.stringify(mem.load(arg1), null, 2));
          break;
        case 'search':
          console.log(JSON.stringify(mem.search(arg1 || ''), null, 2));
          break;
        case 'list':
          console.log(JSON.stringify(mem.list(), null, 2));
          break;
        case 'processIntent':
          console.log(JSON.stringify(await mem.processIntent(arg1, arg2 || ''), null, 2));
          break;
        default:
          console.log(`
Persistent Memory CLI v0.4.2

Usage: node memory.cjs <command> [args]

Commands:
  save <key> <json>      Save data
  load <key>             Load data
  search <query>        Search memory
  list                   List all memories
  processIntent <type> <msg> Process intent
          `);
      }
    } catch (e) { console.error('Error:', e.message); process.exit(1); }
  }
  run();
}

module.exports = { PersistentMemory };

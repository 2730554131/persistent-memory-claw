#!/usr/bin/env node

/**
 * Auto-Save Hook for Persistent Memory
 * 自动保存钩子 - 集成到 OpenClaw 消息处理流程
 * 
 * 使用方式：
 * 1. 作为独立进程运行：node auto-save-hook.cjs
 * 2. 或集成到 OpenClaw 配置中
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 读取命令行参数
const args = process.argv.slice(2);
const command = args[0];

class AutoSaveHook {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    this.agentName = options.agentName || 'default';
    this.triggerThreshold = options.triggerThreshold || 0.7; // 70%
    this.checkInterval = options.checkInterval || 30000; // 30秒检查一次
    this.lastSaveTime = 0;
    this.messageCount = 0;
    this.estimatedTokens = 0;
    
    // 存储路径
    this.memoryPath = path.join(this.workspace, 'memorys', this.agentName);
    this.stateFile = path.join(this.memoryPath, 'auto-save-state.json');
    
    this.loadState();
  }

  // 加载状态
  loadState() {
    if (fs.existsSync(this.stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.messageCount = state.messageCount || 0;
        this.lastSaveTime = state.lastSaveTime || 0;
        this.estimatedTokens = state.estimatedTokens || 0;
      } catch (e) {
        console.error('Failed to load state:', e);
      }
    }
  }

  // 保存状态
  saveState() {
    const state = {
      messageCount: this.messageCount,
      lastSaveTime: this.lastSaveTime,
      estimatedTokens: this.estimatedTokens,
      updatedAt: Date.now()
    };
    
    if (!fs.existsSync(this.memoryPath)) {
      fs.mkdirSync(this.memoryPath, { recursive: true });
    }
    
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  // 估算 token 数量（简单估算：中文约 1.5 token/字符，英文约 4 token/词）
  estimateTokens(text) {
    if (!text) return 0;
    
    // 简单估算：中文 *2，英文 /4
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.ceil(chineseChars * 2 + otherChars / 4);
  }

  // 记录新消息
  recordMessage(content) {
    this.messageCount++;
    this.estimatedTokens += this.estimateTokens(content);
    this.saveState();
    
    console.log(`📝 Message #${this.messageCount}, Est. tokens: ${this.estimatedTokens}`);
    
    // 检查是否达到阈值
    this.checkAndSave();
  }

  // 检查并保存
  checkAndSave() {
    // 假设最大 context window 是 200000 tokens (MiniMax)
    const maxTokens = 200000;
    const currentUsage = this.estimatedTokens / maxTokens;
    
    console.log(`📊 Current usage: ${(currentUsage * 100).toFixed(1)}% / ${(this.triggerThreshold * 100).toFixed(0)}%`);
    
    if (currentUsage >= this.triggerThreshold) {
      console.log('✅ Threshold reached! Triggering auto-save...');
      this.triggerAutoSave();
    }
  }

  // 触发自动保存
  triggerAutoSave() {
    const now = Date.now();
    
    // 防止频繁保存（至少间隔 1 分钟）
    if (now - this.lastSaveTime < 60000) {
      console.log('⏭️ Skipped - too soon since last save');
      return;
    }
    
    const saveData = {
      autoSavedAt: new Date().toISOString(),
      messageCount: this.messageCount,
      estimatedTokens: this.estimatedTokens,
      triggerReason: 'threshold_reached',
      threshold: this.triggerThreshold
    };
    
    // 保存到记忆
    const autoSaveFile = path.join(this.memoryPath, 'auto-save.json');
    fs.writeFileSync(autoSaveFile, JSON.stringify(saveData, null, 2));
    
    // 记录快照
    this.createSnapshot(saveData);
    
    this.lastSaveTime = now;
    this.saveState();
    
    console.log('💾 Auto-saved!', saveData);
    
    return saveData;
  }

  // 创建快照
  createSnapshot(data) {
    const snapshotDir = path.join(this.memoryPath, 'snapshots');
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }
    
    const snapshot = {
      version: Date.now(),
      type: 'auto',
      state: data,
      timestamp: Date.now()
    };
    
    const snapshotPath = path.join(snapshotDir, `auto_snapshot_${snapshot.version}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    
    return snapshotPath;
  }

  // 获取当前状态
  getStatus() {
    const maxTokens = 200000;
    const currentUsage = this.estimatedTokens / maxTokens;
    
    return {
      messageCount: this.messageCount,
      estimatedTokens: this.estimatedTokens,
      currentUsage: `${(currentUsage * 100).toFixed(1)}%`,
      threshold: `${(this.triggerThreshold * 100).toFixed(0)}%`,
      lastSaveTime: this.lastSaveTime ? new Date(this.lastSaveTime).toISOString() : 'Never',
      readyToSave: currentUsage >= this.triggerThreshold
    };
  }

  // 重置状态
  reset() {
    this.messageCount = 0;
    this.estimatedTokens = 0;
    this.lastSaveTime = 0;
    this.saveState();
    console.log('🔄 State reset');
  }

  // 手动触发保存
  forceSave() {
    console.log('💾 Force saving...');
    return this.triggerAutoSave();
  }

  // 启动监听模式
  startListening() {
    console.log('🎧 Starting auto-save listener...');
    console.log(`📊 Threshold: ${(this.triggerThreshold * 100).toFixed(0)}%`);
    console.log(`📁 Workspace: ${this.workspace}`);
    console.log(`📁 Memory path: ${this.memoryPath}`);
    console.log('\nUsage:');
    console.log('  - Record a message: node auto-save-hook.cjs record "Hello world"');
    console.log('  - Check status: node auto-save-hook.cjs status');
    console.log('  - Force save: node auto-save-hook.cjs save');
    console.log('  - Reset: node auto-save-hook.cjs reset');
    console.log('\nPress Ctrl+C to stop\n');
    
    // 保持进程运行
    this.checkIntervalId = setInterval(() => {
      // 定期检查
      if (this.estimatedTokens > 0) {
        this.checkAndSave();
      }
    }, this.checkInterval);
  }

  // 停止监听
  stopListening() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }
}

// 主程序
const hook = new AutoSaveHook({
  workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
  agentName: process.env.OPENCLAW_AGENT_NAME || 'default'
});

switch (command) {
  case 'record':
    // 记录消息
    const message = args.slice(1).join(' ');
    if (message) {
      hook.recordMessage(message);
    } else {
      console.log('Usage: record <message>');
    }
    break;

  case 'status':
    // 查看状态
    console.log('\n📊 Auto-Save Status:');
    console.log(JSON.stringify(hook.getStatus(), null, 2));
    break;

  case 'save':
    // 手动保存
    hook.forceSave();
    break;

  case 'reset':
    // 重置
    hook.reset();
    break;

  case 'listen':
    // 监听模式
    hook.startListening();
    
    // 处理退出信号
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping...');
      hook.stopListening();
      process.exit(0);
    });
    break;

  default:
    console.log(`
🎯 Persistent Memory Auto-Save Hook

Usage: node auto-save-hook.cjs <command>

Commands:
  record <message>    Record a message and check threshold
  status              Show current status
  save                Force auto-save
  reset               Reset message count
  listen              Start listening mode (keeps running)

Environment Variables:
  OPENCLAW_WORKSPACE      Workspace path
  OPENCLAW_AGENT_NAME     Agent name
`);
}

// 导出供其他模块使用
module.exports = AutoSaveHook;

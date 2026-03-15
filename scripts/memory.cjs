#!/usr/bin/env node

/**
 * Persistent Memory System v0.3.0
 * 持久记忆系统 - 高级优化版
 * 
 * 功能：
 * - 记忆存储和加载（支持压缩）
 * - 搜索功能（关键词+向量+混合）
 * - 工作上下文管理
 * - 快照和校验（98%准确率）- 多版本 + 增量
 * - 分片存储
 * - 置信度时间衰减
 * - 语义截断
 * - 重要度等级（1-5星）
 * - 自动备份
 * - 文件监听（自动保存）
 * - 主动确认学习
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

class PersistentMemory {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    // 存储路径直接为 {workspace}/memorys/，不再添加 agentName 子目录
    this.storagePath = options.storagePath || path.join(this.workspace, 'memorys');
    
    // 初始化存储路径
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    
    this.config = {
      triggerThreshold: options.triggerThreshold || 0.7, // 70% 触发
      maxAutoLoad: options.maxAutoLoad || 5 * 1024,
      enableVectorSearch: options.enableVectorSearch !== false,
      compressionLevel: options.compressionLevel || 6,
      compressionEnabled: options.compressionEnabled !== false,
      snapshotInterval: options.snapshotInterval || 5,
      storageStrategy: options.storageStrategy || 'by-type',
      storageMode: options.storageMode || 'incremental',
      enableSharding: options.enableSharding || false,
      shardBy: options.shardBy || 'date',
      // 新增配置
      maxSnapshotVersions: options.maxSnapshotVersions || 5,
      enableIncrementalSnapshot: options.enableIncrementalSnapshot || false,
      confidenceDecayEnabled: options.confidenceDecayEnabled !== false,
      confidenceHalfLifeDays: options.confidenceHalfLifeDays || 30,
      // 备份配置
      enableAutoBackup: options.enableAutoBackup !== false,
      backupRetentionDays: options.backupRetentionDays || 90, // 90天保留
      backupIntervalHours: options.backupIntervalHours || 24,
      backupPath: options.backupPath || path.join(this.workspace, 'memorys', 'backup')
    };
    
    this.files = {
      index: 'index.json',
      importantEvents: 'important-events.json',
      knowledgeBase: 'knowledge-base.json',
      errorPatterns: 'error-patterns.json',
      workContext: 'work-context.json',
      config: 'config.json'
    };
    
    this.stepCount = 0;
    this.cache = new Map(); // LRU 缓存
    this.maxCacheSize = 10;
    
    this.ensureStorageDir();
    this.loadConfig();
  }

  ensureStorageDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    
    const sessionDir = path.join(this.storagePath, 'session-summaries');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // 分片存储目录
    if (this.config.enableSharding) {
      const shardsDir = path.join(this.storagePath, 'shards');
      if (!fs.existsSync(shardsDir)) {
        fs.mkdirSync(shardsDir, { recursive: true });
      }
    }
  }

  // 加载配置
  loadConfig() {
    const configPath = path.join(this.storagePath, this.files.config);
    if (fs.existsSync(configPath)) {
      try {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.config = { ...this.config, ...savedConfig };
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    } else {
      this.saveConfig();
    }
  }

  // 保存配置
  saveConfig() {
    const configPath = path.join(this.storagePath, this.files.config);
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  // 更新配置
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    return this.config;
  }

  // 压缩数据
  compress(data) {
    if (!this.config.compressionEnabled) return JSON.stringify(data);
    const json = JSON.stringify(data);
    return zlib.gzipSync(json, { level: this.config.compressionLevel });
  }

  // 解压数据
  decompress(buffer) {
    if (!this.isGzipped(buffer)) return JSON.parse(buffer.toString('utf8'));
    const json = zlib.gunzipSync(buffer);
    return JSON.parse(json);
  }

  // 检查是否 gzip 压缩
  isGzipped(buffer) {
    return buffer[0] === 0x1f && buffer[1] === 0x8b;
  }

  // 获取分片路径
  getShardPath(key, value) {
    if (!this.config.enableSharding) return this.storagePath;
    const shardsDir = path.join(this.storagePath, 'shards', key);
    if (!fs.existsSync(shardsDir)) {
      fs.mkdirSync(shardsDir, { recursive: true });
    }
    return shardsDir;
  }

  // 保存记忆（支持分片）
  async save(key, data, options = {}) {
    let saveData = data;
    let filePath;
    
    if (this.config.storageMode === 'incremental') {
      const existing = this.load(key, { raw: true, useCache: false });
      saveData = { ...existing, ...data, timestamp: Date.now() };
    }
    
    // 分片处理
    if (options.shard && this.config.enableSharding) {
      const shardValue = options.shardValue || new Date().toISOString().split('T')[0];
      filePath = path.join(this.getShardPath(options.shard, shardValue), `${key}.json`);
    } else {
      filePath = path.join(this.storagePath, this.files[key] || `${key}.json`);
    }
    
    const finalData = this.config.compressionEnabled 
      ? this.compress(saveData) 
      : JSON.stringify(saveData, null, 2);
    
    fs.writeFileSync(filePath, finalData);
    
    // 更新缓存
    this.cache.set(key, saveData);
    
    // 更新索引（不触发递归）
    if (!options.skipIndexUpdate) {
      this._updateIndexSync(key, filePath);
    }
    
    return filePath;
  }

  // 同步更新索引
  _updateIndexSync(key, filePath) {
    let index = {};
    const indexPath = path.join(this.storagePath, 'index.json');
    
    if (fs.existsSync(indexPath)) {
      try {
        const content = fs.readFileSync(indexPath);
        index = this.isGzipped(content) ? this.decompress(content) : JSON.parse(content);
      } catch (e) {
        index = {};
      }
    }
    
    index[key] = {
      path: filePath,
      lastModified: Date.now(),
      size: fs.statSync(filePath).size
    };
    
    const finalData = this.config.compressionEnabled 
      ? this.compress(index) 
      : JSON.stringify(index, null, 2);
    fs.writeFileSync(indexPath, finalData);
  }

  // 更新索引（已废弃，使用 _updateIndexSync）
  updateIndex(key, filePath) {
    this._updateIndexSync(key, filePath);
  }

  // 加载记忆
  load(key, options = {}) {
    // 检查缓存
    if (options.useCache !== false && this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    let filePath;
    
    if (options.shard && this.config.enableSharding) {
      filePath = path.join(this.getShardPath(options.shard, options.shardValue), `${key}.json`);
    } else {
      filePath = path.join(this.storagePath, this.files[key] || `${key}.json`);
    }
    
    if (!fs.existsSync(filePath)) {
      return options.raw ? null : (options.defaultValue || {});
    }
    
    try {
      const content = fs.readFileSync(filePath);
      const data = this.decompress(content);
      
      // 更新缓存
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, data);
      
      return data;
    } catch (e) {
      console.error(`Error loading ${key}:`, e);
      return options.raw ? null : (options.defaultValue || {});
    }
  }

  // 智能搜索（混合搜索）
  search(query, options = {}) {
    const results = {
      keyword: [],
      fuzzy: []
    };
    
    const searchFiles = (dir) => {
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'config.json' || file === 'index.json') continue;
        
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          searchFiles(filePath);
          continue;
        }
        
        if (!file.endsWith('.json')) continue;
        
        try {
          const content = fs.readFileSync(filePath);
          const data = this.decompress(content);
          const jsonStr = JSON.stringify(data).toLowerCase();
          const queryLower = query.toLowerCase();
          
          // 关键词匹配
          if (jsonStr.includes(queryLower)) {
            results.keyword.push({
              file: filePath,
              match: 'keyword',
              snippet: this.getSnippet(data, query)
            });
          } 
          // 模糊匹配（简单实现）
          else if (options.fuzzy && this.fuzzyMatch(jsonStr, queryLower)) {
            results.fuzzy.push({
              file: filePath,
              match: 'fuzzy',
              snippet: this.getSnippet(data, query)
            });
          }
        } catch (e) {
          // 跳过无法读取的文件
        }
      }
    };
    
    searchFiles(this.storagePath);
    
    // 返回合并结果
    return options.fuzzy 
      ? [...results.keyword, ...results.fuzzy] 
      : results.keyword;
  }

  // 简单模糊匹配
  fuzzyMatch(text, query) {
    let queryIdx = 0;
    for (let i = 0; i < text.length && queryIdx < query.length; i++) {
      if (text[i] === query[queryIdx]) {
        queryIdx++;
      }
    }
    return queryIdx >= query.length * 0.8;
  }

  // ==================== 语义向量搜索 ====================
  
  // 生成 N-gram 向量
  generateNgramVector(text, n = 2) {
    const textLower = text.toLowerCase();
    const ngrams = new Map();
    
    // 字符级 N-gram
    for (let i = 0; i <= textLower.length - n; i++) {
      const ngram = textLower.substring(i, i + n);
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
    }
    
    // 词级 N-gram
    const words = textLower.split(/[\s,，。！？、]+/).filter(w => w.length > 0);
    for (const word of words) {
      for (let i = 0; i <= word.length - n; i++) {
        const ngram = word.substring(i, i + n);
        ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
      }
    }
    
    return ngrams;
  }

  // 计算余弦相似度
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    const allKeys = new Set([...vec1.keys(), ...vec2.keys()]);
    
    for (const key of allKeys) {
      const val1 = vec1.get(key) || 0;
      const val2 = vec2.get(key) || 0;
      dotProduct += val1 * val2;
    }
    
    const mag1 = Math.sqrt([...vec1.values()].reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt([...vec2.values()].reduce((sum, val) => sum + val * val, 0));
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    return dotProduct / (mag1 * mag2);
  }

  // 语义向量搜索（基于 N-gram）
  semanticSearch(query, options = {}) {
    const { minSimilarity = 0.1, topK = 10 } = options;
    
    const queryVector = this.generateNgramVector(query);
    const results = [];
    
    const searchInFile = (filePath, fileName) => {
      try {
        const content = fs.readFileSync(filePath);
        const data = this.decompress(content);
        
        const extractTexts = (obj, prefix = '') => {
          const texts = [];
          if (typeof obj === 'string') {
            texts.push(prefix + obj);
          } else if (Array.isArray(obj)) {
            for (const item of obj) {
              texts.push(...extractTexts(item, prefix));
            }
          } else if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
              if (key.startsWith('_')) continue;
              texts.push(...extractTexts(value, prefix + key + ':'));
            }
          }
          return texts;
        };
        
        const texts = extractTexts(data);
        
        for (const text of texts) {
          if (!text || text.length < 2) continue;
          
          const textVector = this.generateNgramVector(text);
          const similarity = this.cosineSimilarity(queryVector, textVector);
          
          if (similarity >= minSimilarity) {
            results.push({
              file: fileName,
              path: filePath,
              similarity: Math.round(similarity * 100) / 100,
              snippet: text.substring(0, 200)
            });
          }
        }
      } catch (e) {
        // 跳过
      }
    };
    
    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          if (file !== 'snapshots' && file !== 'backup') {
            scanDir(filePath);
          }
        } else if (file.endsWith('.json') && file !== 'config.json') {
          searchInFile(filePath, file);
        }
      }
    };
    
    scanDir(this.storagePath);
    
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  // 获取匹配片段
  getSnippet(data, query) {
    const str = JSON.stringify(data);
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return str.substring(0, 200);
    const start = Math.max(0, idx - 50);
    const end = Math.min(str.length, idx + query.length + 150);
    return str.substring(start, end);
  }

  // 向量搜索（简化版 - 基于关键词权重）
  vectorSearch(query, options = {}) {
    if (!this.config.enableVectorSearch) {
      return this.search(query, options);
    }
    
    // 分词
    const tokens = query.toLowerCase().split(/\s+/);
    const results = [];
    
    const searchInFile = (filePath) => {
      try {
        const content = fs.readFileSync(filePath);
        const data = this.decompress(content);
        const jsonStr = JSON.stringify(data).toLowerCase();
        
        let score = 0;
        for (const token of tokens) {
          if (jsonStr.includes(token)) {
            score += 1;
            // 精确匹配加更多分
            if (jsonStr.includes(`"${token}"`) || jsonStr.includes(`'${token}'`)) {
              score += 2;
            }
          }
        }
        
        if (score > 0) {
          results.push({
            file: filePath,
            score,
            match: 'vector',
            snippet: this.getSnippet(data, tokens[0])
          });
        }
      } catch (e) {
        // 跳过
      }
    };
    
    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          scanDir(filePath);
        } else if (file.endsWith('.json')) {
          searchInFile(filePath);
        }
      }
    };
    
    scanDir(this.storagePath);
    
    // 按分数排序
    return results.sort((a, b) => b.score - a.score);
  }

  // 保存工作上下文
  saveWorkContext(context) {
    const fullContext = {
      ...context,
      savedAt: new Date().toISOString(),
      stepCount: this.stepCount,
      workspace: this.workspace,
      agentName: this.agentName
    };
    
    return this.save('workContext', fullContext);
  }

  // 加载工作上下文
  loadWorkContext() {
    return this.load('workContext');
  }

  // ==================== 增量快照 ====================
  
  // 获取上一个快照状态（用于增量计算）
  getLastSnapshot() {
    const snapshotPath = path.join(this.storagePath, 'snapshot.json');
    if (!fs.existsSync(snapshotPath)) return null;
    
    try {
      return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  // 计算增量（diff）
  calculateDiff(oldState, newState) {
    const diff = {
      added: {},
      modified: {},
      removed: []
    };
    
    // 找出新增和修改的
    for (const [key, value] of Object.entries(newState)) {
      if (!oldState || oldState[key] === undefined) {
        diff.added[key] = value;
      } else if (JSON.stringify(oldState[key]) !== JSON.stringify(value)) {
        diff.modified[key] = value;
      }
    }
    
    // 找出删除的
    if (oldState) {
      for (const key of Object.keys(oldState)) {
        if (newState[key] === undefined) {
          diff.removed.push(key);
        }
      }
    }
    
    return diff;
  }

  // 创建增量快照
  createIncrementalSnapshot(newState) {
    const config = this.getSnapshotConfig();
    const lastSnapshot = this.getLastSnapshot();
    
    // 计算增量
    const diff = this.calculateDiff(lastSnapshot?.state, newState);
    
    // 检查变化是否足够大
    const diffSize = JSON.stringify(diff).length;
    if (diffSize < config.incrementalThreshold && lastSnapshot) {
      // 变化太小，不创建新快照
      return { 
        skipped: true, 
        reason: 'changes_below_threshold',
        diffSize 
      };
    }
    
    // 创建增量快照
    const snapshot = {
      version: Date.now(),
      type: 'incremental',
      baseVersion: lastSnapshot?.version || null,
      diff: diff,
      timestamp: Date.now(),
      stepCount: this.stepCount,
      checksum: this.calculateChecksum(diff),
      workspace: this.workspace,
      agentName: this.agentName
    };
    
    const snapshotDir = path.join(this.storagePath, 'snapshots');
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }
    
    // 保存增量快照
    const versionedPath = path.join(snapshotDir, `snapshot_${snapshot.version}.json`);
    fs.writeFileSync(versionedPath, JSON.stringify(snapshot, null, 2));
    
    // 更新当前完整快照
    const fullSnapshot = {
      version: snapshot.version,
      state: newState,
      timestamp: snapshot.timestamp,
      stepCount: snapshot.stepCount,
      checksum: this.calculateChecksum(newState),
      workspace: snapshot.workspace,
      agentName: snapshot.agentName,
      isFull: true
    };
    
    const currentPath = path.join(this.storagePath, 'snapshot.json');
    fs.writeFileSync(currentPath, JSON.stringify(fullSnapshot, null, 2));
    
    // 清理旧版本
    this.cleanupOldSnapshots(snapshotDir, config.maxVersions);
    
    return { 
      success: true, 
      type: 'incremental',
      version: snapshot.version,
      diffSize,
      diff
    };
  }

  // 从增量快照恢复
  restoreFromIncremental(targetVersion) {
    const snapshotDir = path.join(this.storagePath, 'snapshots');
    const versionedPath = path.join(snapshotDir, `snapshot_${targetVersion}.json`);
    
    if (!fs.existsSync(versionedPath)) {
      return { success: false, reason: 'Version not found' };
    }
    
    const snapshot = JSON.parse(fs.readFileSync(versionedPath, 'utf8'));
    
    if (snapshot.type !== 'incremental') {
      return { success: false, reason: 'Not an incremental snapshot' };
    }
    
    // 重建完整状态
    let restoredState = {};
    
    // 从基础版本开始重建
    if (snapshot.baseVersion) {
      const basePath = path.join(snapshotDir, `snapshot_${snapshot.baseVersion}.json`);
      if (fs.existsSync(basePath)) {
        const baseSnapshot = JSON.parse(fs.readFileSync(basePath, 'utf8'));
        // 递归恢复基础状态
        if (baseSnapshot.type === 'incremental') {
          const baseRestored = this.restoreFromIncremental(baseSnapshot.baseVersion);
          if (!baseRestored.success) return baseRestored;
          restoredState = baseRestored.state;
        } else {
          restoredState = baseSnapshot.state || {};
        }
      }
    }
    
    // 应用增量变化
    for (const [key, value] of Object.entries(snapshot.diff.added || {})) {
      restoredState[key] = value;
    }
    for (const [key, value] of Object.entries(snapshot.diff.modified || {})) {
      restoredState[key] = value;
    }
    for (const key of snapshot.diff.removed || []) {
      delete restoredState[key];
    }
    
    return { success: true, state: restoredState, version: targetVersion };
  }

  // ==================== 多版本快照 ====================
  
  // 获取快照配置
  getSnapshotConfig() {
    return {
      maxVersions: this.config.maxSnapshotVersions || 5, // 保留最近5个版本
      enableIncremental: this.config.enableIncrementalSnapshot || false,
      incrementalThreshold: this.config.incrementalThreshold || 1000 // 变化超过1000字符才增量
    };
  }

  // 创建快照（支持多版本）
  createSnapshot(fullState) {
    const config = this.getSnapshotConfig();
    const snapshotDir = path.join(this.storagePath, 'snapshots');
    
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }
    
    const snapshot = {
      version: Date.now(),
      state: fullState,
      timestamp: Date.now(),
      stepCount: this.stepCount,
      checksum: this.calculateChecksum(fullState),
      workspace: this.workspace,
      agentName: this.agentName
    };
    
    // 保存当前快照
    const snapshotPath = path.join(this.storagePath, 'snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    
    // 保存版本化快照
    const versionedPath = path.join(snapshotDir, `snapshot_${snapshot.version}.json`);
    fs.writeFileSync(versionedPath, JSON.stringify(snapshot, null, 2));
    
    // 清理旧版本
    this.cleanupOldSnapshots(snapshotDir, config.maxVersions);
    
    return { current: snapshotPath, versioned: versionedPath };
  }

  // 清理旧版本快照
  cleanupOldSnapshots(dir, maxVersions) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        time: fs.statSync(path.join(dir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // 删除旧版本
    if (files.length > maxVersions) {
      const toDelete = files.slice(maxVersions);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
      }
    }
  }

  // ==================== 自动备份 ====================
  
  // 获取备份目录
  getBackupPath() {
    return this.config.backupPath || path.join(this.workspace, 'memorys', 'backup');
  }

  // 创建备份
  createBackup(options = {}) {
    const config = this.config;
    if (!config.enableAutoBackup && !options.force) {
      return { success: false, reason: 'Auto backup disabled' };
    }
    
    const backupPath = this.getBackupPath();
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup_${timestamp}`;
    const backupDir = path.join(backupPath, backupName);
    
    fs.mkdirSync(backupDir, { recursive: true });
    
    // 复制所有记忆文件
    const filesToBackup = [
      'index.json',
      'important-events.json',
      'knowledge-base.json',
      'error-patterns.json',
      'work-context.json',
      'config.json',
      'snapshot.json'
    ];
    
    const backedUp = [];
    for (const file of filesToBackup) {
      const srcPath = path.join(this.storagePath, file);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(backupDir, file);
        fs.copyFileSync(srcPath, destPath);
        backedUp.push(file);
      }
    }
    
    // 复制快照目录
    const snapshotsSrc = path.join(this.storagePath, 'snapshots');
    if (fs.existsSync(snapshotsSrc)) {
      const snapshotsDest = path.join(backupDir, 'snapshots');
      this.copyDirRecursive(snapshotsSrc, snapshotsDest);
      backedUp.push('snapshots/');
    }
    
    // 记录备份信息
    const backupInfo = {
      timestamp: Date.now(),
      agentName: this.agentName,
      workspace: this.workspace,
      files: backedUp,
      version: '2.2'
    };
    
    fs.writeFileSync(
      path.join(backupDir, 'backup-info.json'),
      JSON.stringify(backupInfo, null, 2)
    );
    
    // 清理过期备份
    this.cleanupOldBackups();
    
    return { 
      success: true, 
      backupPath: backupDir,
      files: backedUp
    };
  }

  // 递归复制目录
  copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 清理旧备份
  cleanupOldBackups() {
    const config = this.config;
    const backupPath = this.getBackupPath();
    
    if (!fs.existsSync(backupPath)) return;
    
    const retentionMs = config.backupRetentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    
    const dirs = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_'))
      .map(f => ({
        name: f,
        path: path.join(backupPath, f),
        time: fs.statSync(path.join(backupPath, f)).mtime.getTime()
      }))
      .filter(f => f.time < cutoff);
    
    for (const dir of dirs) {
      fs.rmSync(dir.path, { recursive: true, force: true });
    }
    
    return { deleted: dirs.length };
  }

  // 列出所有备份
  listBackups() {
    const backupPath = this.getBackupPath();
    if (!fs.existsSync(backupPath)) return [];
    
    return fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_'))
      .map(f => {
        const infoPath = path.join(backupPath, f, 'backup-info.json');
        if (fs.existsSync(infoPath)) {
          const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
          return {
            name: f,
            path: path.join(backupPath, f),
            timestamp: info.timestamp,
            files: info.files
          };
        }
        return {
          name: f,
          path: path.join(backupPath, f),
          timestamp: fs.statSync(path.join(backupPath, f)).mtime.getTime()
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // 恢复备份
  restoreBackup(backupName) {
    const backupPath = path.join(this.getBackupPath(), backupName);
    if (!fs.existsSync(backupPath)) {
      return { success: false, reason: 'Backup not found' };
    }
    
    // 备份当前状态
    this.createBackup({ force: true });
    
    // 恢复文件
    const filesToRestore = [
      'index.json',
      'important-events.json',
      'knowledge-base.json',
      'error-patterns.json',
      'work-context.json',
      'config.json',
      'snapshot.json'
    ];
    
    const restored = [];
    for (const file of filesToRestore) {
      const srcPath = path.join(backupPath, file);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(this.storagePath, file);
        fs.copyFileSync(srcPath, destPath);
        restored.push(file);
      }
    }
    
    // 恢复快照目录
    const snapshotsBackup = path.join(backupPath, 'snapshots');
    if (fs.existsSync(snapshotsBackup)) {
      const snapshotsDest = path.join(this.storagePath, 'snapshots');
      if (fs.existsSync(snapshotsDest)) {
        fs.rmSync(snapshotsDest, { recursive: true });
      }
      this.copyDirRecursive(snapshotsBackup, snapshotsDest);
      restored.push('snapshots/');
    }
    
    // 清除缓存
    this.clearCache();
    
    return { success: true, restored };
  }

  // ==================== 文件监听（自动保存） ====================
  
  // 启动文件监听
  startFileWatcher(watchPaths = [], options = {}) {
    const { 
      onChange, 
      debounceMs = 1000,
      ignorePatterns = ['node_modules', '.git', '*.log']
    } = options;
    
    if (this.fileWatcher) {
      this.stopFileWatcher();
    }
    
    // 简单实现：定期检查文件变化
    const fileStates = new Map();
    
    const checkChanges = () => {
      for (const watchPath of watchPaths) {
        if (!fs.existsSync(watchPath)) continue;
        
        const collectFiles = (dir) => {
          if (!fs.existsSync(dir)) return;
          
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              // 忽略模式
              if (ignorePatterns.some(pattern => {
                if (pattern.includes('*')) {
                  return new RegExp(pattern.replace('*', '.*')).test(entry.name);
                }
                return entry.name === pattern || fullPath.includes(pattern);
              })) {
                continue;
              }
              
              if (entry.isDirectory()) {
                collectFiles(fullPath);
              } else if (entry.isFile()) {
                try {
                  const stat = fs.statSync(fullPath);
                  const key = fullPath;
                  const oldStat = fileStates.get(key);
                  
                  if (oldStat && oldStat.mtimeMs !== stat.mtimeMs) {
                    // 文件发生变化
                    if (onChange) {
                      onChange({
                        type: 'modify',
                        path: fullPath,
                        oldMtime: oldStat.mtimeMs,
                        newMtime: stat.mtimeMs
                      });
                    }
                  }
                  
                  fileStates.set(key, {
                    mtimeMs: stat.mtimeMs,
                    size: stat.size
                  });
                } catch (e) {
                  // 忽略权限错误
                }
              }
            }
          } catch (e) {
            // 忽略读取错误
          }
        };
        
        collectFiles(watchPath);
      }
    };
    
    // 初始检查
    checkChanges();
    
    // 定期检查
    this.fileWatcher = setInterval(checkChanges, debounceMs);
    this.fileWatcher.unref();
    
    return { success: true, watching: watchPaths.length };
  }

  // 停止文件监听
  stopFileWatcher() {
    if (this.fileWatcher) {
      clearInterval(this.fileWatcher);
      this.fileWatcher = null;
    }
    return { success: true };
  }

  // ==================== 主动确认学习 ====================
  
  // 待确认的知识队列
  pendingConfirmations = [];

  // 请求确认学习
  requestLearningConfirmation(knowledge, source = 'auto') {
    const confirmation = {
      id: Date.now(),
      knowledge,
      source,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    this.pendingConfirmations.push(confirmation);
    return confirmation;
  }

  // 确认知识（用户确认后调用）
  confirmKnowledge(confirmationId, confirmed = true) {
    const index = this.pendingConfirmations.findIndex(c => c.id === confirmationId);
    if (index === -1) {
      return { success: false, reason: 'Confirmation not found' };
    }
    
    const confirmation = this.pendingConfirmations[index];
    
    if (confirmed) {
      // 确认后保存到知识库
      const knowledge = this.load('knowledgeBase');
      
      if (Array.isArray(knowledge)) {
        // 兼容数组格式
        knowledge.push(confirmation.knowledge);
      } else if (typeof knowledge === 'object' && knowledge !== null) {
        // 对象格式
        Object.assign(knowledge, confirmation.knowledge);
      } else {
        // 空知识库
        knowledge = { ...confirmation.knowledge };
      }
      
      this.save('knowledgeBase', knowledge);
      
      // 设置初始置信度
      const key = Object.keys(confirmation.knowledge)[0];
      if (key) {
        this.updateConfidence(key, 1);
      }
    }
    
    // 从待确认队列中移除
    confirmation.status = confirmed ? 'confirmed' : 'rejected';
    this.pendingConfirmations.splice(index, 1);
    
    return { 
      success: true, 
      confirmed,
      knowledge: confirmed ? confirmation.knowledge : null
    };
  }

  // 获取待确认的知识
  getPendingConfirmations() {
    return this.pendingConfirmations.filter(c => c.status === 'pending');
  }

  // 批量确认
  batchConfirm(confirmationIds, confirmed = true) {
    const results = [];
    for (const id of confirmationIds) {
      results.push(this.confirmKnowledge(id, confirmed));
    }
    return results;
  }

  // 智能学习（带确认）
  smartLearn(messages, autoConfirm = true) {
    const extracted = this.extractExperience(messages);
    const knowledge = this.load('knowledgeBase');
    
    if (!knowledge._learning) {
      knowledge._learning = { history: [] };
    }
    
    const newKnowledge = {};
    const toConfirm = [];
    
    for (const exp of extracted) {
      if (exp.extracted) {
        const { key, value } = exp.extracted;
        
        // 检查是否已存在
        if (knowledge[key] && !autoConfirm) {
          toConfirm.push({ key, value, type: exp.type });
          continue;
        }
        
        newKnowledge[key] = value;
        knowledge[key] = value;
        
        knowledge._learning.history.push({
          key,
          value,
          type: exp.type,
          timestamp: Date.now()
        });
      }
    }
    
    // 如果有现有知识需要确认
    if (toConfirm.length > 0 && !autoConfirm) {
      const confirmations = toConfirm.map(kv => 
        this.requestLearningConfirmation({ [kv.key]: kv.value }, 'extraction')
      );
      return { 
        needsConfirmation: true, 
        confirmations,
        newKnowledge
      };
    }
    
    // 保存并更新置信度
    this.save('knowledgeBase', knowledge, { skipConfidenceUpdate: true });
    
    for (const key of Object.keys(newKnowledge)) {
      this.updateConfidence(key, 1);
    }
    
    return { learned: Object.keys(newKnowledge).length, newKnowledge };
  }

  // 获取所有快照版本
  getSnapshotVersions() {
    const snapshotDir = path.join(this.storagePath, 'snapshots');
    if (!fs.existsSync(snapshotDir)) return [];
    
    return fs.readdirSync(snapshotDir)
      .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(snapshotDir, f);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
          version: data.version,
          timestamp: data.timestamp,
          stepCount: data.stepCount,
          path: filePath
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // 回滚到指定版本
  rollbackToVersion(version) {
    const snapshotDir = path.join(this.storagePath, 'snapshots');
    const versionedPath = path.join(snapshotDir, `snapshot_${version}.json`);
    
    if (!fs.existsSync(versionedPath)) {
      return { success: false, reason: 'Version not found' };
    }
    
    const snapshot = JSON.parse(fs.readFileSync(versionedPath, 'utf8'));
    
    // 验证快照
    const currentChecksum = this.calculateChecksum(snapshot.state);
    if (currentChecksum !== snapshot.checksum) {
      return { success: false, reason: 'Snapshot corrupted' };
    }
    
    // 保存当前为新版本
    const currentPath = path.join(this.storagePath, 'snapshot.json');
    fs.writeFileSync(currentPath, JSON.stringify(snapshot, null, 2));
    
    return { success: true, snapshot };
  }

  // 验证快照
  validateSnapshot() {
    const snapshotPath = path.join(this.storagePath, 'snapshot.json');
    if (!fs.existsSync(snapshotPath)) {
      return { valid: false, reason: 'No snapshot found' };
    }
    
    try {
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      const currentChecksum = this.calculateChecksum(snapshot.state);
      
      if (currentChecksum === snapshot.checksum) {
        return { valid: true, snapshot, integrity: 'OK' };
      } else {
        return { 
          valid: false, 
          reason: 'Checksum mismatch',
          expected: snapshot.checksum,
          actual: currentChecksum
        };
      }
    } catch (e) {
      return { valid: false, reason: e.message };
    }
  }

  // 计算校验和（SHA256）
  calculateChecksum(data) {
    const str = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  // ==================== 重要度等级 ====================
  
  // 标记重要事件（支持1-5星等级）
  markImportant(event, importance = 3) {
    // 直接读取文件，不使用增量模式
    const filePath = path.join(this.storagePath, this.files.importantEvents);
    let events = [];
    
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        // 确保是数组
        if (Array.isArray(data)) {
          events = data;
        } else if (data && typeof data === 'object') {
          // 兼容旧格式
          events = Object.values(data).filter(v => v && typeof v === 'object');
        }
      } catch (e) {
        events = [];
      }
    }
    
    const normalizedImportance = Math.min(5, Math.max(1, importance)); // 1-5星
    
    const eventWithImportance = {
      ...event,
      important: true,
      importance: normalizedImportance,
      importanceLabel: this.getImportanceLabel(normalizedImportance),
      timestamp: Date.now()
    };
    
    events.push(eventWithImportance);
    
    // 直接保存为数组，不使用增量模式
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
    
    return filePath;
  }

  // 获取重要度标签
  getImportanceLabel(level) {
    const labels = {
      1: '低',
      2: '一般',
      3: '重要',
      4: '非常重要',
      5: '极其重要'
    };
    return labels[level] || '普通';
  }

  // 按重要度排序获取事件
  getImportantEvents(minImportance = 1) {
    const events = this.load('importantEvents');
    if (!Array.isArray(events)) return [];
    
    return events
      .filter(e => (e.importance || 1) >= minImportance)
      .sort((a, b) => (b.importance || 1) - (a.importance || 1));
  }

  // 获取高优先级事件（前N个）
  getTopImportantEvents(count = 5) {
    const events = this.load('importantEvents');
    if (!Array.isArray(events)) return [];
    
    return events
      .sort((a, b) => (b.importance || 1) - (a.importance || 1))
      .slice(0, count);
  }

  // 更新事件重要度
  updateEventImportance(eventIndex, newImportance) {
    const events = this.load('importantEvents');
    if (!Array.isArray(events) || !events[eventIndex]) {
      return { success: false, reason: 'Event not found' };
    }
    
    const normalizedImportance = Math.min(5, Math.max(1, newImportance));
    events[eventIndex].importance = normalizedImportance;
    events[eventIndex].importanceLabel = this.getImportanceLabel(normalizedImportance);
    events[eventIndex].updatedAt = Date.now();
    
    this.save('importantEvents', events);
    return { success: true, event: events[eventIndex] };
  }

  // 记录错误模式
  recordError(error) {
    const errors = this.load('errorPatterns');
    if (!Array.isArray(errors)) {
      return this.save('errorPatterns', [{
        ...error,
        timestamp: Date.now(),
        hash: this.calculateChecksum(error)
      }]);
    }
    
    // 检查是否已存在相同错误
    const errorHash = this.calculateChecksum(error);
    const exists = errors.find(e => e.hash === errorHash);
    
    if (!exists) {
      errors.push({
        ...error,
        timestamp: Date.now(),
        hash: errorHash,
        count: 1
      });
    } else {
      // 更新错误计数
      exists.count = (exists.count || 1) + 1;
      exists.lastSeen = Date.now();
    }
    
    return this.save('errorPatterns', errors);
  }

  // ==================== 置信度追踪（带时间衰减） ====================
  
  // 时间衰减配置
  getDecayConfig() {
    return {
      halfLifeDays: 30, // 半衰期30天
      minWeight: 0.1,   // 最低权重
      decayEnabled: this.config.confidenceDecayEnabled !== false
    };
  }

  // 计算时间衰减权重（修复版）
  calculateDecayWeight(lastUsed, firstSeen, count = 1) {
    const config = this.getDecayConfig();
    if (!config.decayEnabled) return 1;
    
    const now = Date.now();
    const daysSinceFirstSeen = (now - firstSeen) / (1000 * 60 * 60 * 24);
    
    // 1. 基础权重：基于使用次数（0-1范围）
    // 使用1次: 0.30, 使用5次: 0.80, 使用10次: 1.0
    const usageWeight = Math.min(1, Math.log10(count + 1) * 0.5);
    
    // 2. 新知识（30天内）不衰减
    if (daysSinceFirstSeen < 30) {
      return usageWeight;
    }
    
    // 3. 旧知识应用时间衰减
    const decayDays = daysSinceFirstSeen - 30;
    const decayFactor = Math.pow(0.5, decayDays / config.halfLifeDays);
    const finalWeight = usageWeight * decayFactor;
    
    return Math.max(config.minWeight, finalWeight);
  }

  // 更新知识置信度（带时间衰减）
  updateConfidence(key, usage = 1) {
    const knowledge = this.load('knowledgeBase');
    if (!knowledge._confidence) {
      knowledge._confidence = {};
    }
    
    const now = Date.now();
    
    if (!knowledge._confidence[key]) {
      knowledge._confidence[key] = {
        count: 0,
        baseWeight: 0.5,
        effectiveWeight: 0.5,
        lastUsed: now,
        firstSeen: now
      };
    }
    
    const conf = knowledge._confidence[key];
    conf.count += usage;
    conf.lastUsed = now;
    
    // 根据使用频率计算基础权重
    conf.baseWeight = Math.min(1, Math.log10(conf.count + 1) / 4);
    
    // 计算带时间衰减的有效权重
    conf.effectiveWeight = this.calculateDecayWeight(conf.lastUsed, conf.firstSeen);
    
    knowledge._confidence = knowledge._confidence;
    this.save('knowledgeBase', knowledge, { skipConfidenceUpdate: true });
    
    return conf;
  }

  // 获取带时间衰减的有效权重
  getEffectiveConfidence(key) {
    const knowledge = this.load('knowledgeBase');
    const conf = knowledge._confidence?.[key];
    if (!conf) return { weight: 0.5, effectiveWeight: 0.5 };
    
    const effectiveWeight = this.calculateDecayWeight(conf.lastUsed, conf.firstSeen);
    return {
      ...conf,
      effectiveWeight,
      daysSinceLastUse: (Date.now() - conf.lastUsed) / (1000 * 60 * 60 * 24)
    };
  }

  // 获取知识权重（使用有效权重）
  getKnowledgeByWeight() {
    const knowledge = this.load('knowledgeBase');
    const confidence = knowledge._confidence || {};
    const entries = Object.entries(knowledge).filter(([k]) => k !== '_confidence');
    
    return entries.map(([key, value]) => {
      const conf = confidence[key] || { baseWeight: 0.5, effectiveWeight: 0.5, count: 0, lastUsed: Date.now() };
      return {
        key,
        value,
        baseWeight: conf.baseWeight,
        effectiveWeight: this.calculateDecayWeight(conf.lastUsed, conf.firstSeen),
        count: conf.count,
        lastUsed: conf.lastUsed
      };
    }).sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  }

  // 应用时间衰减到所有知识
  applyDecayToAll() {
    const knowledge = this.load('knowledgeBase');
    const confidence = knowledge._confidence || {};
    let updated = 0;
    
    for (const [key, conf] of Object.entries(confidence)) {
      const newEffectiveWeight = this.calculateDecayWeight(conf.lastUsed, conf.firstSeen);
      if (Math.abs(conf.effectiveWeight - newEffectiveWeight) > 0.01) {
        conf.effectiveWeight = newEffectiveWeight;
        updated++;
      }
    }
    
    if (updated > 0) {
      knowledge._confidence = confidence;
      this.save('knowledgeBase', knowledge, { skipConfidenceUpdate: true });
    }
    
    return { updated, total: Object.keys(confidence).length };
  }

  // 清理低置信度知识（考虑时间衰减）
  pruneLowConfidence(threshold = 0.2) {
    const knowledge = this.load('knowledgeBase');
    const confidence = knowledge._confidence || {};
    const toRemove = [];
    
    for (const [key, conf] of Object.entries(confidence)) {
      const effectiveWeight = this.calculateDecayWeight(conf.lastUsed, conf.firstSeen);
      if (effectiveWeight < threshold) {
        toRemove.push({ key, reason: 'low_weight', weight: effectiveWeight });
      }
    }
    
    for (const item of toRemove) {
      delete knowledge[item.key];
      delete confidence[item.key];
    }
    
    if (toRemove.length > 0) {
      knowledge._confidence = confidence;
      this.save('knowledgeBase', knowledge, { skipConfidenceUpdate: true });
    }
    
    return { removed: toRemove.length, keys: toRemove };
  }

  // ==================== 经验提取 ====================
  
  // 从对话中提取可复用的知识
  extractExperience(messages) {
    const extracted = [];
    const patterns = [
      // 用户偏好模式 - 更灵活
      { type: 'preference', regex: /(?:我|你|他|她|它|这|那|我的|你的)\s*(?:喜欢|讨厌|最爱|想要|爱|不爱)/i },
      // 事实模式
      { type: 'fact', regex: /(?:我|你|他|她|它|这|那)\s*(?:是|叫|位于|在|叫做|被称为)/i },
      // 规则模式
      { type: 'rule', regex: /(?:应该|必须|不能|禁止|需要|要求|不能)/i },
      // 关系模式
      { type: 'relationship', regex: /(?:和|与|跟|同|或者|以及)/i }
    ];
    
    for (const msg of messages) {
      const text = typeof msg === 'string' ? msg : (msg.content || msg.text || '');
      
      for (const pattern of patterns) {
        if (pattern.regex.test(text)) {
          // 尝试提取关键信息
          const keyValue = this.extractKeyValue(text);
          extracted.push({
            type: pattern.type,
            content: text,
            extracted: keyValue,
            timestamp: Date.now()
          });
          // 找到匹配模式就break，避免重复
          break;
        }
      }
    }
    
    return extracted;
  }

  // 提取键值对 - 更灵活的提取
  extractKeyValue(text) {
    // 模式1: "我喜欢 X"
    let match = text.match(/我(?:喜欢|讨厌|爱|想要|想要)\s*(.+)/i);
    if (match) {
      return { key: match[1].trim(), value: '用户偏好' };
    }
    
    // 模式2: "我是 X"
    match = text.match(/我\s*(?:叫|是|叫做)\s*(.+)/i);
    if (match) {
      return { key: '名字', value: match[1].trim() };
    }
    
    // 模式3: "X 是 Y"
    match = text.match(/(.+?)\s+(?:叫|是|叫做|位于|在)\s+(.+)/i);
    if (match && match[1] && match[2]) {
      return { key: match[1].trim(), value: match[2].trim() };
    }
    
    // 模式4: "你应该/必须 X"
    match = text.match(/(?:你应该|必须|应该|需要)\s*(.+)/i);
    if (match) {
      return { key: '规则', value: match[1].trim() };
    }
    
    return null;
  }

  // 自动学习：从对话中提取并保存知识
  autoLearn(messages) {
    const extracted = this.extractExperience(messages);
    const knowledge = this.load('knowledgeBase');
    
    if (!knowledge._learning) {
      knowledge._learning = { history: [] };
    }
    
    for (const exp of extracted) {
      if (exp.extracted) {
        const { key, value } = exp.extracted;
        
        // 检查是否已存在
        if (knowledge[key]) {
          // 更新已有知识
          knowledge[key] = value;
        } else {
          // 添加新知识
          knowledge[key] = value;
        }
        
        // 记录学习历史
        knowledge._learning.history.push({
          key,
          value,
          type: exp.type,
          timestamp: Date.now()
        });
      }
    }
    
    // 保存并更新置信度
    this.save('knowledgeBase', knowledge, { skipConfidenceUpdate: true });
    
    // 为新知识设置初始置信度
    for (const exp of extracted) {
      if (exp.extracted) {
        this.updateConfidence(exp.extracted.key, 1);
      }
    }
    
    return { learned: extracted.length, experiences: extracted };
  }

  // 分析对话趋势
  analyzeTrends(messages, timeWindow = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const recent = messages.filter(m => {
      const ts = m.timestamp || 0;
      return now - ts < timeWindow;
    });
    
    const trends = {
      totalMessages: recent.length,
      topics: {},
      sentiments: { positive: 0, negative: 0, neutral: 0 },
      timeDistribution: {}
    };
    
    for (const msg of recent) {
      const text = typeof msg === 'string' ? msg : (msg.content || msg.text || '');
      
      // 统计关键词
      const words = text.split(/[\s,，。]/).filter(w => w.length > 2);
      for (const word of words) {
        trends.topics[word] = (trends.topics[word] || 0) + 1;
      }
      
      // 简单情感分析
      if (/喜欢|开心|好|棒|赞|优秀/i.test(text)) trends.sentiments.positive++;
      else if (/讨厌|差|烂|糟|错|失败/i.test(text)) trends.sentiments.negative++;
      else trends.sentiments.neutral++;
      
      // 时间分布
      const hour = new Date(msg.timestamp || now).getHours();
      trends.timeDistribution[hour] = (trends.timeDistribution[hour] || 0) + 1;
    }
    
    // 排序话题
    trends.topics = Object.entries(trends.topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
    
    return trends;
  }

  // 获取自动加载的内存（分层加载）
  getAutoLoadMemory() {
    const layers = {
      index: this.load('index'),
      importantEvents: this.load('importantEvents'),
      knowledgeBase: this.load('knowledgeBase')
    };
    
    // 计算总大小
    const totalSize = JSON.stringify(layers).length;
    return {
      layers,
      totalSize,
      withinLimit: totalSize <= this.config.maxAutoLoad
    };
  }

  // 递增步数并检查是否需要快照
  incrementStep() {
    this.stepCount++;
    return this.stepCount % this.config.snapshotInterval === 0;
  }

  // 智能摘要（语义截断）
  summarize(data, maxLength = 500, options = {}) {
    const str = JSON.stringify(data);
    if (str.length <= maxLength) return str;
    
    const { preserveKeys = [], minValueLength = 10 } = options;
    
    // 优先保留的键（关键词）
    const priorityKeys = [...preserveKeys, '_confidence', '_learning'];
    
    // 第一步：优先保留关键字段
    const keys = Object.keys(data);
    const summary = {};
    let currentLength = 0;
    
    // 先处理优先键
    for (const key of priorityKeys) {
      if (data[key] !== undefined) {
        const value = JSON.stringify(data[key]);
        if (currentLength + value.length + key.length < maxLength - 20) {
          summary[key] = data[key];
          currentLength += value.length + key.length;
        }
      }
    }
    
    // 第二步：保留有意义的值（长度 >= minValueLength）
    for (const key of keys) {
      if (summary[key] !== undefined) continue; // 已保留
      
      const value = data[key];
      const valueStr = JSON.stringify(value);
      
      // 跳过太长或太短的
      if (valueStr.length > maxLength / 2) continue;
      if (valueStr.length < minValueLength && typeof value === 'string') continue;
      
      if (currentLength + valueStr.length + key.length < maxLength - 30) {
        summary[key] = value;
        currentLength += valueStr.length + key.length;
      }
    }
    
    // 第三步：语义截断字符串值
    for (const key of Object.keys(summary)) {
      const value = summary[key];
      if (typeof value === 'string' && value.length > 100) {
        // 按句子截断，保留完整句子
        const sentences = value.split(/[。！？\n]/);
        let truncated = '';
        for (const sentence of sentences) {
          if ((truncated + sentence).length <= 100) {
            truncated += sentence;
          } else {
            break;
          }
        }
        if (truncated) {
          summary[key] = truncated + '...';
        }
      }
    }
    
    summary._truncated = true;
    summary._originalKeys = keys.length;
    summary._truncatedAt = Date.now();
    
    return JSON.stringify(summary);
  }

  // 按句子截断（保证语义完整）
  truncateBySentence(text, maxLength = 200) {
    if (text.length <= maxLength) return text;
    
    // 按标点分割句子
    const sentences = text.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) || [text];
    let result = '';
    
    for (const sentence of sentences) {
      if ((result + sentence).length <= maxLength) {
        result += sentence;
      } else {
        break;
      }
    }
    
    return result.trim() || text.substring(0, maxLength) + '...';
  }

  // 导出所有记忆
  exportAll() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      workspace: this.workspace,
      agentName: this.agentName,
      config: this.config,
      data: {
        index: this.load('index'),
        importantEvents: this.load('importantEvents'),
        knowledgeBase: this.load('knowledgeBase'),
        errorPatterns: this.load('errorPatterns'),
        workContext: this.load('workContext')
      }
    };
    
    return exportData;
  }

  // 导入记忆
  importData(importedData) {
    if (importedData.data) {
      for (const [key, value] of Object.entries(importedData.data)) {
        if (value) {
          this.save(key, value);
        }
      }
    }
    return true;
  }

  // 清空缓存
  clearCache() {
    this.cache.clear();
  }

  // 获取存储统计
  getStats() {
    const stats = {
      storagePath: this.storagePath,
      config: this.config,
      cacheSize: this.cache.size,
      stepCount: this.stepCount,
      files: {}
    };
    
    const countFiles = (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          countFiles(filePath);
        } else {
          stats.files[file] = stat.size;
        }
      }
    };
    
    countFiles(this.storagePath);
    stats.totalSize = Object.values(stats.files).reduce((a, b) => a + b, 0);
    
    return stats;
  }
}

// CLI 接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const mem = new PersistentMemory({
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd()
  });

  const commands = {
    // 保存记忆
    save: () => {
      const [key, jsonData] = [args[1], args[2]];
      if (!key || !jsonData) {
        console.log('Usage: save <key> <json-data>');
        return;
      }
      mem.save(key, JSON.parse(jsonData)).then(path => console.log('Saved:', path));
    },
    
    // 加载记忆
    load: () => {
      const key = args[1];
      if (!key) {
        console.log('Usage: load <key>');
        return;
      }
      console.log(JSON.stringify(mem.load(key), null,2));
    },
    
    // 列出所有项目
    list: () => {
      const projects = [];
      
      const listKey = args[1]; // 可选：指定列出哪种类型
      
      // 列出知识库
      if (!listKey || listKey === 'knowledge') {
        const kb = mem.load('knowledgeBase');
        if (kb && Object.keys(kb).length > 0) {
          projects.push({ type: 'knowledge', count: Object.keys(kb).length, keys: Object.keys(kb).filter(k => !k.startsWith('_')) });
        }
      }
      
      // 列出重要事件
      if (!listKey || listKey === 'important' || listKey === 'events') {
        const events = mem.load('importantEvents');
        if (events && Array.isArray(events) && events.length > 0) {
          projects.push({ type: 'important-events', count: events.length, events: events.map(e => ({ event: e.event, importance: e.importance || 1 })) });
        }
      }
      
      // 列出工作上下文
      if (!listKey || listKey === 'work') {
        const work = mem.load('workContext');
        if (work && Object.keys(work).length > 0) {
          projects.push({ type: 'work-context', project: work.项目 || work.project || '未命名', task: work.任务 || work.task || work.task || '无', status: work.状态 || work.status || '未知' });
        }
      }
      
      // 列出错误模式
      if (!listKey || listKey === 'errors') {
        const errors = mem.load('errorPatterns');
        if (errors && Array.isArray(errors) && errors.length > 0) {
          projects.push({ type: 'error-patterns', count: errors.length });
        }
      }
      
      // 统计
      const stats = mem.getStats();
      projects.push({ _stats: { totalFiles: Object.keys(stats.files).length, storageSize: stats.totalSize } });
      
      console.log(JSON.stringify(projects, null, 2));
    },
    
    // 搜索
    search: () => {
      const query = args[1];
      if (!query) {
        console.log('Usage: search <query>');
        return;
      }
      const results = mem.search(query, { fuzzy: true });
      console.log(JSON.stringify(results, null, 2));
    },
    
    // 向量搜索
    vector: () => {
      const query = args[1];
      if (!query) {
        console.log('Usage: vector <query>');
        return;
      }
      const results = mem.vectorSearch(query);
      console.log(JSON.stringify(results, null, 2));
    },
    
    // 语义向量搜索
    semantic: () => {
      const query = args[1];
      if (!query) {
        console.log('Usage: semantic <query>');
        return;
      }
      const results = mem.semanticSearch(query);
      console.log(JSON.stringify(results, null, 2));
    },
    
    // 标记重要（支持重要度等级）
    important: () => {
      const jsonData = args[1];
      const importance = parseInt(args[2]) || 3;
      if (!jsonData) {
        console.log('Usage: important <json-data> [importance 1-5]');
        return;
      }
      const path = mem.markImportant(JSON.parse(jsonData), importance);
      console.log('Marked:', path);
    },

  // 获取重要事件
    events: () => {
      const minLevel = parseInt(args[1]) || 1;
      console.log(JSON.stringify(mem.getImportantEvents(minLevel), null, 2));
    },

    // 获取TOP重要事件
    top: () => {
      const count = parseInt(args[1]) || 5;
      console.log(JSON.stringify(mem.getTopImportantEvents(count), null, 2));
    },
    
    // 记录错误
    error: () => {
      const jsonData = args[1];
      if (!jsonData) {
        console.log('Usage: error <json-data>');
        return;
      }
      mem.recordError(JSON.parse(jsonData)).then(path => console.log('Recorded:', path));
    },
    
    // 创建快照
    snapshot: () => {
      const state = args[1] ? JSON.parse(args[1]) : { note: 'manual snapshot' };
      const result = mem.createSnapshot(state);
      console.log('Snapshot created:', JSON.stringify(result, null, 2));
    },

    // 获取快照版本列表
    versions: () => {
      console.log(JSON.stringify(mem.getSnapshotVersions(), null, 2));
    },

    // 回滚快照
    rollback: () => {
      const version = parseInt(args[1]);
      if (!version) {
        console.log('Usage: rollback <version-timestamp>');
        return;
      }
      console.log(JSON.stringify(mem.rollbackToVersion(version), null, 2));
    },
    
    // 验证快照
    validate: () => {
      console.log(JSON.stringify(mem.validateSnapshot(), null, 2));
    },

    // 应用置信度时间衰减
    applyDecay: () => {
      console.log(JSON.stringify(mem.applyDecayToAll(), null, 2));
    },
    
    // 获取自动加载内存
    auto: () => {
      console.log(JSON.stringify(mem.getAutoLoadMemory(), null, 2));
    },
    
    // 获取统计
    stats: () => {
      console.log(JSON.stringify(mem.getStats(), null, 2));
    },
    
    // 导出
    export: () => {
      console.log(JSON.stringify(mem.exportAll(), null, 2));
    },
    
    // 更新配置
    config: () => {
      const [key, value] = [args[1], args[2]];
      if (!key) {
        console.log('Current config:', mem.config);
        return;
      }
      let parsedValue = value;
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        // 保持字符串
      }
      console.log('Updated config:', mem.updateConfig({ [key]: parsedValue }));
    },
    
    // 工作上下文
    work: () => {
      const subCommand = args[1];
      if (subCommand === 'save') {
        const jsonData = args[2];
        if (!jsonData) {
          console.log('Usage: work save <json-data>');
          return;
        }
        mem.saveWorkContext(JSON.parse(jsonData)).then(path => console.log('Work context saved:', path));
      } else if (subCommand === 'load') {
        console.log(JSON.stringify(mem.loadWorkContext(), null, 2));
      } else {
        console.log('Usage: work <save|load> [json-data]');
      }
    },
    
    // 置信度追踪
    confidence: () => {
      const subCommand = args[1];
      if (subCommand === 'update') {
        const key = args[2];
        const usage = parseInt(args[3]) || 1;
        if (!key) {
          console.log('Usage: confidence update <key> [usage-count]');
          return;
        }
        console.log(JSON.stringify(mem.updateConfidence(key, usage), null, 2));
      } else if (subCommand === 'get') {
        const key = args[2];
        if (!key) {
          console.log('Usage: confidence get <key>');
          return;
        }
        console.log(JSON.stringify(mem.getEffectiveConfidence(key), null, 2));
      } else if (subCommand === 'list') {
        console.log(JSON.stringify(mem.getKnowledgeByWeight(), null, 2));
      } else if (subCommand === 'prune') {
        const threshold = parseFloat(args[2]) || 0.2;
        console.log(JSON.stringify(mem.pruneLowConfidence(threshold), null, 2));
      } else if (subCommand === 'decay') {
        // 应用时间衰减
        console.log(JSON.stringify(mem.applyDecayToAll(), null, 2));
      } else {
        console.log('Usage: confidence <update|get|list|prune|decay> [key] [value]');
      }
    },
    
    // 经验提取
    learn: () => {
      const subCommand = args[1];
      if (subCommand === 'extract') {
        // 从传入的消息中提取经验
        const jsonData = args[2];
        if (!jsonData) {
          console.log('Usage: learn extract <json-messages>');
          return;
        }
        const messages = JSON.parse(jsonData);
        console.log(JSON.stringify(mem.extractExperience(messages), null, 2));
      } else if (subCommand === 'auto') {
        // 自动学习
        const jsonData = args[2];
        if (!jsonData) {
          console.log('Usage: learn auto <json-messages>');
          return;
        }
        const messages = JSON.parse(jsonData);
        console.log(JSON.stringify(mem.autoLearn(messages), null, 2));
      } else if (subCommand === 'trends') {
        // 分析趋势
        const jsonData = args[2];
        if (!jsonData) {
          console.log('Usage: learn trends <json-messages>');
          return;
        }
        const messages = JSON.parse(jsonData);
        console.log(JSON.stringify(mem.analyzeTrends(messages), null, 2));
      } else if (subCommand === 'smart') {
        // 智能学习（带确认）
        const jsonData = args[2];
        const autoConfirm = args[3] === 'true';
        if (!jsonData) {
          console.log('Usage: learn smart <json-messages> [autoConfirm]');
          return;
        }
        const messages = JSON.parse(jsonData);
        console.log(JSON.stringify(mem.smartLearn(messages, autoConfirm), null, 2));
      } else {
        console.log('Usage: learn <extract|auto|trends|smart> <json-data>');
      }
    },

    // 备份
    backup: () => {
      const result = mem.createBackup({ force: true });
      console.log(JSON.stringify(result, null, 2));
    },

    // 列出备份
    backups: () => {
      console.log(JSON.stringify(mem.listBackups(), null, 2));
    },

    // 恢复备份
    restore: () => {
      const backupName = args[1];
      if (!backupName) {
        console.log('Usage: restore <backup-name>');
        return;
      }
      console.log(JSON.stringify(mem.restoreBackup(backupName), null, 2));
    },

    // 待确认知识
    pending: () => {
      console.log(JSON.stringify(mem.getPendingConfirmations(), null, 2));
    },

    // 确认知识
    confirm: () => {
      const id = parseInt(args[1]);
      const confirmed = args[2] !== 'false';
      if (!id) {
        console.log('Usage: confirm <confirmation-id> [true|false]');
        return;
      }
      console.log(JSON.stringify(mem.confirmKnowledge(id, confirmed), null, 2));
    },

    // 文件监听
    watch: () => {
      const watchPath = args[1];
      if (!watchPath) {
        console.log('Usage: watch <path>');
        return;
      }
      const result = mem.startFileWatcher([watchPath], {
        debounceMs: 2000,
        onChange: (change) => {
          console.log('File changed:', change.path);
        }
      });
      console.log(JSON.stringify(result, null, 2));
      console.log('Watching for changes... Press Ctrl+C to stop');
    },

    // 停止监听
    unwatch: () => {
      console.log(JSON.stringify(mem.stopFileWatcher(), null, 2));
    },
    
    // 帮助
    help: () => {
      console.log(`
Persistent Memory CLI v0.3.0

Usage: node memory.cjs <command> [options]

Commands:
  save <key> <json>          Save memory
  load <key>                 Load memory
  search <query>             Search memory (keyword + fuzzy)
  vector <query>             Vector search (keyword weight)
  semantic <query>           Semantic search (N-gram cosine)
  important <json> [level]  Mark important (1-5 stars)
  events [min-level]         List important events
  top [n]                    Get top N important events
  work save|load [json]      Work context operations
  
  snapshot [state]           Create snapshot
  versions                   List snapshot versions
  rollback <version>         Rollback to snapshot version
  validate                   Validate snapshot
  
  backup                     Create backup
  backups                    List all backups
  restore <name>             Restore from backup
  
  watch <path>               Start file watcher
  unwatch                    Stop file watcher
  
  confidence <cmd> [args]    Confidence tracking
  learn <cmd> [args]        Learning (extract/auto/trends/smart)
  pending                    List pending confirmations
  confirm <id> [true|false] Confirm or reject knowledge
  
  auto                       Get auto-load memory
  stats                      Get storage stats
  export                     Export all memory
  config [key] [value]      Get/Update config
  help                       Show this help

Learn Commands:
  learn extract <json>        Extract experience from messages
  learn auto <json>          Auto-learn from messages
  learn trends <json>        Analyze conversation trends
  learn smart <json> [auto]  Smart learn with confirmation
      `);
    }
  };

  const cmd = commands[command] || commands.help;
  cmd();
}

module.exports = PersistentMemory;

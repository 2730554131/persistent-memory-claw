/**
 * 自动安装依赖 - 从 package.json 读取所有依赖并自动安装
 */
const fs = require('fs');
const path = require('path');

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
      } catch (installError) {
        console.error(`Failed to install ${dep}`);
      }
    }
  }
}
ensureDependencies();

/**
 * 检查并自动保存会话 - 当上下文使用比例达到阈值时自动保存并重置
 * 
 * 使用方式：
 * node auto-save.cjs                    # 检查并提醒
 * node auto-save.cjs 0.8                # 指定阈值检查并提醒
 * node auto-save.cjs 0.8 --save-reset   # 检查并自动保存+重置新会话
 * 
 * threshold: 阈值比例 (0-1)，默认 0.8 (80%)
 * --save-reset: 达到阈值时自动保存会话并创建新会话
 */
const { execSync } = require('child_process');

async function getCurrentSessionInfo() {
  try {
    // 读取当前会话的 sessions 目录
    const sessionsDir = process.env.SESSIONS_DIR || path.join(process.env.HOME || '/root', '.openclaw', 'agents', 'lobster-development-assistant', 'sessions');
    
    if (!fs.existsSync(sessionsDir)) {
      return null;
    }
    
    // 获取最新的会话文件
    const files = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        mtime: fs.statSync(path.join(sessionsDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (files.length === 0) {
      return null;
    }
    
    const latestSession = files[0].name.replace('.jsonl', '');
    const sessionPath = path.join(sessionsDir, files[0].name);
    
    // 读取会话文件，累加所有 message 的 usage
    const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(l => l.trim());
    
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'message' && entry.message?.usage) {
          totalInputTokens += entry.message.usage.input || 0;
          totalOutputTokens += entry.message.usage.output || 0;
        }
      } catch (e) {
        // 跳过解析错误
      }
    }
    
    const totalTokens = totalInputTokens + totalOutputTokens;
    const contextWindow = 200000; // MiniMax M2.5 的上下文窗口
    const usageRatio = totalTokens / contextWindow;
    
    return {
      sessionId: latestSession,
      sessionPath,
      totalTokens,
      contextWindow,
      usageRatio,
      totalInputTokens,
      totalOutputTokens
    };
  } catch (e) {
    console.error('Error getting session info:', e.message);
    return null;
  }
}

function extractConversation(sessionPath) {
  const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(l => l.trim());
  
  const conversation = [];
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      if (entry.type !== 'message') continue;
      if (!entry.message?.role) continue;
      if (!['user', 'assistant'].includes(entry.message.role)) continue;
      
      // 提取文本内容
      let text = '';
      for (const content of entry.message.content || []) {
        if (content.type === 'text') {
          text += content.text + '\n';
        }
      }
      
      if (text.trim()) {
        conversation.push({
          role: entry.message.role,
          content: text.trim(),
          timestamp: entry.timestamp
        });
      }
    } catch (e) {
      // 跳过解析错误
    }
  }
  
  return conversation;
}

async function saveConversation(conversation, sessionId) {
  // 使用正确的路径加载 PersistentMemory
  const memoryCjsPath = path.join(__dirname, 'memory.cjs');
  const { PersistentMemory } = require(memoryCjsPath);
  
  const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
  const mem = new PersistentMemory({ workspace });
  
  try {
    await mem.init();
    
    // 获取会话时间范围
    let startTime = '';
    let endTime = '';
    if (conversation.length > 0) {
      if (conversation[0].timestamp) {
        startTime = new Date(conversation[0].timestamp).toLocaleString('zh-CN');
      }
      if (conversation[conversation.length - 1].timestamp) {
        endTime = new Date(conversation[conversation.length - 1].timestamp).toLocaleString('zh-CN');
      }
    }
    
    // 组装会话内容
    let fullText = `【会话记录 ${sessionId}】\n`;
    fullText += `时间: ${startTime} - ${endTime}\n\n`;
    
    for (const msg of conversation) {
      const roleLabel = msg.role === 'user' ? '👤 用户' : '🤖 助手';
      fullText += `${roleLabel}:\n${msg.content}\n\n`;
    }
    
    const id = await mem.save('conversation', fullText);
    return id;
  } finally {
    mem.close();
  }
}

async function resetSession(sessionInfo) {
  try {
    // 使用文件重命名方式触发新会话
    // 将当前会话文件重命名为 .reset.* 格式，Gateway 会自动创建新会话
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resetFilePath = sessionInfo.sessionPath + `.archived.${timestamp}`;
    
    console.log(`\n🔄 Resetting session...`);
    console.log(`   Old: ${path.basename(sessionInfo.sessionPath)}`);
    console.log(`   New: ${path.basename(resetFilePath)}`);
    
    // 重命名会话文件（归档而非删除）
    fs.renameSync(sessionInfo.sessionPath, resetFilePath);
    
    // 同时删除 lock 文件（如果存在）
    const lockFile = sessionInfo.sessionPath + '.lock';
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
    
    console.log('✅ Session archived, new session will be created on next message');
    return resetFilePath;
    
  } catch (e) {
    console.error('Error resetting session:', e.message);
    return null;
  }
}

async function getSessionStats(sessionInfo) {
  // 获取会话详细统计信息
  const lines = fs.readFileSync(sessionInfo.sessionPath, 'utf8').split('\n').filter(l => l.trim());
  
  let userMessages = 0;
  let assistantMessages = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      if (entry.type === 'message' && entry.message?.role) {
        if (entry.message.role === 'user') {
          userMessages++;
        } else if (entry.message.role === 'assistant') {
          assistantMessages++;
        }
        
        if (entry.message.usage) {
          totalInputTokens += entry.message.usage.input || 0;
          totalOutputTokens += entry.message.usage.output || 0;
        }
        
        if (entry.timestamp) {
          if (!firstTimestamp) firstTimestamp = entry.timestamp;
          lastTimestamp = entry.timestamp;
        }
      }
    } catch (e) {
      // 跳过解析错误
    }
  }
  
  return {
    sessionId: sessionInfo.sessionId,
    totalTokens: totalInputTokens + totalOutputTokens,
    contextWindow: sessionInfo.contextWindow,
    usageRatio: (totalInputTokens + totalOutputTokens) / sessionInfo.contextWindow,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    userMessages,
    assistantMessages,
    totalMessages: userMessages + assistantMessages,
    firstTimestamp,
    lastTimestamp
  };
}

/**
 * 自动保存并重置会话
 * 在 OpenClaw 压缩前保存当前会话，然后创建新会话
 */
async function autoSaveAndReset(threshold = 0.8) {
  console.log(`🔍 Auto-save and reset mode (threshold: ${threshold * 100}%)...`);
  
  const sessionInfo = await getCurrentSessionInfo();
  
  if (!sessionInfo) {
    console.log('❌ No active session found');
    return {
      success: false,
      error: 'No active session found'
    };
  }
  
  // 获取详细统计
  const stats = await getSessionStats(sessionInfo);
  
  console.log(`📊 Session: ${sessionInfo.sessionId}`);
  console.log(`   Tokens: ${stats.totalTokens} / ${stats.contextWindow} (${(stats.usageRatio * 100).toFixed(1)}%)`);
  console.log(`   Messages: ${stats.totalMessages} (User: ${stats.userMessages}, Assistant: ${stats.assistantMessages})`);
  
  // 检查是否达到阈值
  if (stats.usageRatio < threshold) {
    console.log('✅ Context usage below threshold, no action needed');
    return {
      success: true,
      action: 'none',
      usageRatio: stats.usageRatio,
      stats: stats
    };
  }
  
  console.log('\n⚠️  Context usage above threshold!');
  console.log('💾 Saving conversation to memory...');
  
  // 1. 提取会话内容
  const conversation = extractConversation(sessionInfo.sessionPath);
  
  if (conversation.length === 0) {
    console.log('⚠️  No conversation content to save');
  } else {
    // 2. 保存会话到记忆系统
    const memoryId = await saveConversation(conversation, sessionInfo.sessionId);
    console.log(`✅ Conversation saved to memory (id: ${memoryId})`);
  }
  
  // 3. 重置会话，创建新会话
  console.log('🔄 Creating new session...');
  const archivedPath = await resetSession(sessionInfo);
  
  if (archivedPath) {
    console.log('✅ New session created successfully!');
    
    return {
      success: true,
      action: 'saved_and_reset',
      memoryId: conversation.length > 0 ? await saveConversation(conversation, sessionInfo.sessionId).catch(() => null) : null,
      archivedPath: archivedPath,
      stats: stats,
      message: `会话已保存并创建新会话。记忆 ID: ${conversation.length > 0 ? '已保存' : '无内容可保存'}`
    };
  } else {
    return {
      success: false,
      error: 'Failed to reset session'
    };
  }
}

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  let threshold = 0.8;
  let autoSaveReset = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--save-reset' || args[i] === '-s') {
      autoSaveReset = true;
    } else if (!isNaN(parseFloat(args[i]))) {
      threshold = parseFloat(args[i]);
    }
  }
  
  // 如果是自动保存+重置模式
  if (autoSaveReset) {
    return await autoSaveAndReset(threshold);
  }
  
  // 原有模式：检查并提醒
  console.log(`🔍 Checking session context usage (threshold: ${threshold * 100}%)...`);
  
  const sessionInfo = await getCurrentSessionInfo();
  
  if (!sessionInfo) {
    console.log('❌ No active session found');
    process.exit(0);
  }
  
  // 获取详细统计
  const stats = await getSessionStats(sessionInfo);
  
  console.log(`📊 Session: ${sessionInfo.sessionId}`);
  console.log(`   Tokens: ${stats.totalTokens} / ${stats.contextWindow} (${(stats.usageRatio * 100).toFixed(1)}%)`);
  console.log(`   Messages: ${stats.totalMessages} (User: ${stats.userMessages}, Assistant: ${stats.assistantMessages})`);
  
  if (stats.usageRatio >= threshold) {
    console.log('\n⚠️  Context usage above threshold!');
    
    // 构建提醒消息
    const warningMessage = `
⚠️ **会话上下文已达到 ${(stats.usageRatio * 100).toFixed(1)}%**

**会话统计：**
- 总 tokens: ${stats.totalTokens} / ${stats.contextWindow}
- 输入 tokens: ${stats.inputTokens}
- 输出 tokens: ${stats.outputTokens}
- 消息数: ${stats.totalMessages} (用户: ${stats.userMessages}, AI: ${stats.assistantMessages})

**建议：**
- 输入 /new 创建新会话
- 或运行: node auto-save.cjs ${threshold} --save-reset 自动保存并创建新会话
`;
    
    console.log(warningMessage);
    
    return {
      saved: false,
      warning: true,
      shouldNotify: true,
      stats: stats,
      message: warningMessage
    };
  } else {
    console.log('✅ Context usage below threshold, no action needed');
    return {
      saved: false,
      usageRatio: stats.usageRatio,
      stats: stats
    };
  }
}

// 导出供 action 调用
module.exports = { 
  main, 
  autoSaveAndReset,
  getCurrentSessionInfo, 
  extractConversation, 
  saveConversation, 
  resetSession,
  getSessionStats 
};

// CLI 入口
if (require.main === module) {
  main().then(result => {
    console.log('\n' + JSON.stringify(result, null, 2));
    if (result.action === 'saved_and_reset') {
      process.exit(0); // Success
    } else if (result.warning) {
      process.exit(10); // Warning - threshold reached
    }
  }).catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
}

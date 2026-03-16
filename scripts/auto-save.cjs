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
 * node auto-save.cjs [threshold]
 * 
 * threshold: 阈值比例 (0-1)，默认 0.8 (80%)
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
    
    // 组装会话内容
    let fullText = `【会话记录 ${sessionId}】\n\n`;
    for (const msg of conversation) {
      const roleLabel = msg.role === 'user' ? '用户' : '助手';
      fullText += `${roleLabel}: ${msg.content}\n\n`;
    }
    
    const id = await mem.save('conversation', fullText);
    return id;
  } finally {
    mem.close();
  }
}

async function resetSession(sessionInfo) {
  try {
    // 先尝试通过 openclaw agent 发送 /new 命令
    const sessionsDir = path.dirname(sessionInfo.sessionPath);
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    let deliveryContext = null;
    
    try {
      const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf8'));
      for (const [key, value] of Object.entries(sessionsJson)) {
        if (value.sessionFile && value.sessionFile.includes(sessionInfo.sessionId)) {
          deliveryContext = value.deliveryContext;
          break;
        }
      }
    } catch (e) {
      console.log('Could not read sessions.json:', e.message);
    }
    
    if (deliveryContext) {
      const channel = deliveryContext.channel || 'feishu';
      let to = deliveryContext.to || '';
      to = to.replace(/^(user:|channel:)/, '');
      
      console.log(`\n🔄 Creating new session...`);
      console.log(`   Channel: ${channel}, To: ${to}`);
      
      const { execSync } = require('child_process');
      try {
        // 发送 /new 命令，这会创建一个新的会话
        execSync(`openclaw agent --channel ${channel} --to "${to}" --message "/new"`, {
          stdio: 'inherit',
          timeout: 30000
        });
        console.log('✅ New session created successfully');
        return true;
      } catch (e) {
        console.log('CLI method failed:', e.message);
      }
    }
    
    // 如果 CLI 方法失败，使用文件重命名方式
    console.log('   Falling back to file-based reset...');
    const resetFilePath = sessionInfo.sessionPath + `.reset.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(sessionInfo.sessionPath, resetFilePath);
    console.log('✅ Session file renamed, new session will be created on next message');
    return true;
    
  } catch (e) {
    console.error('Error resetting session:', e.message);
    return false;
  }
}

async function main() {
  const threshold = parseFloat(process.argv[2]) || 0.8;
  const autoReset = process.argv.includes('--reset') || process.env.AUTO_RESET_SESSION === 'true';
  
  console.log(`🔍 Checking session context usage (threshold: ${threshold * 100}%)...`);
  
  const sessionInfo = await getCurrentSessionInfo();
  
  if (!sessionInfo) {
    console.log('❌ No active session found');
    process.exit(0);
  }
  
  console.log(`📊 Session: ${sessionInfo.sessionId}`);
  console.log(`   Tokens: ${sessionInfo.totalTokens} / ${sessionInfo.contextWindow} (${(sessionInfo.usageRatio * 100).toFixed(1)}%)`);
  
  if (sessionInfo.usageRatio >= threshold) {
    console.log('\n⚠️  Context usage above threshold! Saving conversation...');
    
    // 提取对话
    const conversation = extractConversation(sessionInfo.sessionPath);
    console.log(`📝 Extracted ${conversation.length} messages`);
    
    // 保存对话
    const savedId = await saveConversation(conversation, sessionInfo.sessionId);
    console.log(`✅ Conversation saved (ID: ${savedId})`);
    
    // 如果需要自动重置
    let resetSuccess = false;
    if (autoReset) {
      resetSuccess = await resetSession(sessionInfo);
    } else {
      console.log('\n🔄 To reset session, send /reset command to the session');
      console.log('   (Or use --reset flag to auto-reset)');
    }
    
    return {
      saved: true,
      sessionId: sessionInfo.sessionId,
      messageCount: conversation.length,
      savedId,
      shouldReset: true,
      resetSuccess
    };
  } else {
    console.log('✅ Context usage below threshold, no action needed');
    return {
      saved: false,
      usageRatio: sessionInfo.usageRatio
    };
  }
}

// 导出供 action 调用
module.exports = { main, getCurrentSessionInfo, extractConversation, saveConversation, resetSession };

// CLI 入口
if (require.main === module) {
  main().then(result => {
    console.log('\n' + JSON.stringify(result, null, 2));
    if (result.shouldReset) {
      process.exit(10); // Exit code 10 indicates reset needed
    }
  }).catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
}

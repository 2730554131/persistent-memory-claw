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
 * 保存会话并新建会话 action
 * 当上下文使用比例达到阈值时，保存当前会话到记忆并触发 /new 创建新会话
 */
const { execSync } = require('child_process');

async function getCurrentSessionInfo() {
  try {
    const sessionsDir = process.env.SESSIONS_DIR || 
      path.join(process.env.HOME || '/root', '.openclaw', 'agents', 'lobster-development-assistant', 'sessions');
    
    if (!fs.existsSync(sessionsDir)) {
      return null;
    }
    
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
        // skip
      }
    }
    
    const totalTokens = totalInputTokens + totalOutputTokens;
    const contextWindow = 200000;
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
      // skip
    }
  }
  
  return conversation;
}

async function saveConversation(conversation, sessionId) {
  const memoryCjsPath = path.join(__dirname, '..', 'scripts', 'memory.cjs');
  const { PersistentMemory } = require(memoryCjsPath);
  
  const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
  const mem = new PersistentMemory({ workspace });
  
  try {
    await mem.init();
    
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

async function triggerNewSession() {
  try {
    // 通过发送 /new 命令触发新会话
    // 使用 openclaw CLI 或直接操作 sessions.json
    const sessionsDir = process.env.SESSIONS_DIR || 
      path.join(process.env.HOME || '/root', '.openclaw', 'agents', 'lobster-development-assistant', 'sessions');
    
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    
    if (fs.existsSync(sessionsJsonPath)) {
      const sessionsData = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf8'));
      const agentKey = 'agent:lobster-development-assistant:direct';
      
      // 生成新的 sessionId
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      if (sessionsData[agentKey]) {
        // 归档旧会话
        const oldSessionId = sessionsData[agentKey].sessionId;
        const oldSessionPath = path.join(sessionsDir, `${oldSessionId}.jsonl`);
        
        if (fs.existsSync(oldSessionPath)) {
          const archivedPath = oldSessionPath + `.archived.${new Date().toISOString().replace(/[:.]/g, '-')}`;
          fs.renameSync(oldSessionPath, archivedPath);
        }
        
        // 更新 sessions.json
        sessionsData[agentKey].sessionId = newSessionId;
        sessionsData[agentKey].updatedAt = Date.now();
        fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2));
        
        return { success: true, newSessionId, oldSessionId };
      }
    }
    
    return { success: false, error: 'No session found to reset' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: 'persistent_memory_save_and_reset',
  description: '保存当前会话到记忆并创建新会话。当上下文使用比例达到阈值时，保存会话并触发 /new 创建全新会话',
  parameters: {
    type: 'object',
    properties: {
      threshold: {
        type: 'number',
        default: 0.8,
        description: '触发自动保存的上下文使用比例阈值 (0-1)，默认 0.8 (80%)'
      }
    }
  },
  async run(params) {
    const { threshold = 0.8 } = params;
    
    try {
      // 1. 获取当前会话信息
      const sessionInfo = await getCurrentSessionInfo();
      
      if (!sessionInfo) {
        return {
          success: false,
          error: 'No active session found'
        };
      }
      
      // 2. 检查是否达到阈值
      if (sessionInfo.usageRatio < threshold) {
        return {
          success: true,
          action: 'none',
          message: `上下文使用率 ${(sessionInfo.usageRatio * 100).toFixed(1)}% 未达到阈值 ${threshold * 100}%`,
          usageRatio: sessionInfo.usageRatio
        };
      }
      
      console.log(`⚠️ Context usage ${(sessionInfo.usageRatio * 100).toFixed(1)}% >= ${threshold * 100}%`);
      
      // 3. 提取并保存会话
      const conversation = extractConversation(sessionInfo.sessionPath);
      
      if (conversation.length === 0) {
        return {
          success: false,
          error: 'No conversation content to save'
        };
      }
      
      const memoryId = await saveConversation(conversation, sessionInfo.sessionId);
      console.log(`✅ Conversation saved (id: ${memoryId})`);
      
      // 4. 触发 /new 创建新会话
      const newSessionResult = await triggerNewSession();
      
      if (newSessionResult.success) {
        console.log(`✅ New session created: ${newSessionResult.newSessionId}`);
        
        return {
          success: true,
          action: 'saved_and_reset',
          message: '会话已保存到记忆系统，并创建新会话',
          memoryId: memoryId,
          oldSessionId: newSessionResult.oldSessionId,
          newSessionId: newSessionResult.newSessionId,
          usageRatio: sessionInfo.usageRatio,
          messageCount: conversation.length
        };
      } else {
        return {
          success: false,
          error: 'Failed to create new session: ' + newSessionResult.error
        };
      }
      
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }
};

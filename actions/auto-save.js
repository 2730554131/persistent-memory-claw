/**
 * 自动安装依赖
 */
const fs = require('fs');
const path = require('path');

function ensureDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  let deps = ['sqlite3'];
  
  for (const dep of deps) {
    try {
      require(dep);
    } catch (e) {
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
 * 保存会话并新建会话
 * 当上下文使用比例达到 80% 时，保存会话原文并创建新会话
 */
const { PersistentMemory } = require('../scripts/memory.cjs');

async function getCurrentSessionInfo() {
  const sessionsDir = process.env.SESSIONS_DIR || 
    path.join(process.env.HOME || '/root', '.openclaw', 'agents', process.env.OPENCLAW_AGENT_ID || 'lobster-development-assistant', 'sessions');
  
  if (!fs.existsSync(sessionsDir)) return null;
  
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(sessionsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  if (files.length === 0) return null;
  
  const sessionId = files[0].name.replace('.jsonl', '');
  const sessionPath = path.join(sessionsDir, files[0].name);
  const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(l => l.trim());
  
  let totalTokens = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'message' && entry.message?.usage) {
        totalTokens += (entry.message.usage.input || 0) + (entry.message.usage.output || 0);
      }
    } catch (e) {}
  }
  
  return { sessionId, sessionPath, totalTokens, contextWindow: 200000, usageRatio: totalTokens / 200000 };
}

function extractConversation(sessionPath) {
  const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(l => l.trim());
  const conversation = [];
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== 'message' || !entry.message?.role) continue;
      if (!['user', 'assistant'].includes(entry.message.role)) continue;
      
      let text = '';
      for (const content of entry.message.content || []) {
        if (content.type === 'text') text += content.text + '\n';
      }
      
      if (text.trim()) {
        conversation.push({ role: entry.message.role, content: text.trim() });
      }
    } catch (e) {}
  }
  
  return conversation;
}

async function saveConversation(conversation, sessionId) {
  const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
  const mem = new PersistentMemory({ workspace });
  
  try {
    await mem.init();
    
    // 原文保存：用户提问 + AI 回答
    let fullText = `【会话 ${sessionId}】\n\n`;
    for (const msg of conversation) {
      const roleLabel = msg.role === 'user' ? '【用户】' : '【AI】';
      fullText += `${roleLabel}\n${msg.content}\n\n`;
    }
    
    return await mem.save('conversation', fullText);
  } finally {
    mem.close();
  }
}

async function triggerNewSession() {
  const sessionsDir = process.env.SESSIONS_DIR || 
    path.join(process.env.HOME || '/root', '.openclaw', 'agents', process.env.OPENCLAW_AGENT_ID || 'lobster-development-assistant', 'sessions');
  const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
  
  if (!fs.existsSync(sessionsJsonPath)) return { success: false, error: 'sessions.json not found' };
  
  const sessionsData = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf8'));
  const agentKey = `agent:${process.env.OPENCLAW_AGENT_ID || 'lobster-development-assistant'}:direct`;
  
  if (!sessionsData[agentKey]) return { success: false, error: 'session not found' };
  
  // 归档旧会话
  const oldSessionId = sessionsData[agentKey].sessionId;
  const oldSessionPath = path.join(sessionsDir, `${oldSessionId}.jsonl`);
  
  if (fs.existsSync(oldSessionPath)) {
    const archivedPath = oldSessionPath + `.archived.${Date.now()}`;
    fs.renameSync(oldSessionPath, archivedPath);
  }
  
  // 创建新会话
  const newSessionId = `session-${Date.now()}`;
  sessionsData[agentKey].sessionId = newSessionId;
  sessionsData[agentKey].updatedAt = Date.now();
  fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2));
  
  return { success: true, newSessionId, oldSessionId };
}

module.exports = {
  name: 'persistent_memory_save_and_reset',
  description: '当上下文达到80%时，保存会话原文并创建新会话',
  parameters: {
    type: 'object',
    properties: {
      threshold: { type: 'number', default: 0.8, description: '触发阈值 (0-1)' }
    }
  },
  async run(params) {
    const { threshold = 0.8 } = params;
    
    const sessionInfo = await getCurrentSessionInfo();
    if (!sessionInfo) return { success: false, error: 'No active session' };
    
    // 检查是否达到阈值
    if (sessionInfo.usageRatio < threshold) {
      return { success: true, action: 'none', usageRatio: sessionInfo.usageRatio };
    }
    
    // 提取会话原文
    const conversation = extractConversation(sessionInfo.sessionPath);
    if (conversation.length === 0) return { success: false, error: 'No content to save' };
    
    // 保存原文到记忆
    const memoryId = await saveConversation(conversation, sessionInfo.sessionId);
    
    // 创建新会话
    const newSession = await triggerNewSession();
    
    return {
      success: true,
      action: 'saved_and_reset',
      memoryId,
      newSessionId: newSession.newSessionId,
      oldSessionId: newSession.oldSessionId,
      usageRatio: sessionInfo.usageRatio,
      messageCount: conversation.length
    };
  }
};

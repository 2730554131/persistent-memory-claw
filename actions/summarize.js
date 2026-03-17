/**
 * Persistent Memory - Summarize Action
 * 使用 subagent 调用 LLM 生成摘要
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
    date: null,
    sessionId: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      result.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      result.date = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * 使用 subagent 生成摘要
 */
async function generateSummary(conversationText) {
  return new Promise((resolve, reject) => {
    // 使用 spawn 来调用 subagent
    const { spawn } = require('child_process');
    
    const prompt = `请分析以下对话，生成一个简洁的摘要（100字以内），包含：
1. 对话主题
2. 关键信息

对话内容：
${conversationText}`;

    // 通过 openclaw CLI 调用 subagent
    const proc = spawn('npx', [
      'openclaw',
      'agent',
      '--prompt', prompt,
      '--model', 'minimax-portal/MiniMax-M2.5'
    ], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        // 如果CLI不可用，返回简化的本地摘要
        resolve(generateLocalSummary(conversationText));
      }
    });
  });
}

/**
 * 本地简单摘要（备用方案）
 */
function generateLocalSummary(conversationText) {
  const lines = conversationText.split('\n').filter(l => l.trim());
  
  // 提取用户和AI的最后几轮对话
  const recent = lines.slice(-6);
  
  let summary = '对话摘要：\n';
  for (const line of recent) {
    if (line.startsWith('用户:') || line.startsWith('user:')) {
      summary += '用户: ' + line.replace(/^(用户:|user:)/, '').substring(0, 50) + '...\n';
    }
  }
  
  return summary;
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();
  const memoryDir = path.join(options.workspace, 'memory');
  
  if (!fs.existsSync(memoryDir)) {
    console.log(JSON.stringify({ success: false, error: '暂无记忆' }));
    return;
  }

  // 确定要处理的文件
  let dbFiles = [];
  
  if (options.date) {
    const dbPath = path.join(memoryDir, `${options.date}.db`);
    if (fs.existsSync(dbPath)) {
      dbFiles.push(dbPath);
    }
  } else {
    // 处理今天和昨天的文件
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    for (const date of [today, yesterday]) {
      const dbPath = path.join(memoryDir, `${date}.db`);
      if (fs.existsSync(dbPath)) {
        dbFiles.push(dbPath);
      }
    }
  }

  if (dbFiles.length === 0) {
    console.log(JSON.stringify({ success: false, error: '未找到记忆文件' }));
    return;
  }

  const sqlite3 = require('sqlite3').verbose();
  
  // 读取对话内容
  let allMessages = [];
  
  for (const dbPath of dbFiles) {
    const db = new sqlite3.Database(dbPath);
    
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT session_id, role, content, timestamp FROM memories ORDER BY timestamp', (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    allMessages = allMessages.concat(rows);
  }

  if (allMessages.length === 0) {
    console.log(JSON.stringify({ success: false, error: '暂无对话内容' }));
    return;
  }

  // 限制消息数量（取最近的）
  const recentMessages = allMessages.slice(-50);
  
  // 构建对话文本
  let conversationText = '';
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? '用户' : 'AI';
    conversationText += `${role}: ${msg.content}\n\n`;
  }

  try {
    // 使用 subagent 生成摘要
    let summary;
    try {
      summary = await generateSummary(conversationText);
    } catch (e) {
      // 如果 subagent 不可用，使用本地摘要
      summary = generateLocalSummary(conversationText);
    }

    // 保存摘要到数据库
    const dbPath = path.join(memoryDir, `${options.date || new Date().toISOString().split('T')[0]}.db`);
    const db = new sqlite3.Database(dbPath);

    await new Promise((resolve) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, resolve);
    });

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO summaries (content) VALUES (?)',
        [summary],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    db.close();

    console.log(JSON.stringify({
      success: true,
      summary,
      messageCount: recentMessages.length,
      message: '摘要生成成功'
    }));

  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

main();

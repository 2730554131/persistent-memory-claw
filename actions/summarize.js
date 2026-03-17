/**
 * Persistent Memory - Summarize Action
 * LLM 驱动的自动摘要生成
 * 
 * 功能：
 * - 使用 OpenClaw LLM 生成会话摘要
 * - 自动提取关键信息（任务、承诺、决定）
 * - 生成行动项
 * 
 * 触发关键词：摘要、总结、提炼
 */

const http = require('http');
const https = require('https');

/**
 * 调用 OpenClaw LLM 生成摘要
 */
async function callLLM(options, prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: options.model || 'openclaw:main',
      messages: [
        { role: 'system', content: '你是一个专业的会议记录助手，负责生成简洁准确的摘要。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.choices && response.choices[0]) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error('LLM response error: ' + body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
    date: null,
    sessionId: null,
    gatewayUrl: 'http://localhost:8080',
    token: process.env.OPENCLAW_GATEWAY_TOKEN || 'openclaw',
    model: 'openclaw:main'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      result.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      result.date = args[i + 1];
      i++;
    } else if (args[i] === '--session-id' && args[i + 1]) {
      result.sessionId = args[i + 1];
      i++;
    } else if (args[i] === '--gateway-url' && args[i + 1]) {
      result.gatewayUrl = args[i + 1];
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      result.token = args[i + 1];
      i++;
    } else if (args[i] === '--model' && args[i + 1]) {
      result.model = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();
  const fs = require('fs');
  const path = require('path');

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
  const recentMessages = allMessages.slice(-100);
  
  // 构建对话文本
  let conversationText = '';
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? '用户' : 'AI';
    conversationText += `${role}: ${msg.content}\n\n`;
  }

  try {
    // 调用 LLM 生成摘要
    const summaryPrompt = `请分析以下对话，生成一个简洁的摘要，包含：
1. 对话主题
2. 关键信息（任务、承诺、决定）
3. 重要行动项
4. 待完成的事项

对话内容：
${conversationText}`;

    const url = new URL('/v1/chat/completions', options.gatewayUrl);
    const llmOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.token}`
      }
    };

    const summary = await callLLM(llmOptions, summaryPrompt);

    // 提取关键信息
    const keyInfoPrompt = `从以下对话摘要中提取关键信息，以JSON格式返回：
{
  "tasks": ["任务列表"],
  "promises": ["承诺列表"],
  "decisions": ["决定列表"],
  "topics": ["主题列表"]
}

摘要：
${summary}`;

    const keyInfo = await callLLM(llmOptions, keyInfoPrompt);

    // 解析 JSON
    let parsedKeyInfo = {};
    try {
      const jsonMatch = keyInfo.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedKeyInfo = JSON.parse(jsonMatch[0]);
      }
    } catch {}

    // 保存摘要到数据库
    const dbPath = path.join(memoryDir, `${options.date || new Date().toISOString().split('T')[0]}.db`);
    const db = new sqlite3.Database(dbPath);

    // 创建摘要表
    await new Promise((resolve) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT,
          key_info TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, resolve);
    });

    // 保存摘要
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO summaries (content, key_info) VALUES (?, ?)',
        [summary, JSON.stringify(parsedKeyInfo)],
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
      keyInfo: parsedKeyInfo,
      messageCount: recentMessages.length,
      message: '摘要生成成功'
    }));

  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      message: 'LLM 调用失败，请确保 Gateway 的 chatCompletions 已启用'
    }));
  }
}

main();

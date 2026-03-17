/**
 * Persistent Memory - Ask Action
 * RAG 智能问答
 * 
 * v2.2 基于记忆的智能问答
 * 
 * 触发关键词：之前、记得、聊过、问
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
    question: '',
    date: null,
    limit: 10
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      result.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--question' && args[i + 1]) {
      result.question = args[i + 1];
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      result.date = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[i + 1]);
      i++;
    }
  }

  return result;
}

/**
 * 关键词检索相关记忆
 */
async function searchMemories(workspace, query, date, limit) {
  const memoryDir = path.join(workspace, 'memory');
  
  if (!fs.existsSync(memoryDir)) {
    return [];
  }

  const sqlite3 = require('sqlite3').verbose();
  let results = [];
  
  // 确定搜索范围
  let dbFiles = [];
  
  if (date) {
    const dbPath = path.join(memoryDir, `${date}.db`);
    if (fs.existsSync(dbPath)) {
      dbFiles.push({ file: dbPath, date });
    }
  } else {
    // 搜索所有文件
    const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.db'));
    for (const file of files) {
      dbFiles.push({ 
        file: path.join(memoryDir, file), 
        date: file.replace('.db', '') 
      });
    }
  }

  // 关键词搜索
  for (const { file, date: fileDate } of dbFiles) {
    const db = new sqlite3.Database(file);
    
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT content, category, importance, created_at 
         FROM memories 
         WHERE content LIKE ?
         ORDER BY importance DESC, created_at DESC
         LIMIT ?`,
        [`%${query}%`, limit],
        (err, rows) => {
          db.close();
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    for (const row of rows) {
      results.push({
        date: fileDate,
        content: row.content,
        category: row.category,
        importance: row.importance
      });
    }
  }
  
  // 按重要性排序
  results.sort((a, b) => b.importance - a.importance);
  
  return results.slice(0, limit);
}

/**
 * 使用 LLM 生成答案
 */
async function askLLM(question, memories) {
  return new Promise((resolve) => {
    // 构建上下文
    let context = '';
    for (const m of memories) {
      context += `- [${m.date}] ${m.content.substring(0, 200)}\n`;
    }

    const prompt = `基于以下记忆回答用户的问题。如果找不到相关信息，请如实说明。

记忆内容：
${context}

用户问题：${question}

请用自然语言回答：`;

// 调用 subagent
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
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        // fallback: 返回检索结果
        resolve(memories.length > 0 
          ? `找到 ${memories.length} 条相关记忆：\n\n${memories.map(m => `- ${m.content.substring(0, 100)}...`).join('\n')}`
          : '抱歉，没有找到相关的记忆。');
      }
    });

    // 超时
    setTimeout(() => {
      proc.kill();
      resolve(memories.length > 0 
        ? `找到 ${memories.length} 条相关记忆`
        : '没有找到相关信息');
    }, 30000);
  });
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();
  
  if (!options.question) {
    console.log(JSON.stringify({ 
      success: false, 
      error: '问题不能为空，请使用 --question "问题"' 
    }));
    return;
  }

  console.log('[ask] 正在搜索相关记忆...');
  
  // 1. 检索相关记忆
  const memories = await searchMemories(
    options.workspace, 
    options.question, 
    options.date, 
    options.limit
  );

  console.log(`[ask] 找到 ${memories.length} 条相关记忆`);

  if (memories.length === 0) {
    console.log(JSON.stringify({
      success: true,
      question: options.question,
      answer: '抱歉，我没有找到相关的记忆。你可以告诉我更多信息，我会记住的。',
      memories: []
    }));
    return;
  }

  // 2. 生成答案
  console.log('[ask] 正在生成答案...');
  
  try {
    const answer = await askLLM(options.question, memories);
    
    console.log(JSON.stringify({
      success: true,
      question: options.question,
      answer,
      memories: memories.map(m => ({
        date: m.date,
        content: m.content.substring(0, 100),
        importance: m.importance
      }))
    }));
  } catch (e) {
    console.log(JSON.stringify({
      success: false,
      error: e.message
    }));
  }
}

main();

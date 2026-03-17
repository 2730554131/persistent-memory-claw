/**
 * Persistent Memory - Summarize Action
 * 手动生成摘要
 * 
 * 触发关键词：摘要、总结
 */

const fs = require('fs');
const path = require('path');

/**
 * 本地简单摘要
 */
function generateLocalSummary(conversationText: string): string {
  const lines = conversationText.split('\n').filter(l => l.trim());
  const recent = lines.slice(-10);
  
  let summary = '## 对话摘要\n\n';
  
  // 提取用户问题
  const userQuestions = recent
    .filter(l => l.startsWith('用户:') || l.startsWith('user:'))
    .slice(-3);
  
  if (userQuestions.length > 0) {
    summary += '### 用户问题\n';
    for (const q of userQuestions) {
      summary += `- ${q.replace(/^(用户:|user:)/, '').substring(0, 100)}\n`;
    }
    summary += '\n';
  }
  
  // 简单统计
  const userCount = recent.filter(l => l.startsWith('用户:') || l.startsWith('user:')).length;
  const aiCount = recent.filter(l => l.startsWith('AI:') || l.startsWith('assistant:')).length;
  
  summary += `### 统计\n- 用户消息: ${userCount}\n- AI 回复: ${aiCount}\n`;
  
  return summary;
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
    date: null
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
 * 手动生成摘要
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
      dbFiles.push({ file: dbPath, date: options.date });
    }
  } else {
    // 处理今天和昨天的文件
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    for (const date of [today, yesterday]) {
      const dbPath = path.join(memoryDir, `${date}.db`);
      if (fs.existsSync(dbPath)) {
        dbFiles.push({ file: dbPath, date });
      }
    }
  }

  if (dbFiles.length === 0) {
    console.log(JSON.stringify({ success: false, error: '未找到记忆文件' }));
    return;
  }

  const sqlite3 = require('sqlite3').verbose();
  
  // 读取对话内容
  let allContent = '';
  
  for (const { file, date } of dbFiles) {
    const db = new sqlite3.Database(file);
    
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT content FROM memories ORDER BY id', (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    for (const row of rows) {
      allContent += `用户: ${row.content}\n\n`;
    }
  }

  if (!allContent) {
    console.log(JSON.stringify({ success: false, error: '暂无对话内容' }));
    return;
  }

  // 生成摘要
  const summary = generateLocalSummary(allContent);

  // 保存摘要到文件
  const dateStr = options.date || new Date().toISOString().split('T')[0];
  const summaryPath = path.join(memoryDir, `${dateStr}-summary.md`);
  
  fs.writeFileSync(summaryPath, summary, 'utf-8');

  console.log(JSON.stringify({
    success: true,
    summary,
    savedTo: summaryPath,
    message: '摘要已生成'
  }));
}

main();

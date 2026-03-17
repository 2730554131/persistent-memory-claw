/**
 * Persistent Memory - Reflect Action
 * 自我反思
 * 
 * v2.3 定期回顾并总结经验教训
 * 
 * 触发关键词：反思、回顾、总结经验
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
    days: 7,  // 默认回顾最近7天
    date: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      result.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      result.days = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      result.date = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * 获取最近N天的记忆
 */
async function getRecentMemories(workspace, days) {
  const memoryDir = path.join(workspace, 'memory');
  
  if (!fs.existsSync(memoryDir)) {
    return [];
  }

  const sqlite3 = require('sqlite3').verbose();
  let allMemories = [];
  
  // 获取最近N天的日期
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    dates.push(d.toISOString().split('T')[0]);
  }

  for (const dateStr of dates) {
    const dbPath = path.join(memoryDir, `${dateStr}.db`);
    if (fs.existsSync(dbPath)) {
      const db = new sqlite3.Database(dbPath);
      
      const rows = await new Promise((resolve, reject) => {
        db.all(
          'SELECT content, category, importance, created_at FROM memories ORDER BY importance DESC, created_at DESC',
          [],
          (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      
      for (const row of rows) {
        allMemories.push({
          date: dateStr,
          content: row.content,
          category: row.category,
          importance: row.importance
        });
      }
    }
  }

  return allMemories;
}

/**
 * 使用 LLM 进行反思
 */
async function reflectWithLLM(memories) {
  return new Promise((resolve) => {
    // 按重要性分组
    const important = memories.filter(m => m.importance >= 7);
    const tasks = memories.filter(m => m.category === 'task');
    const promises = memories.filter(m => m.category === 'promise');
    const decisions = memories.filter(m => m.category === 'decision');

    let context = `近期记忆统计：\n`;
    context += `- 总记忆数: ${memories.length}\n`;
    context += `- 重要记忆(7星以上): ${important.length}\n`;
    context += `- 任务: ${tasks.length}\n`;
    context += `- 承诺: ${promises.length}\n`;
    context += `- 决定: ${decisions.length}\n\n`;

    // 取重要内容
    context += '重要内容：\n';
    for (const m of important.slice(0, 10)) {
      context += `- [${m.date}] ${m.content.substring(0, 100)}\n`;
    }

    const prompt = `你是一个 AI 助手，请分析以下记忆，进行自我反思。

要求：
1. 总结近期的主要工作/对话主题
2. 提取重要的经验教训
3. 识别待完成的任务
4. 提出改进建议

${context}

请用简洁的语言总结（200字以内）：`;

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
        // fallback
        resolve(generateLocalReflection(memories));
      }
    });

    // 超时
    setTimeout(() => {
      proc.kill();
      resolve(generateLocalReflection(memories));
    }, 30000);
  });
}

/**
 * 本地简单反思（备用方案）
 */
function generateLocalReflection(memories) {
  const important = memories.filter(m => m.importance >= 7);
  
  let result = '## 自我反思\n\n';
  result += `近期共保存 ${memories.length} 条记忆，其中 ${important.length} 条重要内容。\n\n`;
  
  if (important.length > 0) {
    result += '### 重要内容\n';
    for (const m of important.slice(0, 5)) {
      result += `- ${m.content.substring(0, 60)}...\n`;
    }
  }
  
  return result;
}

/**
 * 保存反思结果
 */
async function saveReflection(workspace, reflection) {
  const memoryDir = path.join(workspace, 'memory');
  
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const dbPath = path.join(memoryDir, `${dateStr}.db`);

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);

  await new Promise((resolve) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS reflections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT,
          days INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(
        'INSERT INTO reflections (content, days) VALUES (?, ?)',
        [reflection, 7],
        function(err) {
          if (err) console.error(err);
        }
      );
      
      resolve();
    });
  });

  db.close();
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();

  console.log('[reflect] 开始自我反思...');

  // 获取近期记忆
  const memories = await getRecentMemories(options.workspace, options.days);

  if (memories.length === 0) {
    console.log(JSON.stringify({
      success: false,
      message: '暂无记忆可反思'
    }));
    return;
  }

  console.log(`[reflect] 共获取 ${memories.length} 条记忆`);

  // 进行反思
  const reflection = await reflectWithLLM(memories);

  // 保存反思结果
  await saveReflection(options.workspace, reflection);

  console.log(JSON.stringify({
    success: true,
    days: options.days,
    memoryCount: memories.length,
    reflection
  }));
}

main();

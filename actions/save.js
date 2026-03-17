/**
 * Persistent Memory - Save Action
 * 手动保存记忆（支持智能标记）
 * 
 * 触发关键词：记住、保存、记录
 * 
 * v2.1 智能标记：
 * - 自动分析内容重要性（1-10星）
 * - 自动分类：task/promise/decision/normal
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
    content: '',
    category: 'default',
    autoTag: true,  // 默认开启智能标记
    date: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      result.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--content' && args[i + 1]) {
      result.content = args[i + 1];
      i++;
    } else if (args[i] === '--category' && args[i + 1]) {
      result.category = args[i + 1];
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      result.date = args[i + 1];
      i++;
    } else if (args[i] === '--no-auto-tag') {
      result.autoTag = false;
    }
  }

  return result;
}

/**
 * 使用 subagent 调用 LLM 智能分析
 */
function analyzeContent(content) {
  return new Promise((resolve) => {
    const prompt = `分析以下内容，判断其重要性和类型。

要求以JSON格式返回：
{
  "importance": 1-10的数字,
  "type": "task"(任务) / "promise"(承诺) / "decision"(决定) / "normal"(普通)
}

内容：${content}`;

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
        try {
          // 尝试解析 JSON
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            resolve(result);
            return;
          }
        } catch (e) {}
      }
      // 失败时返回默认值
      resolve({ importance: 5, type: 'normal' });
    });

    // 超时 fallback
    setTimeout(() => {
      proc.kill();
      resolve({ importance: 5, type: 'normal' });
    }, 30000);
  });
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();
  
  if (!options.content) {
    console.log(JSON.stringify({ 
      success: false, 
      error: '内容不能为空，请使用 --content "内容"' 
    }));
    return;
  }

  const memoryDir = path.join(options.workspace, 'memory');
  
  // 创建 memory 目录
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  // 确定日期
  const dateStr = options.date || new Date().toISOString().split('T')[0];
  const dbPath = path.join(memoryDir, `${dateStr}.db`);

  // 智能标记
  let importance = 5;
  let type = options.category;

  if (options.autoTag && options.category === 'default') {
    console.log('[save] 正在智能分析内容...');
    try {
      const analysis = await analyzeContent(options.content);
      importance = analysis.importance || 5;
      type = analysis.type || 'normal';
      console.log(`[save] 智能分析结果: ${importance}星, 类型: ${type}`);
    } catch (e) {
      console.log('[save] 智能分析失败，使用默认标记');
    }
  }

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);

  // 创建表（包含重要性字段）
  await new Promise((resolve) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'normal',
          importance INTEGER DEFAULT 5,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      resolve();
    });
  });

  // 保存记忆
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO memories (content, category, importance) VALUES (?, ?, ?)',
      [options.content, type, importance],
      function(err) {
        if (err) {
          console.log(JSON.stringify({ success: false, error: err.message }));
        } else {
          console.log(JSON.stringify({ 
            success: true, 
            id: this.lastID,
            date: dateStr,
            category: type,
            importance: importance,
            message: importance >= 7 ? '已标记为重要内容' : '记忆已保存'
          }));
        }
        db.close();
        resolve();
      }
    );
  });
}

main();

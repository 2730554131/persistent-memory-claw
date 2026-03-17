/**
 * Persistent Memory - Save Action
 * 手动保存记忆的 Action
 * 
 * 触发关键词：记住、保存、记录
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
    content: '',
    category: 'default',
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
    }
  }

  return result;
}

/**
 * 手动保存记忆
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

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);

  // 创建表
  await new Promise((resolve) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'default',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      resolve();
    });
  });

  // 保存记忆
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO memories (content, category) VALUES (?, ?)',
      [options.content, options.category],
      function(err) {
        if (err) {
          console.log(JSON.stringify({ success: false, error: err.message }));
        } else {
          console.log(JSON.stringify({ 
            success: true, 
            id: this.lastID,
            date: dateStr,
            message: '记忆已保存' 
          }));
        }
        db.close();
        resolve();
      }
    );
  });
}

main();

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

interface HookEvent {
  type: string;
  action: string;
  sessionKey: string;
  timestamp: Date;
  messages: string[];
  context: {
    sessionFile?: string;
    sessionId?: string;
    workspaceDir?: string;
  };
}

/**
 * 使用 subagent 生成摘要
 */
function generateSummary(conversationText: string): Promise<string> {
  return new Promise((resolve) => {
    const prompt = `请分析以下对话，生成一个简洁的摘要（50字以内），包含：
1. 对话主题
2. 关键信息

对话内容：
${conversationText}`;

    // 尝试通过 openclaw agent 调用 LLM
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
        // 如果 subagent 不可用，使用本地简单摘要
        resolve(generateLocalSummary(conversationText));
      }
    });

    // 超时 fallback
    setTimeout(() => {
      proc.kill();
      resolve(generateLocalSummary(conversationText));
    }, 30000);
  });
}

/**
 * 本地简单摘要（备用方案）
 */
function generateLocalSummary(conversationText: string): string {
  const lines = conversationText.split('\n').filter(l => l.trim());
  const recent = lines.slice(-6);
  
  let summary = '摘要：';
  for (const line of recent) {
    if (line.startsWith('用户:')) {
      summary += ' ' + line.replace('用户:', '').substring(0, 30) + '...';
    }
  }
  
  return summary || '对话摘要';
}

/**
 * 自动保存 Hook
 * 在会话压缩前保存所有对话到 SQLite
 * 存储路径：memory/YYYY-MM-DD.db
 * 支持会话多次压缩，每次只保存新增消息
 * 同时自动生成摘要
 */
const handler = async (event: HookEvent): Promise<void> => {
  // 只处理 session:compact:before 事件
  if (event.type !== 'session' || event.action !== 'compact:before') {
    return;
  }

  console.log('[persistent-memory-auto-save] 触发自动保存...');

  const { sessionFile, sessionId, workspaceDir } = event.context;

  if (!sessionFile || !workspaceDir || !sessionId) {
    console.log('[persistent-memory-auto-save] 缺少必要参数');
    return;
  }

  try {
    // 1. 读取会话 transcript（全部内容）
    const transcript = fs.readFileSync(sessionFile, 'utf-8');
    const lines = transcript.trim().split('\n').filter(line => line.trim());
    
    // 2. 获取当前日期
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 3. 创建 memory 目录
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // 4. 数据库路径：memory/YYYY-MM-DD.db
    const dbPath = path.join(memoryDir, `${dateStr}.db`);

    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);

    // 5. 创建表（如果不存在）
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        // 对话表
        db.run(`
          CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_session ON memories(session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp)`);
        
        // 元数据表
        db.run(`
          CREATE TABLE IF NOT EXISTS meta (
            session_id TEXT PRIMARY KEY,
            last_line_index INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // 摘要表
        db.run(`
          CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        resolve();
      });
    });

    // 6. 获取上次保存到的行号
    const lastLineIndex = await new Promise<number>((resolve) => {
      db.get(
        'SELECT last_line_index FROM meta WHERE session_id = ?',
        [sessionId],
        (err, row: any) => {
          resolve(row ? row.last_line_index : 0);
        }
      );
    });

    console.log(`[persistent-memory-auto-save] session ${sessionId} 上次保存到第 ${lastLineIndex} 行`);

    // 7. 从上次结束的位置继续解析新消息
    const newMessages: Array<{role: string, content: string, timestamp: string}> = [];
    let allContent = '';
    
    for (let i = lastLineIndex; i < lines.length; i++) {
      const line = lines[i];
      try {
        const entry = JSON.parse(line);
        
        // 只提取 message 类型的内容
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message;
          const msgTime = msg.timestamp || entry.timestamp;
          
          // 提取文本内容
          let textContent = '';
          if (Array.isArray(msg.content)) {
            textContent = msg.content
              .map((c: any) => c.text || '')
              .join('')
              .substring(0, 4000);
          } else if (typeof msg.content === 'string') {
            textContent = msg.content.substring(0, 4000);
          }
          
          if (textContent) {
            const role = msg.role === 'user' ? '用户' : 'AI';
            allContent += `${role}: ${textContent}\n\n`;
            newMessages.push({
              role: msg.role,
              content: textContent,
              timestamp: msgTime
            });
          }
        }
      } catch {}
    }

    if (newMessages.length === 0 && lastLineIndex > 0) {
      console.log('[persistent-memory-auto-save] 无新消息可保存');
      db.close();
      return;
    }

    console.log(`[persistent-memory-auto-save] 发现 ${newMessages.length} 条新消息`);

    // 8. 插入新消息
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        const stmt = db.prepare(
          'INSERT INTO memories (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
        );
        
        for (const msg of newMessages) {
          stmt.run(sessionId, msg.role, msg.content, msg.timestamp);
        }
        stmt.finalize();

        // 9. 更新元数据，记录当前保存到的行号
        db.run(
          'INSERT OR REPLACE INTO meta (session_id, last_line_index, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [sessionId, lines.length]
        );

        console.log(`[persistent-memory-auto-save] 已保存 ${newMessages.length} 条消息`);
        resolve();
      });
    });

    // 10. 自动生成摘要（仅在有新消息时）
    if (newMessages.length > 0) {
      try {
        console.log('[persistent-memory-auto-save] 正在生成摘要...');
        
        // 获取最近的所有消息用于摘要
        const recentMessages = await new Promise<any[]>((res) => {
          db.all(
            'SELECT role, content FROM memories ORDER BY id DESC LIMIT 20',
            [],
            (err, rows) => res(rows || [])
          );
        });

        let summaryText = '';
        for (const msg of recentMessages.reverse()) {
          const role = msg.role === 'user' ? '用户' : 'AI';
          summaryText += `${role}: ${msg.content}\n\n`;
        }

        // 生成摘要
        const summary = await generateSummary(summaryText);

        // 保存摘要
        await new Promise<void>((resolve) => {
          db.run(
            'INSERT INTO summaries (content) VALUES (?)',
            [summary],
            () => {
              console.log('[persistent-memory-auto-save] 摘要已生成保存');
              resolve();
            }
          );
        });
      } catch (e) {
        console.log('[persistent-memory-auto-save] 摘要生成失败:', e);
      }
    }

    db.close();

  } catch (error) {
    console.error('[persistent-memory-auto-save] 保存失败:', error);
  }
};

export default handler;

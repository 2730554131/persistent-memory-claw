import * as fs from 'fs';
import * as path from 'path';

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
 * 自动保存 Hook
 * 在会话压缩前保存所有对话到 SQLite
 * 存储路径：memory/YYYY-MM-DD.db
 * 支持会话多次压缩，每次只保存新增消息
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

    db.close();

  } catch (error) {
    console.error('[persistent-memory-auto-save] 保存失败:', error);
  }
};

export default handler;

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
 * 同一天多次压缩时自动追加，不会覆盖
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
    // 1. 读取会话 transcript（全部内容，不限制行数）
    const transcript = fs.readFileSync(sessionFile, 'utf-8');
    const lines = transcript.trim().split('\n').filter(line => line.trim());
    
    // 2. 解析每条消息（包含时间戳）
    const messages = [];
    
    for (const line of lines) {
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
              .substring(0, 4000); // 每条消息限制 4000 字符
          } else if (typeof msg.content === 'string') {
            textContent = msg.content.substring(0, 4000);
          }
          
          if (textContent) {
            messages.push({
              role: msg.role,
              content: textContent,
              timestamp: msgTime
            });
          }
        }
      } catch {}
    }

    if (messages.length === 0) {
      console.log('[persistent-memory-auto-save] 无消息可保存');
      return;
    }

    console.log(`[persistent-memory-auto-save] 解析到 ${messages.length} 条消息`);

    // 3. 获取当前日期
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 4. 创建 memory 目录
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // 5. 数据库路径：memory/YYYY-MM-DD.db
    const dbPath = path.join(memoryDir, `${dateStr}.db`);

    // 6. 使用 SQLite 保存（追加模式）
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);

    // 7. 创建表
    db.serialize(() => {
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

      // 8. 检查是否已存在相同 sessionId 的记录
      // 如果存在则跳过，避免重复存储
      const existingCount = await new Promise<number>((resolve) => {
        db.get(
          'SELECT COUNT(*) as count FROM memories WHERE session_id = ?',
          [sessionId],
          (err, row: any) => {
            resolve(row ? row.count : 0);
          }
        );
      });

      if (existingCount > 0) {
        console.log(`[persistent-memory-auto-save] session ${sessionId} 已存在，跳过`);
        db.close();
        return;
      }

      // 9. 插入所有消息（追加模式，不会覆盖原有数据）
      const stmt = db.prepare(
        'INSERT INTO memories (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
      );
      
      for (const msg of messages) {
        stmt.run(sessionId, msg.role, msg.content, msg.timestamp);
      }
      stmt.finalize();

      console.log(`[persistent-memory-auto-save] 已追加 ${messages.length} 条消息到 ${dbPath}`);
    });

    db.close();

  } catch (error) {
    console.error('[persistent-memory-auto-save] 保存失败:', error);
  }
};

export default handler;

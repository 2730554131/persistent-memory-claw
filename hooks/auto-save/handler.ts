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
 * 在会话压缩前按日期保存会话到 SQLite
 * 存储路径：memory/YYYY-MM-DD.db
 */
const handler = async (event: HookEvent): Promise<void> => {
  // 只处理 session:compact:before 事件
  if (event.type !== 'session' || event.action !== 'compact:before') {
    return;
  }

  console.log('[persistent-memory-auto-save] 触发自动保存...');

  const { sessionFile, sessionId, workspaceDir } = event.context;

  if (!sessionFile || !workspaceDir) {
    console.log('[persistent-memory-auto-save] 缺少 sessionFile 或 workspaceDir');
    return;
  }

  try {
    // 1. 读取会话 transcript
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
          
          // 优先使用 message 内部的 timestamp，否则用 entry 的
          const msgTime = msg.timestamp || entry.timestamp;
          
          messages.push({
            role: msg.role,
            content: msg.content?.[0]?.text?.substring(0, 2000) || msg.content?.substring(0, 2000) || '',
            timestamp: msgTime
          });
        }
      } catch {}
    }

    if (messages.length === 0) {
      console.log('[persistent-memory-auto-save] 无消息可保存');
      return;
    }

    // 3. 获取当前日期作为存储键
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 4. 创建 memory 目录
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // 5. 数据库路径：memory/YYYY-MM-DD.db
    const dbPath = path.join(memoryDir, `${dateStr}.db`);

    // 6. 使用 SQLite 保存
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);

    // 7. 创建表（包含时间戳）
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

      // 8. 插入每条消息（包含时间戳）
      const stmt = db.prepare(
        'INSERT INTO memories (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
      );
      
      for (const msg of messages) {
        stmt.run(sessionId, msg.role, msg.content, msg.timestamp);
      }
      stmt.finalize();
    });

    db.close(() => {
      console.log(`[persistent-memory-auto-save] 已保存 ${messages.length} 条消息到 ${dbPath}`);
    });

  } catch (error) {
    console.error('[persistent-memory-auto-save] 保存失败:', error);
  }
};

export default handler;

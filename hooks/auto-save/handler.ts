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
 * 在会话压缩前保存会话内容到 SQLite
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
    // 读取会话 transcript
    const transcript = fs.readFileSync(sessionFile, 'utf-8');
    const lines = transcript.trim().split('\n');
    
    // 取最近的消息（最后 50 行）
    const recentMessages = lines.slice(-50).join('\n');

    // 创建 memory 目录
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // 数据库路径
    const dbPath = path.join(memoryDir, `${sessionId}.db`);

    // 使用 SQLite 保存
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);

    // 创建表
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'conversation',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 插入会话内容
      db.run(
        'INSERT INTO memories (content, category) VALUES (?, ?)',
        [JSON.stringify({
          sessionId,
          savedAt: new Date().toISOString(),
          transcript: recentMessages
        }), 'conversation']
      );
    });

    db.close(() => {
      console.log(`[persistent-memory-auto-save] 会话已保存到 ${dbPath}`);
    });

  } catch (error) {
    console.error('[persistent-memory-auto-save] 保存失败:', error);
  }
};

export default handler;

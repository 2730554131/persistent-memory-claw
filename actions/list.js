/**
 * Persistent Memory - List Action
 * 列出记忆的 Action
 * 
 * 触发关键词：列出、查看、看看、显示
 * 支持按日期查询：如"查看2026年3月17日的记忆"
 */

const fs = require('fs');
const path = require('path');

/**
 * 列出/搜索记忆
 * @param {Object} params - 参数
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.date - 可选，日期 YYYY-MM-DD，不传则列出所有
 * @returns {Object} 记忆列表
 */
async function list(params) {
  const { workspace, date } = params;
  
  if (!workspace) {
    return { success: false, error: 'workspace 不能为空' };
  }
  
  try {
    const memoryDir = path.join(workspace, 'memory');
    
    if (!fs.existsSync(memoryDir)) {
      return { 
        success: true, 
        date: date || 'all',
        count: 0, 
        results: [],
        message: '暂无记忆' 
      };
    }
    
    const sqlite3 = require('sqlite3').verbose();
    let results = [];
    
    if (date) {
      // 1. 查询指定日期的记忆
      const dbPath = path.join(memoryDir, `${date}.db`);
      
      if (fs.existsSync(dbPath)) {
        const db = new sqlite3.Database(dbPath);
        
        const rows = await new Promise((resolve, reject) => {
          db.all(
            'SELECT session_id, role, content, timestamp, created_at FROM memories ORDER BY timestamp',
            (err, rows) => {
              db.close();
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
        
        // 按会话分组
        const sessions = {};
        for (const row of rows) {
          if (!sessions[row.session_id]) {
            sessions[row.session_id] = [];
          }
          sessions[row.session_id].push({
            role: row.role,
            content: row.content,
            timestamp: row.timestamp || row.created_at
          });
        }
        
        results = Object.entries(sessions).map(([sessionId, msgs]) => ({
          date,
          sessionId,
          messages: msgs
        }));
      }
    } else {
      // 2. 查询所有日期的记忆
      const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.db'));
      
      for (const file of files) {
        const dbPath = path.join(memoryDir, file);
        const db = new sqlite3.Database(dbPath);
        
        const rows = await new Promise((resolve, reject) => {
          db.all(
            'SELECT session_id, role, content, timestamp, created_at FROM memories ORDER BY timestamp DESC LIMIT 20',
            (err, rows) => {
              db.close();
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
        
        for (const row of rows) {
          results.push({
            date: file.replace('.db', ''),
            sessionId: row.session_id,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp || row.created_at
          });
        }
      }
    }
    
    return {
      success: true,
      date: date || 'all',
      count: results.length,
      results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { list };

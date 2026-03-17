/**
 * Persistent Memory - Search Action
 * 搜索记忆的 Action
 * 
 * 触发关键词：搜索、查找、找一下、记得
 */

const fs = require('fs');
const path = require('path');

/**
 * 搜索记忆
 * @param {Object} params - 参数
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.query - 搜索关键词
 * @param {string} params.date - 可选，指定日期 YYYY-MM-DD
 * @returns {Object} 搜索结果
 */
async function search(params) {
  const { workspace, query, date } = params;
  
  if (!query) {
    return { success: false, error: '搜索关键词不能为空' };
  }
  
  if (!workspace) {
    return { success: false, error: 'workspace 不能为空' };
  }
  
  try {
    const memoryDir = path.join(workspace, 'memory');
    
    if (!fs.existsSync(memoryDir)) {
      return { 
        success: true, 
        query,
        count: 0, 
        results: [],
        message: '暂无记忆' 
      };
    }
    
    const sqlite3 = require('sqlite3').verbose();
    let results = [];
    
    // 确定要搜索的文件
    let files = [];
    
    if (date) {
      // 搜索指定日期
      const dbPath = path.join(memoryDir, `${date}.db`);
      if (fs.existsSync(dbPath)) {
        files.push({ file: dbPath, date });
      }
    } else {
      // 搜索所有日期的文件
      const allFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.db'));
      for (const file of allFiles) {
        files.push({ 
          file: path.join(memoryDir, file), 
          date: file.replace('.db', '') 
        });
      }
    }
    
    // 搜索每个文件
    for (const { file, date: fileDate } of files) {
      const db = new sqlite3.Database(file);
      
      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT session_id, role, content, timestamp 
           FROM memories 
           WHERE content LIKE ?
           ORDER BY timestamp DESC
           LIMIT 20`,
          [`%${query}%`],
          (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      
      for (const row of rows) {
        results.push({
          date: fileDate,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          timestamp: row.timestamp
        });
      }
    }
    
    return {
      success: true,
      query,
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

module.exports = { search };

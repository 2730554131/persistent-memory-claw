/**
 * Persistent Memory - Knowledge Action
 * 知识管理模块
 * 
 * 功能：
 * - 标记重要事件（1-10星等级）
 * - 新会话优先加载
 * - 经验提取
 * - 知识积累
 * - 从失败中学习
 * - 主动学习
 * 
 * 触发关键词：重要、经验、知识、教训、学习
 */

const fs = require('fs');
const path = require('path');

/**
 * 知识管理
 * @param {Object} params - 参数
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.action - 操作类型
 * @param {string} params.content - 内容
 * @param {number} params.importance - 重要程度 1-10
 * @param {string} params.category - 分类
 * @param {string} params.eventId - 关联事件ID
 * @param {string} params.date - 可选，指定日期
 */
async function knowledge(params) {
  const { workspace, action, content, importance, category, eventId, date } = params;
  
  if (!workspace) {
    return { success: false, error: 'workspace 不能为空' };
  }
  
  const memoryDir = path.join(workspace, 'memory');
  
  // 确定数据库文件
  const dbFile = date ? `${date}.db` : new Date().toISOString().split('T')[0] + '.db';
  const dbPath = path.join(memoryDir, dbFile);
  
  if (!fs.existsSync(memoryDir)) {
    return { success: false, error: '暂无记忆' };
  }
  
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);
  
  // 创建知识管理表
  await new Promise((resolve) => {
    db.serialize(() => {
      // 重要事件表
      db.run(`
        CREATE TABLE IF NOT EXISTS important_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          content TEXT,
          importance INTEGER DEFAULT 5,
          category TEXT DEFAULT 'general',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          loaded_at TIMESTAMP
        )
      `);
      
      // 经验表
      db.run(`
        CREATE TABLE IF NOT EXISTS experiences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id INTEGER,
          content TEXT,
          type TEXT DEFAULT 'general',
          extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // 知识表
      db.run(`
        CREATE TABLE IF NOT EXISTS knowledge (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT,
          source TEXT,
          loaded_count INTEGER DEFAULT 0,
          last_loaded_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // 学习记录表
      db.run(`
        CREATE TABLE IF NOT EXISTS learning (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id INTEGER,
          lesson TEXT,
          action_taken TEXT,
          result TEXT,
          learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      resolve();
    });
  });
  
  try {
    let result;
    
    switch (action) {
      // 标记重要事件
      case 'mark_important': {
        if (!content) {
          return { success: false, error: '内容不能为空' };
        }
        
        const imp = importance || 5;
        const cat = category || 'general';
        
        await new Promise((resolve) => {
          db.run(
            'INSERT INTO important_events (session_id, content, importance, category) VALUES (?, ?, ?, ?)',
            [eventId || 'unknown', content, imp, cat],
            function(err) {
              if (err) throw err;
              result = {
                success: true,
                action: 'mark_important',
                id: this.lastID,
                content,
                importance: imp,
                category: cat,
                message: `已标记为 ${imp} 星重要事件`
              };
              resolve();
            }
          );
        });
        break;
      }
      
      // 获取重要事件（新会话优先加载）
      case 'get_important': {
        const limit = params.limit || 10;
        
        const rows = await new Promise((resolve, reject) => {
          db.all(
            `SELECT * FROM important_events 
             ORDER BY importance DESC, created_at DESC 
             LIMIT ?`,
            [limit],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
        
        // 更新加载时间
        for (const row of rows) {
          await new Promise((resolve) => {
            db.run(
              'UPDATE important_events SET loaded_at = CURRENT_TIMESTAMP WHERE id = ?',
              [row.id],
              () => resolve()
            );
          });
        }
        
        result = {
          success: true,
          action: 'get_important',
          count: rows.length,
          events: rows
        };
        break;
      }
      
      // 提取经验
      case 'extract_experience': {
        if (!content) {
          return { success: false, error: '内容不能为空' };
        }
        
        const type = category || 'general';
        
        await new Promise((resolve) => {
          db.run(
            'INSERT INTO experiences (event_id, content, type) VALUES (?, ?, ?)',
            [eventId || null, content, type],
            function(err) {
              if (err) throw err;
              result = {
                success: true,
                action: 'extract_experience',
                id: this.lastID,
                content,
                type,
                message: '经验已提取'
              };
              resolve();
            }
          );
        });
        break;
      }
      
      // 获取经验
      case 'get_experiences': {
        const type = params.type; // success/failure/learning
        let query = 'SELECT * FROM experiences';
        const paramsArr = [];
        
        if (type) {
          query += ' WHERE type = ?';
          paramsArr.push(type);
        }
        
        query += ' ORDER BY extracted_at DESC LIMIT 20';
        
        const rows = await new Promise((resolve, reject) => {
          db.all(query, paramsArr, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        result = {
          success: true,
          action: 'get_experiences',
          count: rows.length,
          experiences: rows
        };
        break;
      }
      
      // 积累知识
      case 'add_knowledge': {
        if (!content) {
          return { success: false, error: '知识内容不能为空' };
        }
        
        const source = category || 'manual';
        
        await new Promise((resolve) => {
          db.run(
            'INSERT INTO knowledge (content, source) VALUES (?, ?)',
            [content, source],
            function(err) {
              if (err) throw err;
              result = {
                success: true,
                action: 'add_knowledge',
                id: this.lastID,
                content,
                source,
                message: '知识已积累'
              };
              resolve();
            }
          );
        });
        break;
      }
      
      // 获取知识（新会话优先加载）
      case 'get_knowledge': {
        const limit = params.limit || 10;
        
        const rows = await new Promise((resolve, reject) => {
          db.all(
            `SELECT * FROM knowledge 
             ORDER BY loaded_count ASC, last_loaded_at ASC, created_at DESC 
             LIMIT ?`,
            [limit],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
        
        // 更新加载次数
        for (const row of rows) {
          await new Promise((resolve) => {
            db.run(
              'UPDATE knowledge SET loaded_count = loaded_count + 1, last_loaded_at = CURRENT_TIMESTAMP WHERE id = ?',
              [row.id],
              () => resolve()
            );
          });
        }
        
        result = {
          success: true,
          action: 'get_knowledge',
          count: rows.length,
          knowledge: rows
        };
        break;
      }
      
      // 从失败中学习
      case 'learn_from_failure': {
        if (!content) {
          return { success: false, error: '失败教训不能为空' };
        }
        
        const actionTaken = params.action_taken || '';
        const failureResult = params.result || '';
        
        await new Promise((resolve) => {
          db.run(
            'INSERT INTO learning (event_id, lesson, action_taken, result) VALUES (?, ?, ?, ?)',
            [eventId || null, content, actionTaken, failureResult],
            function(err) {
              if (err) throw err;
              result = {
                success: true,
                action: 'learn_from_failure',
                id: this.lastID,
                lesson: content,
                action_taken: actionTaken,
                result: failureResult,
                message: '已记录失败教训'
              };
              resolve();
            }
          );
        });
        break;
      }
      
      // 获取学习记录
      case 'get_learning': {
        const rows = await new Promise((resolve, reject) => {
          db.all(
            'SELECT * FROM learning ORDER BY learned_at DESC LIMIT 20',
            [],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
        
        result = {
          success: true,
          action: 'get_learning',
          count: rows.length,
          learnings: rows
        };
        break;
      }
      
      default:
        return { success: false, error: '未知操作类型' };
    }
    
    db.close();
    return result;
    
  } catch (error) {
    db.close();
    return { success: false, error: error.message };
  }
}

module.exports = { knowledge };

/**
 * Persistent Memory - Search Action
 * 搜索记忆的 Action
 * 
 * 支持：关键词搜索、语义(N-gram)搜索、混合搜索、热词统计
 * 
 * 触发关键词：搜索、查找、找一下、记得、热词
 */

const fs = require('fs');
const path = require('path');

// N-gram 分词器
function ngram(text, n = 2) {
  const tokens = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(t => t.length > 0);
  const ngrams = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 1; j <= n && i + j <= tokens.length; j++) {
      ngrams.push(tokens.slice(i, i + j).join(' '));
    }
  }
  return ngrams;
}

// 提取中英文字符
function extractTokens(text) {
  return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

// 计算词频
function wordFrequency(texts) {
  const freq = {};
  for (const text of texts) {
    const tokens = extractTokens(text);
    for (const token of tokens) {
      freq[token] = (freq[token] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
}

/**
 * 搜索记忆
 * @param {Object} params - 参数
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.query - 搜索关键词
 * @param {string} params.date - 可选，指定日期 YYYY-MM-DD
 * @param {string} params.searchType - 搜索类型：keyword, ngram, hybrid, hotwords
 * @returns {Object} 搜索结果
 */
async function search(params) {
  const { workspace, query, date, searchType = 'keyword' } = params;
  
  if (!workspace) {
    return { success: false, error: 'workspace 不能为空' };
  }
  
  try {
    const memoryDir = path.join(workspace, 'memory');
    
    if (!fs.existsSync(memoryDir)) {
      return { 
        success: true, 
        searchType,
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
      const dbPath = path.join(memoryDir, `${date}.db`);
      if (fs.existsSync(dbPath)) {
        files.push({ file: dbPath, date });
      }
    } else {
      const allFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.db'));
      for (const file of allFiles) {
        files.push({ 
          file: path.join(memoryDir, file), 
          date: file.replace('.db', '') 
        });
      }
    }
    
    // 热词统计
    if (searchType === 'hotwords') {
      const allContents = [];
      
      for (const { file, date: fileDate } of files) {
        const db = new sqlite3.Database(file);
        
        const rows = await new Promise((resolve, reject) => {
          db.all('SELECT content FROM memories', (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        for (const row of rows) {
          allContents.push(row.content);
        }
      }
      
      // 计算热词
      const hotwords = wordFrequency(allContents);
      
      return {
        success: true,
        searchType: 'hotwords',
        date: date || 'all',
        count: hotwords.length,
        hotwords
      };
    }
    
    // 搜索每个文件
    for (const { file, date: fileDate } of files) {
      const db = new sqlite3.Database(file);
      
      let rows = [];
      
      if (searchType === 'keyword') {
        // 关键词搜索
        rows = await new Promise((resolve, reject) => {
          db.all(
            `SELECT session_id, role, content, timestamp 
             FROM memories 
             WHERE content LIKE ?
             ORDER BY timestamp DESC
             LIMIT 50`,
            [`%${query}%`],
            (err, rows) => {
              db.close();
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
      } else if (searchType === 'ngram') {
        // N-gram 语义搜索
        const queryNgrams = ngram(query, 3);
        
        rows = await new Promise((resolve, reject) => {
          db.all(
            `SELECT session_id, role, content, timestamp FROM memories`,
            [],
            (err, allRows) => {
              db.close();
              if (err) {
                reject(err);
                return;
              }
              
              // 计算每条记录的 N-gram 匹配分数
              const scored = [];
              for (const row of allRows) {
                const contentNgrams = ngram(row.content, 3);
                let score = 0;
                for (const qn of queryNgrams) {
                  for (const cn of contentNgrams) {
                    if (cn.includes(qn) || qn.includes(cn)) {
                      score += 1;
                    }
                  }
                }
                if (score > 0) {
                  scored.push({ ...row, score });
                }
              }
              
              // 按分数排序
              scored.sort((a, b) => b.score - a.score);
              resolve(scored.slice(0, 50));
            }
          );
        });
      } else if (searchType === 'hybrid') {
        // 混合搜索：关键词 + N-gram
        const queryNgrams = ngram(query, 2);
        
        rows = await new Promise((resolve, reject) => {
          db.all(
            `SELECT session_id, role, content, timestamp FROM memories`,
            [],
            (err, allRows) => {
              db.close();
              if (err) {
                reject(err);
                return;
              }
              
              const scored = [];
              for (const row of allRows) {
                let score = 0;
                const content = row.content.toLowerCase();
                
                // 关键词匹配（高权重）
                if (content.includes(query.toLowerCase())) {
                  score += 10;
                }
                
                // N-gram 匹配（低权重）
                const contentNgrams = ngram(row.content, 2);
                for (const qn of queryNgrams) {
                  for (const cn of contentNgrams) {
                    if (cn.includes(qn) || qn.includes(cn)) {
                      score += 1;
                    }
                  }
                }
                
                if (score > 0) {
                  scored.push({ ...row, score });
                }
              }
              
              scored.sort((a, b) => b.score - a.score);
              resolve(scored.slice(0, 50));
            }
          );
        });
      }
      
      for (const row of rows) {
        results.push({
          date: fileDate,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          timestamp: row.timestamp,
          score: row.score
        });
      }
    }
    
    return {
      success: true,
      searchType,
      query: searchType === 'hotwords' ? undefined : query,
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

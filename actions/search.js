/**
 * Persistent Memory - Search Action
 * 搜索记忆的 Action
 * 
 * 触发关键词：搜索、查找、找一下、记得、之前说、刚才说
 */

const PersistentMemory = require('../scripts/memory.cjs');

/**
 * 搜索记忆
 * @param {Object} params - 参数
 * @param {string} params.query - 搜索关键词
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.sessionId - 会话 ID
 * @param {boolean} params.searchAll - 是否搜索所有记忆文件
 * @returns {Object} 搜索结果
 */
async function search(params) {
  const { query, workspace, sessionId, searchAll = false } = params;
  
  if (!query) {
    return { success: false, error: '搜索关键词不能为空' };
  }
  
  try {
    let results;
    
    if (searchAll) {
      results = PersistentMemory.searchAll(workspace, query);
    } else {
      const mem = new PersistentMemory({
        workspace,
        sessionId
      });
      results = await mem.search(query);
      await mem.close();
    }
    
    return {
      success: true,
      query,
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

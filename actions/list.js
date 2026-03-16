/**
 * Persistent Memory - List Action
 * 列出记忆的 Action
 * 
 * 触发关键词：列出、查看、看看、显示
 */

const PersistentMemory = require('../scripts/memory.cjs');

/**
 * 列出所有记忆
 * @param {Object} params - 参数
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.sessionId - 会话 ID
 * @returns {Object} 记忆列表
 */
async function list(params) {
  const { workspace, sessionId } = params;
  
  try {
    const mem = new PersistentMemory({
      workspace,
      sessionId
    });
    
    const results = await mem.list();
    await mem.close();
    
    return {
      success: true,
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

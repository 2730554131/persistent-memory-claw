/**
 * Persistent Memory - Save Action
 * 保存记忆的 Action
 * 
 * 触发关键词：记住、记录、保存、存一下、记下来、帮我记、别忘了、收藏
 */

const PersistentMemory = require('../scripts/memory.cjs');

/**
 * 保存记忆
 * @param {Object} params - 参数
 * @param {string} params.category - 分类（默认: default）
 * @param {string|Object} params.content - 要保存的内容
 * @param {string} params.workspace - 工作空间路径
 * @param {string} params.sessionId - 会话 ID
 * @returns {Object} 保存结果
 */
async function save(params) {
  const { category = 'default', content, workspace, sessionId } = params;
  
  if (!content) {
    return { success: false, error: '内容不能为空' };
  }
  
  try {
    const mem = new PersistentMemory({
      workspace,
      sessionId
    });
    
    const result = await mem.save(category, content);
    await mem.close();
    
    return {
      success: true,
      message: `已保存到 ${category}`,
      dbPath: mem.getDbPath(),
      sessionId: mem.getSessionId(),
      category,
      content
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { save };

/**
 * 搜索记忆 action
 * 用于在已保存的记忆中搜索关键词
 */
const { PersistentMemory } = require('../scripts/memory.cjs');

module.exports = {
  name: 'persistent_memory_search',
  description: '在已保存的记忆中搜索关键词',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词'
      }
    },
    required: ['query']
  },
  async run(params) {
    const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
    const mem = new PersistentMemory({ workspace });
    
    const { query } = params;
    
    try {
      const results = await mem.search(query);
      return {
        success: true,
        query: query,
        results: results,
        count: results.length
      };
    } finally {
      mem.close();
    }
  }
};

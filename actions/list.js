/**
 * 列出记忆 action
 * 用于查看所有已保存的记忆
 */
const { PersistentMemory } = require('../scripts/memory.cjs');

module.exports = {
  name: 'persistent_memory_list',
  description: '列出所有已保存的记忆',
  parameters: {
    type: 'object',
    properties: {}
  },
  async run() {
    const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
    const mem = new PersistentMemory({ workspace });
    
    try {
      const list = await mem.list();
      return {
        success: true,
        data: list,
        count: list.length
      };
    } finally {
      mem.close();
    }
  }
};

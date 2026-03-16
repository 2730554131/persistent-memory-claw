/**
 * 保存记忆 action
 * 用于将用户想要记住的内容保存到持久化存储
 */
const { PersistentMemory } = require('../scripts/memory.cjs');

module.exports = {
  name: 'persistent_memory_save',
  description: '保存记忆到持久化存储',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '要记住的内容'
      },
      category: {
        type: 'string',
        default: 'knowledgeBase',
        description: '记忆分类（可选，默认 knowledgeBase）'
      }
    },
    required: ['content']
  },
  async run(params) {
    const workspace = process.env.OPENCLAW_WORKSPACE || process.cwd();
    const mem = new PersistentMemory({ workspace });
    
    const { content, category = 'knowledgeBase' } = params;
    
    try {
      const id = await mem.save(category, content);
      return {
        success: true,
        message: '记忆已保存',
        id: id,
        content: content
      };
    } finally {
      mem.close();
    }
  }
};

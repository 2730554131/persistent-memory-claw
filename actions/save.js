/**
 * 自动安装依赖 - 从 package.json 读取所有依赖并自动安装
 */
const fs = require('fs');
const path = require('path');

function ensureDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  
  let deps = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    deps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ];
  } catch (e) {
    deps = ['sqlite3'];
  }
  
  for (const dep of deps) {
    try {
      require(dep);
    } catch (e) {
      console.log(`Auto-installing missing dependency: ${dep}...`);
      const { execSync } = require('child_process');
      try {
        execSync(`npm install ${dep}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      } catch (installError) {
        console.error(`Failed to install ${dep}`);
      }
    }
  }
}
ensureDependencies();

/**
 * 保存记忆 action
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

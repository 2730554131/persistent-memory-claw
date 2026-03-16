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

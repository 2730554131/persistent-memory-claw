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

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
 * 自动保存并重置会话 action
 * 当上下文使用比例达到阈值时，自动保存会话并重置
 */
const { main } = require('../scripts/auto-save.cjs');

module.exports = {
  name: 'persistent_memory_auto_save',
  description: '检查上下文使用比例，当达到阈值(默认80%)时自动保存会话并重置',
  parameters: {
    type: 'object',
    properties: {
      threshold: {
        type: 'number',
        default: 0.8,
        description: '触发保存的上下文使用比例阈值 (0-1)，默认 0.8'
      },
      autoReset: {
        type: 'boolean',
        default: true,
        description: '保存后是否自动创建新会话，默认 true'
      }
    }
  },
  async run(params) {
    const { threshold = 0.8, autoReset = true } = params;
    
    try {
      // 通过环境变量传递 autoReset 标志
      if (autoReset) {
        process.env.AUTO_RESET_SESSION = 'true';
      }
      
      const result = await main();
      
      return result;
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }
};

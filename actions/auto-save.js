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
 * 检查会话上下文使用情况并自动保存+重置会话 action
 * 当上下文使用比例达到阈值时，自动保存当前会话到记忆系统并创建新会话
 */
const { autoSaveAndReset } = require('../scripts/auto-save.cjs');

module.exports = {
  name: 'persistent_memory_auto_save',
  description: '检查上下文使用比例，当达到阈值(默认80%)时自动保存会话到记忆并创建新会话',
  parameters: {
    type: 'object',
    properties: {
      threshold: {
        type: 'number',
        default: 0.8,
        description: '触发自动保存的上下文使用比例阈值 (0-1)，默认 0.8 (80%)'
      },
      autoReset: {
        type: 'boolean',
        default: true,
        description: '是否在保存后自动创建新会话，默认 true'
      }
    }
  },
  async run(params) {
    const { threshold = 0.8, autoReset = true } = params;
    
    try {
      // 调用自动保存并重置函数
      const result = await autoSaveAndReset(threshold);
      
      if (result.success && result.action === 'saved_and_reset') {
        return {
          success: true,
          message: '✅ 会话已自动保存到记忆系统，并创建新会话',
          memoryId: result.memoryId,
          archivedPath: result.archivedPath,
          stats: result.stats
        };
      } else if (result.success && result.action === 'none') {
        return {
          success: true,
          message: '✅ 上下文使用率未达到阈值，无需操作',
          usageRatio: result.usageRatio,
          stats: result.stats
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error'
        };
      }
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }
};

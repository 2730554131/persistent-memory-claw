import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

interface HookEvent {
  type: string;
  action: string;
  sessionKey: string;
  timestamp: Date;
  messages: string[];
  context: {
    sessionFile?: string;
    sessionId?: string;
    workspaceDir?: string;
  };
}

/**
 * 本地简单摘要生成
 */
function generateLocalSummary(conversationText: string): string {
  const lines = conversationText.split('\n').filter(l => l.trim());
  const recent = lines.slice(-6);
  
  let summary = '摘要：';
  for (const line of recent) {
    if (line.startsWith('用户:')) {
      summary += ' ' + line.replace('用户:', '').substring(0, 30) + '...';
    }
  }
  
  return summary || '对话摘要';
}

/**
 * 手动保存 Hook
 * 当用户说"记住 XXX"时触发
 * 存储路径：memory/YYYY-MM-DD.db
 */
const handler = async (event: HookEvent): Promise<void> => {
  // 这个 Hook 现在是手动触发的占位符
  // 实际保存逻辑通过 actions/save.js 实现
  
  console.log('[persistent-memory] Hook loaded, use actions/save.js to save memories');
};

export default handler;

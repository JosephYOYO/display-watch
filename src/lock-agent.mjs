import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from './displays.mjs';
import { observe } from './monitor.mjs';
import { lockScreen, protect } from './lock.mjs';

const directory = process.env.DISPLAY_WATCH_HOME || path.join(os.homedir(), 'Library/Application Support/display-watch');
const helper = fileURLToPath(new URL('../bin/lock-screen', import.meta.url));
// 每次桌面会话/助手启动重新确认当前已接设备，避免重启后原有基线跳过保护。
const state = { events: [] };
const stateFile = path.join(directory, 'lock-state.json');
const save = () => {
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(`${stateFile}.tmp`, stateFile);
};
async function main() {
  const configPath = path.join(directory, 'config.json');
  if (fs.statSync(configPath).mode & 0o077) throw new Error('config_requires_chmod_600');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Number.isInteger(config.intervalSeconds) || config.intervalSeconds < 5 || !Number.isInteger(config.confirmSamples) || config.confirmSamples < 1 || !Array.isArray(config.ignoreIds) || (config.lockOnConnect !== undefined && typeof config.lockOnConnect !== 'boolean')) throw new Error('invalid_config');
  while (true) {
    let displays;
    try { displays = (await scan()).filter(d => !config.ignoreIds.includes(d.id)); }
    catch { console.error('scan_failed_previous_state_preserved'); }
    if (displays) {
      state.events.push(...observe(state, displays, config.confirmSamples));
      // 设备已确认拔出后不再为旧接入请求锁屏。
      for (const event of state.events) if (!state.current?.some(d => d.id === event.display.id)) event.lockStatus = 'disabled';
      state.events = state.events.slice(-100);
      save();
      await protect(state.events, config.lockOnConnect !== false, () => lockScreen(helper));
      state.lastScan = new Date().toISOString(); save();
    }
    await new Promise(resolve => setTimeout(resolve, config.intervalSeconds * 1000));
  }
}
main().catch(() => { console.error('lock_agent_failed_check_config_permissions_and_helper'); process.exitCode = 1; });

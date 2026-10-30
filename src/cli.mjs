#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { scan } from './displays.mjs';
import { observe, dispatch } from './monitor.mjs';
import { validateMail, sendMail } from './mail.mjs';
const command = process.argv[2] || 'status';
const directory = process.env.DISPLAY_WATCH_HOME || path.join(os.homedir(), 'Library/Application Support/display-watch');
const stateFile = path.join(directory, 'state.json');
const log = value => console.log(JSON.stringify({ time: new Date().toISOString(), ...value }));
async function main() {
  if (command === 'status') { console.log(JSON.stringify(await scan(), null, 2)); return; }
  if (command === 'history') { console.log(fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : '{}'); return; }
  if (!['watch', 'test-mail', 'once'].includes(command)) throw new Error('usage: status | history | watch | once | test-mail');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const configFile = path.join(directory, 'config.json');
  if (fs.statSync(configFile).mode & 0o077) throw new Error('config_requires_chmod_600');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  validateMail(config.mail);
  if (typeof config.machine !== 'string' || !config.machine.trim() || !Number.isInteger(config.intervalSeconds) || config.intervalSeconds < 5 || !Number.isInteger(config.confirmSamples) || config.confirmSamples < 1 || !Array.isArray(config.ignoreIds)) throw new Error('invalid_monitor_config');
  const lock = path.join(directory, 'process.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid < 1) throw new Error('invalid_lock_inspect_manually');
    try { process.kill(pid, 0); throw new Error('monitor_already_running'); }
    catch (e) { if (e.code !== 'ESRCH') throw e; fs.unlinkSync(lock); }
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  const release = () => { try { fs.unlinkSync(lock); } catch {} };
  process.once('exit', release);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => process.exit(0));
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { events: [] };
  for (const e of state.events) if (e.status === 'sending') e.status = 'unknown';
  delete state.candidate; delete state.samples;
  const save = () => { fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(`${stateFile}.tmp`, stateFile); };
  save();
  if (command === 'test-mail') {
    const displays = await scan();
    state.events.push({ id: randomUUID(), kind: 'test', time: new Date().toISOString(), display: displays[0] || { name: '无显示器' }, status: 'pending', attempts: 0 });
    save(); await dispatch(state, config, save, sendMail); log(state.events.at(-1));
    if (state.events.at(-1).status !== 'accepted') process.exitCode = 1;
    return;
  }
  do {
    try {
      const displays = (await scan()).filter(d => !config.ignoreIds.includes(d.id));
      const events = observe(state, displays, config.confirmSamples);
      state.events.push(...events); state.lastScan = new Date().toISOString(); save();
      events.forEach(log);
    } catch { log({ error: 'scan_failed_previous_state_preserved' }); }
    await dispatch(state, config, save, sendMail);
    if (command === 'once') break;
    await new Promise(resolve => setTimeout(resolve, config.intervalSeconds * 1000));
  } while (true);
}
main().catch(e => { log({ error: ['monitor_already_running', 'config_requires_chmod_600', 'invalid_monitor_config', 'invalid_mail_config', 'invalid_lock_inspect_manually'].includes(e.message) ? e.message : 'command_failed_check_config_and_permissions' }); process.exitCode = 1; });

import { randomUUID } from 'node:crypto';
import { key, changes } from './displays.mjs';
export function observe(state, displays, confirmations, time = new Date().toISOString()) {
  if (key(state.candidate ?? []) !== key(displays) || state.samples === undefined) { state.candidate = displays; state.samples = 1; }
  else state.samples++;
  if (state.samples < confirmations) return [];
  const events = state.current === undefined
    ? displays.map(display => ({ kind: 'baseline', display })) : changes(state.current, displays);
  state.current = displays;
  return events.map(e => ({ ...e, id: randomUUID(), time, status: 'pending', attempts: 0 }));
}
export async function dispatch(state, config, save, send, now = Date.now()) {
  for (const event of state.events) {
    if (event.status !== 'pending' || (event.nextAttempt ?? 0) > now) continue;
    // 先落盘再发出；崩溃或超时的发送结果未知，不自动重放。
    event.status = 'sending'; event.attempts++; save();
    Object.assign(event, await send(config, event));
    if (event.status === 'failed' && event.attempts < 5) {
      event.status = 'pending'; event.nextAttempt = now + Math.min(3600000, 60000 * 2 ** event.attempts);
    }
    save();
  }
}

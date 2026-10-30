import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function lockScreen(helper, execute = exec) {
  try {
    const { stdout } = await execute(helper, ['--lock'], { timeout: 8000 });
    return stdout.trim() === 'locked' ? 'locked' : 'failed';
  } catch { return 'failed'; }
}
export async function protect(events, enabled, lock) {
  const pending = events.filter(e => ['connected', 'baseline'].includes(e.kind) && !['locked', 'disabled'].includes(e.lockStatus) && (e.lockAttempts ?? 0) < 3);
  if (!pending.length) return;
  const result = enabled ? await lock() : 'disabled';
  for (const event of pending) {
    event.lockAttempts = (event.lockAttempts ?? 0) + 1;
    event.lockStatus = result;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { lockScreen, protect } from '../src/lock.mjs';
import { observe } from '../src/monitor.mjs';

test('接入/启动触发锁屏，拔出和测试邮件不触发；成功后不重复锁定', async () => {
  const events = ['connected', 'baseline', 'disconnected', 'test'].map(kind => ({ kind }));
  let calls = 0;
  await protect(events, true, async () => { calls++; return 'locked'; });
  assert.equal(calls, 1);
  assert.equal(events[0].lockStatus, 'locked');
  assert.equal(events[1].lockStatus, 'locked');
  assert.equal(events[2].lockStatus, undefined);
  assert.equal(events[3].lockStatus, undefined);
  await protect(events, true, async () => { calls++; });
  assert.equal(calls, 1);
});
test('锁屏失败最多尝试三次，禁用不调用；返回值必须确认系统锁定', async () => {
  const events = [{ kind: 'connected' }]; let calls = 0;
  for (let i = 0; i < 5; i++) await protect(events, true, async () => { calls++; return 'failed'; });
  assert.equal(calls, 3); assert.equal(events[0].lockStatus, 'failed');
  await protect([{ kind: 'connected' }], false, async () => { throw new Error('disabled'); });
  assert.equal(await lockScreen('helper', async () => ({ stdout: 'locked\n' })), 'locked');
  assert.equal(await lockScreen('helper', async () => ({ stdout: 'lock_not_confirmed' })), 'failed');
  assert.equal(await lockScreen('helper', async () => { throw new Error('timeout'); }), 'failed');
});
test('助手重启后仍对已接设备建立保护基线，与邮件历史无关', async () => {
  const display = { id: 'studio' };
  for (let restart = 0; restart < 2; restart++) {
    const state = { events: [] };
    observe(state, [display], 2);
    const events = observe(state, [display], 2);
    await protect(events, true, async () => 'locked');
    assert.equal(events[0].kind, 'baseline');
    assert.equal(events[0].lockStatus, 'locked');
  }
});

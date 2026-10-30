import test from 'node:test';
import assert from 'node:assert/strict';
import { observe, dispatch } from '../src/monitor.mjs';
import { parseDisplays } from '../src/displays.mjs';
import { sendMail, render } from '../src/mail.mjs';
const display = { id: '610:ae42:example', name: 'Studio Display', resolution: '5120 x 2880' };
test('连续样本防抖、首次已连接报警、接入拔出、重复采样不重发', () => {
  const s = { events: [] };
  assert.equal(observe(s, [display], 2).length, 0);
  assert.equal(observe(s, [display], 2)[0].kind, 'baseline');
  assert.equal(observe(s, [display], 2).length, 0);
  assert.equal(observe(s, [], 2).length, 0);
  assert.equal(observe(s, [display], 2).length, 0);
  observe(s, [], 2);
  assert.equal(observe(s, [], 2)[0].kind, 'disconnected');
  observe(s, [display], 2);
  assert.equal(observe(s, [display], 2)[0].kind, 'connected');
});
test('无头基线、持久状态恢复后识别新增', () => {
  const s = { events: [] }; observe(s, [], 1);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(observe(restored, [display], 1)[0].kind, 'connected');
});
test('签名请求、邮件转义、服务接受、拒绝和不确定结果', async () => {
  const config = { machine: '<mini>', mail: { region: 'ap-southeast-1', from: 'sender@example.com', to: 'user@example.com', accessKeyId: 'test', accessKeySecret: 'test' } };
  const event = { kind: 'test', display, id: 'event-1', time: '2026-10-30T00:00:00Z' };
  assert.ok(render(event, config.machine).html.includes('&lt;mini&gt;'));
  const result = await sendMail(config, event, async (url, options) => {
    assert.equal(url, 'https://dm.ap-southeast-1.aliyuncs.com/');
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('Action'), 'SingleSendMail'); assert.ok(body.get('Signature'));
    return { ok: true, status: 200, json: async () => ({ EnvId: 'message-1' }) };
  });
  assert.equal(result.status, 'accepted');
  assert.equal((await sendMail(config, event, async () => { throw new Error('timeout'); })).status, 'unknown');
  assert.equal((await sendMail(config, event, async () => ({ ok: false, status: 400, json: async () => ({ Code: 'InvalidAccountName' }) }))).status, 'failed');
});
test('发送前持久化、未知状态不重试、失败延迟重试', async () => {
  const s = { events: [{ status: 'pending', attempts: 0 }] }; const saved = [];
  const save = () => saved.push(JSON.parse(JSON.stringify(s)));
  let calls = 0;
  await dispatch(s, {}, save, async () => { calls++; return { status: 'unknown' }; }, 0);
  assert.equal(saved[0].events[0].status, 'sending');
  await dispatch(s, {}, save, async () => { calls++; }, 1000000);
  assert.equal(calls, 1);
  s.events.push({ status: 'pending', attempts: 0 });
  await dispatch(s, {}, save, async () => ({ status: 'failed' }), 0);
  assert.equal(s.events[1].nextAttempt, 120000);
  await dispatch(s, {}, save, async () => { throw new Error('too early'); }, 100);
  await dispatch(s, {}, save, async () => ({ status: 'accepted' }), 120000);
  assert.equal(s.events[1].status, 'accepted');
});
test('显示器解析不会把 GPU 当显示器；分辨率变化不产生插拔', () => {
  assert.deepEqual(parseDisplays({ SPDisplaysDataType: [{ _name: 'Apple M5' }] }), []);
  assert.throws(() => parseDisplays({}));
  const fixture = { SPDisplaysDataType: [{ spdisplays_ndrvs: [{ _name: 'Studio Display', '_spdisplays_display-vendor-id': '610', '_spdisplays_display-product-id': 'ae42', '_spdisplays_display-serial-number': 'example' }] }] };
  assert.equal(parseDisplays(fixture)[0].id, display.id);
  const s = {}; observe(s, [display], 1);
  assert.equal(observe(s, [{ ...display, resolution: 'other' }], 1).length, 0);
});

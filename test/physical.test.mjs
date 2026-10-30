import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhysicalSnapshot, enrichPhysical, changes, scan } from '../src/displays.mjs';
import { observe, dispatch, migrateDetector } from '../src/monitor.mjs';
import { protect } from '../src/lock.mjs';
const display = { id: 'iokit:IOService:external:1:2:3', registryPath: 'IOService:external', classification: 'physical', vendor: '1', product: '2', serial: '3', name: 'Physical monitor', resolution: '1920 x 1080' };
const hardware = displays => ({schemaVersion: 1, backend: 'apple-silicon-iokit', displays, errors: []});

test('headless monitoring never invokes system_profiler or waits for optional software metadata', async () => {
  let calls=0;
  const result = await scan(async (command, args) => {
    calls++;
    assert.notEqual(command, '/usr/sbin/system_profiler');
    assert.deepEqual(args,['--displays']);
    return {stdout:JSON.stringify(hardware([]))};
  });
  assert.deepEqual(result,[]); assert.equal(calls,1);
});

test('software-only screens with valid or spoofed product IDs cannot trigger email or locking', async () => {
  for (const physical of [[], [display]]) {
    const software = [{...display, id: 'software-only', name: 'RustDesk-style virtual display'}, {id:'other',vendor:'4',product:'5',serial:'6'}];
    const result = enrichPhysical(parsePhysicalSnapshot(hardware(physical)), software);
    assert.deepEqual(changes(physical, result), []);
    const state = {current:physical, events:[]};
    observe(state, result, 2);
    state.events.push(...observe(state, result, 2));
    await protect(state.events, true, async () => assert.fail('virtual screen locked desktop'));
    await dispatch(state, {}, () => {}, async () => assert.fail('virtual screen sent email'));
    assert.equal(state.events.length, 0);
  }
});
test('physical connection remains actionable with virtual screens present; enrichment cannot replace identity', async () => {
  const physical = parsePhysicalSnapshot(hardware([display]));
  const enriched = enrichPhysical(physical, [{...display, name:'Virtual spoof', id:'virtual', resolution:'1280 x 720'}]);
  assert.equal(enriched[0].id, display.id);
  assert.equal(enriched[0].name, 'Physical monitor');
  const state={current:[],events:[]}; observe(state,enriched,2);
  state.events.push(...observe(state,enriched,2));
  let locks=0, emails=0;
  await protect(state.events,true,async()=>{locks++;return 'locked'});
  await dispatch(state,{},()=>{},async()=>{emails++;return {status:'accepted'}});
  assert.equal(locks,1); assert.equal(emails,1);
});
test('unsupported registry or incomplete hardware information fails explicitly instead of reporting no displays', () => {
  assert.throws(()=>parsePhysicalSnapshot({...hardware([]),errors:['unsupported_hardware_registry']}), /physical_detection_failed/);
  assert.throws(()=>parsePhysicalSnapshot({...hardware([]),errors:['external_service_without_display_attributes']}), /physical_detection_failed/);
  assert.throws(()=>parsePhysicalSnapshot(hardware([{...display,classification:'virtual'}])), /invalid_physical_display/);
});
test('upgrade suppresses old virtual pending mail and resets software baseline without replaying unknown sends', () => {
  const state={current:[{id:'virtual'}],candidate:[],samples:2,events:[{status:'pending'},{status:'accepted'},{status:'sending'}]};
  migrateDetector(state);
  assert.equal(state.current,undefined);
  assert.deepEqual(state.events.map(e=>e.status),['suppressed','accepted','unknown']);
  assert.deepEqual(observe(state,[],1),[]);
  state.current=[display];migrateDetector(state);
  assert.deepEqual(state.current,[display]);
});

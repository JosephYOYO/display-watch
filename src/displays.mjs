import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export function parseDisplays(data) {
  if (!Array.isArray(data.SPDisplaysDataType)) throw new Error('invalid_display_snapshot');
  return data.SPDisplaysDataType.flatMap(gpu => (gpu.spdisplays_ndrvs ?? []).map(d => {
    const vendor = d['_spdisplays_display-vendor-id'] ?? '';
    const product = d['_spdisplays_display-product-id'] ?? '';
    const serial = d['_spdisplays_display-serial-number'] ?? d['spdisplays_display-serial-number'] ?? '';
    return { id: [vendor, product, serial || d._spdisplays_displayID || d._name].join(':'),
      name: d._name || 'Unknown display', vendor, product, serial,
      resolution: d._spdisplays_pixels || d._spdisplays_resolution || '',
      classification: vendor && product ? 'hardware-reported' : 'unclassified' };
  })).sort((a, b) => a.id.localeCompare(b.id));
}
export function parsePhysicalSnapshot(snapshot) {
  if (snapshot.schemaVersion !== 1 || snapshot.backend !== 'apple-silicon-iokit' || !Array.isArray(snapshot.displays) || !Array.isArray(snapshot.errors)) throw new Error('invalid_physical_snapshot');
  if (snapshot.errors.length) throw new Error(`physical_detection_failed:${snapshot.errors.join(',')}`);
  for (const d of snapshot.displays) {
    if (d.classification !== 'physical' || typeof d.registryPath !== 'string' || !d.registryPath.startsWith('IOService:') || !d.id?.startsWith('iokit:')) throw new Error('invalid_physical_display');
  }
  return snapshot.displays;
}
export function enrichPhysical(physical, software) {
  return physical.map(d => {
    const matches = software.filter(s => s.vendor === d.vendor && s.product === d.product && s.serial === d.serial);
    return matches.length === 1 && matches[0].resolution ? { ...d, resolution: matches[0].resolution } : d;
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export async function snapshot(execute = exec, includeSoftware = true) {
  const installed = fileURLToPath(new URL('../bin/lock-screen', import.meta.url));
  const built = fileURLToPath(new URL('../.build/lock-screen', import.meta.url));
  const helper = fs.existsSync(installed) ? installed : built;
  let stdout;
  try { ({ stdout } = await execute(helper, ['--displays'], { timeout: 10000, maxBuffer: 1024 * 1024 })); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('native_helper_missing_run_npm_run_build');
    throw error;
  }
  const hardware = JSON.parse(stdout);
  const physical = parsePhysicalSnapshot(hardware);
  if (!includeSoftware) return { ...hardware, displays: enrichPhysical(physical, []) };
  let software = [], enrichmentError = null;
  try {
    const result = await execute('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 });
    software = parseDisplays(JSON.parse(result.stdout));
  } catch { enrichmentError = 'software_metadata_unavailable'; }
  return { ...hardware, displays: enrichPhysical(physical, software), enrichmentError,
    unverifiedSoftwareDisplays: software.filter(s => !physical.some(d => d.vendor === s.vendor && d.product === s.product && d.serial === s.serial)) };
}
// Monitoring must never wait on optional profiler metadata (which may hang while headless).
export async function scan(execute = exec) { return (await snapshot(execute, false)).displays; }
export const key = displays => JSON.stringify(displays.map(d => d.id).sort());
export function changes(before, after) {
  return [...after.filter(d => !before.some(b => b.id === d.id)).map(display => ({ kind: 'connected', display })),
    ...before.filter(d => !after.some(a => a.id === d.id)).map(display => ({ kind: 'disconnected', display }))];
}

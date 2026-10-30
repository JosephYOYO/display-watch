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
      name: d._name || 'Unknown display', vendor, product,
      resolution: d._spdisplays_pixels || d._spdisplays_resolution || '',
      classification: vendor && product ? 'hardware-reported' : 'unclassified' };
  })).sort((a, b) => a.id.localeCompare(b.id));
}
export async function scan() {
  const { stdout } = await exec('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  return parseDisplays(JSON.parse(stdout));
}
export const key = displays => JSON.stringify(displays.map(d => d.id).sort());
export function changes(before, after) {
  return [...after.filter(d => !before.some(b => b.id === d.id)).map(display => ({ kind: 'connected', display })),
    ...before.filter(d => !after.some(a => a.id === d.id)).map(display => ({ kind: 'disconnected', display }))];
}

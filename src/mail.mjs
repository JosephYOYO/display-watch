import { signAliyunRpc } from './signature.mjs';
const regions = { 'ap-southeast-1': ['https://dm.ap-southeast-1.aliyuncs.com/', '2015-11-23'], 'cn-hangzhou': ['https://dm.aliyuncs.com/', '2015-11-23'] };
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateMail(m) {
  if (!m || !regions[m.region] || !m.accessKeyId || !m.accessKeySecret || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.from)) throw new Error('invalid_mail_config');
}
export function render(event, machine) {
  const label = { connected: '显示器接入', disconnected: '显示器断开', baseline: '监控启动：当前显示器', test: '测试邮件（非真实插拔）' }[event.kind];
  const text = `${machine} — ${label}\n\n检测时间：${event.time}\n显示器：${event.display.name}\n分辨率：${event.display.resolution || '未知'}\n事件：${event.id}\n\n这是系统检测记录，不代表有人正在观看屏幕。首次启动记录当前状态；停机期间的插拔无法追溯。`;
  return { subject: `[Display Watch] ${machine} · ${label}`, text,
    html: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#fff;color:#595d60;font-family:Arial,'PingFang SC',sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:56px 24px"><table role="presentation" style="max-width:560px;width:100%"><tr><td style="font-size:32px;color:#111;padding-bottom:48px">Display Watch</td></tr><tr><td style="font-size:16px;line-height:1.8;white-space:pre-wrap">${escape(text)}</td></tr></table></td></tr></table></body></html>` };
}
export async function sendMail(config, event, fetchImpl = fetch) {
  validateMail(config.mail);
  const m = config.mail, [endpoint, version] = regions[m.region], content = render(event, config.machine);
  try {
    const res = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: signAliyunRpc({ accessKeyId: m.accessKeyId, accessKeySecret: m.accessKeySecret, securityToken: m.securityToken,
        params: { Action: 'SingleSendMail', Version: version, RegionId: m.region, AccountName: m.from, AddressType: 1,
          ReplyToAddress: 'false', FromAlias: 'Display Watch', ToAddress: m.to, Subject: content.subject, HtmlBody: content.html, TextBody: content.text, ClickTrace: '0' } }) });
    const data = await res.json();
    if (res.status >= 500) return { status: 'unknown' };
    if (!res.ok || (data.Code && data.Code !== 'OK')) return { status: 'failed', code: /^[\w.-]{1,100}$/.test(data.Code) ? data.Code : 'provider_error' };
    return typeof data.EnvId === 'string' && /^[\w-]{1,128}$/.test(data.EnvId) ? { status: 'accepted', messageId: data.EnvId } : { status: 'unknown' };
  } catch (error) {
    // DNS 或连接建立前失败可以重试；超时/断流无法确定服务端是否收到了请求。
    if (['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(error.cause?.code)) return { status: 'failed', code: 'connect_failed' };
    return { status: 'unknown' };
  }
}

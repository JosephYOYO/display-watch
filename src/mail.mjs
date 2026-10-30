import { signAliyunRpc } from './signature.mjs';
import nodemailer from 'nodemailer';
const regions = { 'ap-southeast-1': ['https://dm.ap-southeast-1.aliyuncs.com/', '2015-11-23'], 'cn-hangzhou': ['https://dm.aliyuncs.com/', '2015-11-23'] };
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const mailProvider = m => m?.provider ?? (m?.accessKeyId && !m?.smtp ? 'aliyun' : 'smtp');
export function validateMail(m) {
  const email = value => typeof value === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
  if (!m || !email(m.to) || !email(m.from)) throw new Error('invalid_mail_config');
  if (mailProvider(m) === 'aliyun') {
    if (!regions[m.region] || !m.accessKeyId || !m.accessKeySecret) throw new Error('invalid_mail_config');
  } else if (mailProvider(m) === 'smtp') {
    const s = m.smtp;
    if (!s || typeof s.host !== 'string' || !s.host || /[\s/@]/.test(s.host) || !Number.isInteger(s.port) || s.port < 1 || s.port > 65535 || typeof s.secure !== 'boolean') throw new Error('invalid_mail_config');
    if (s.auth !== undefined && (typeof s.auth?.user !== 'string' || !s.auth.user || typeof s.auth?.pass !== 'string' || !s.auth.pass)) throw new Error('invalid_mail_config');
    if (s.servername !== undefined && (typeof s.servername !== 'string' || !s.servername || /[\s/@]/.test(s.servername))) throw new Error('invalid_mail_config');
  } else throw new Error('invalid_mail_config');
}
export function render(event, machine) {
  const label = { connected: '显示器接入', disconnected: '显示器断开', baseline: '监控启动：当前显示器', test: '测试邮件（非真实插拔）' }[event.kind];
  const text = `${machine} — ${label}\n\n检测时间：${event.time}\n显示器：${event.display.name}\n分辨率：${event.display.resolution || '未知'}\n事件：${event.id}\n\n这是系统检测记录，不代表有人正在观看屏幕。首次启动记录当前状态；停机期间的插拔无法追溯。`;
  return { subject: `[Display Watch] ${machine} · ${label}`, text,
    html: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#fff;color:#595d60;font-family:Arial,'PingFang SC',sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:56px 24px"><table role="presentation" style="max-width:560px;width:100%"><tr><td style="font-size:32px;color:#111;padding-bottom:48px">Display Watch</td></tr><tr><td style="font-size:16px;line-height:1.8;white-space:pre-wrap">${escape(text)}</td></tr></table></td></tr></table></body></html>` };
}
export async function sendMail(config, event, fetchImpl = fetch) {
  validateMail(config.mail);
  if (mailProvider(config.mail) === 'smtp') return sendSmtp(config, event);
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

export async function sendSmtp(config, event, createTransport = nodemailer.createTransport) {
  validateMail(config.mail);
  const m = config.mail, smtp = m.smtp, content = render(event, config.machine);
  let transport;
  try {
    transport = createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure,
      requireTLS: !smtp.secure, auth: smtp.auth,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(smtp.servername ? { servername: smtp.servername } : {}) },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000, dnsTimeout: 10000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
    const info = await transport.sendMail({ from: { name: 'Display Watch', address: m.from }, to: m.to,
      subject: content.subject, text: content.text, html: content.html,
      messageId: `<${event.id}@display-watch.local>` });
    if (info.accepted?.some(address => String(address).toLowerCase() === m.to.toLowerCase())) return { status: 'accepted', provider: 'smtp', messageId: info.messageId };
    if (info.rejected?.length) return { status: 'failed', provider: 'smtp', code: 'smtp_recipient_rejected' };
    return { status: 'unknown', provider: 'smtp' };
  } catch (error) {
    // Never expose SMTP replies (which can contain account details). Lost DATA acknowledgements are not replayable.
    const rejected = Number.isInteger(error.responseCode) && error.responseCode >= 400 && error.responseCode <= 599;
    const beforeData = ['EDNS', 'EAUTH', 'ETLS'].includes(error.code)
      || ['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(error.timeoutType)
      || /^(EHLO|HELO|STARTTLS|AUTH(?: |$)|MAIL FROM|RCPT TO)/.test(error.command ?? '');
    return { status: rejected || beforeData ? 'failed' : 'unknown', provider: 'smtp',
      code: rejected ? `smtp_${error.responseCode}` : /^[A-Z_]{2,30}$/.test(error.code) ? error.code : 'smtp_error' };
  } finally { transport?.close(); }
}

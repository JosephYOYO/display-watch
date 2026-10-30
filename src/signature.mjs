import { createHmac, randomUUID } from 'node:crypto';

const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

// 阿里云 RPC v1 签名：参数只放HTTPS请求体，不把凭据、收件人或验证码放到URL。
export function signAliyunRpc({ params, accessKeyId, accessKeySecret, securityToken, now = new Date(), nonce = randomUUID() }) {
  const values = {
    ...params, Format: params.Format ?? 'JSON', AccessKeyId: accessKeyId, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0',
    SignatureNonce: nonce, Timestamp: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...(securityToken ? { SecurityToken: securityToken } : {}),
  };
  delete values.Signature;
  const canonical = Object.keys(values).sort().map(key => `${encode(key)}=${encode(values[key])}`).join('&');
  const signature = createHmac('sha1', `${accessKeySecret}&`).update(`POST&%2F&${encode(canonical)}`).digest('base64');
  return `${canonical}&Signature=${encode(signature)}`;
}

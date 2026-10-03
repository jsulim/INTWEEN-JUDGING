import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export function sha256(data: Uint8Array | string) {
  return createHash('sha256').update(data).digest('hex')
}

function key() {
  const k = process.env.PAYMENT_ENC_KEY
  if (!k) throw new Error('PAYMENT_ENC_KEY 가 설정되지 않았습니다.')
  const buf = Buffer.from(k, 'base64')
  if (buf.length !== 32) throw new Error('PAYMENT_ENC_KEY 는 32바이트 base64 여야 합니다.')
  return buf
}

/** 계좌·주민등록번호 컬럼 암호화 (AES-256-GCM). 형식: v1:iv:tag:ciphertext (base64) */
export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

export function decrypt(token: string) {
  const [v, iv, tag, data] = token.split(':')
  if (v !== 'v1') throw new Error('unknown cipher version')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

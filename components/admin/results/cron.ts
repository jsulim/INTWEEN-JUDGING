import 'server-only'
import { ApiError } from '@/lib/server/auth'

/** Vercel Cron: Authorization: Bearer ${CRON_SECRET} */
export function assertCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new ApiError(503, 'CRON_SECRET 이 설정되지 않았습니다.')
  if (req.headers.get('authorization') !== `Bearer ${secret}`) throw new ApiError(401, 'unauthorized')
}

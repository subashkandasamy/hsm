import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

function getRedis(): Redis | null {
  if (_redis) return _redis
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  _redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  return _redis
}

const DEFAULT_TTL = 300 // 5 minutes

export function catalogKey(tenantId: string, resource: string): string {
  return `hms:${tenantId}:catalog:${resource}`
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<T>(key)
  } catch {
    return null
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch {
    // cache miss is never fatal
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(key)
  } catch {
    // ignore
  }
}

/** Invalidate all catalog keys for a tenant (e.g. after editing a drug or lab test). */
export async function invalidateTenantCatalog(tenantId: string, resource: string): Promise<void> {
  await cacheDel(catalogKey(tenantId, resource))
}

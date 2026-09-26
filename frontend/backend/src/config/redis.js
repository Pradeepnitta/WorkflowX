import Redis from 'ioredis'

let redisClient = null
const inMemoryCache = new Map()

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
let isConnected = false

try {
    redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
    })

    redisClient.on('connect', () => {
        isConnected = true
    })

    redisClient.on('error', () => {
        isConnected = false
    })

    redisClient.connect().catch(() => {
        isConnected = false
    })
} catch {
    isConnected = false
}

export async function cacheGet(key) {
    if (isConnected && redisClient) {
        try {
            const data = await redisClient.get(key)
            return data ? JSON.parse(data) : null
        } catch {
            // fallback to memory
        }
    }
    const cached = inMemoryCache.get(key)
    if (cached) {
        if (cached.expiry && Date.now() > cached.expiry) {
            inMemoryCache.delete(key)
            return null
        }
        return cached.value
    }
    return null
}

export async function cacheSet(key, value, ttlSeconds = 300) {
    if (isConnected && redisClient) {
        try {
            await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds)
            return
        } catch {
            // fallback to memory
        }
    }
    inMemoryCache.set(key, {
        value,
        expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    })
}

export async function cacheDel(key) {
    if (isConnected && redisClient) {
        try {
            await redisClient.del(key)
        } catch {
            // ignore
        }
    }
    inMemoryCache.delete(key)
}

export async function checkRedisHealth() {
    if (isConnected && redisClient) {
        try {
            const ping = await redisClient.ping()
            if (ping === 'PONG') {
                return { status: 'connected' }
            }
        } catch {
            // fallback status
        }
    }
    return { status: 'connected (in-memory fallback)' }
}

export function getRedisClient() {
    return isConnected ? redisClient : null
}

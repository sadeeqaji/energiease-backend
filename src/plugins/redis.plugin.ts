import { env } from '@/config';
import fp from 'fastify-plugin';
import { createClient, type RedisClientType } from 'redis';

declare module 'fastify' {
    interface FastifyInstance {
        redis: {
            /**
             * Set a key-value pair with optional TTL and NX (Not Exists) flag
             * @returns 'OK' if set, null if NX was specified and key already exists
             */
            set: (
                key: string,
                value: string,
                options?: { ttl?: number; nx?: boolean }
            ) => Promise<'OK' | null>;
            get: (key: string) => Promise<string | null>;
            exists: (key: string) => Promise<boolean>;
            expire: (key: string, seconds: number) => Promise<boolean>;
            del: (key: string | string[]) => Promise<number>;
            incr: (key: string) => Promise<number>;

            disconnect: () => Promise<void>;
            isConnected: () => boolean;
        };
    }
}

export default fp(async (fastify) => {
    const isProduction = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
    const redisConfig = {
        url: isProduction ? env.AZURE_REDIS_CONNECTIONSTRING : env.REDIS_CONNECTION_STRING,
        socket: {
            tls: true,
            connectTimeout: isProduction ? 15000 : 5000,
            servername: 'redis-energiease-prod-weu.redis.cache.windows.net',
            reconnectStrategy: (retries: number) =>
                Math.min(retries * (isProduction ? 200 : 100), isProduction ? 10000 : 5000)
        },
        password: env.REDIS_ACCESS_KEY,
        pingInterval: isProduction ? 15000 : 30000
    };

    console.log(redisConfig, 'redisConfig')

    const client: RedisClientType = createClient(redisConfig);

    client.on('error', (err) => fastify.log.error(`Redis error: ${err}`));
    client.on('connect', () => fastify.log.info('Connecting to Redis...'));
    client.on('ready', () => fastify.log.info('✅ Redis connected'));
    client.on('reconnecting', () => fastify.log.warn('Redis reconnecting...'));
    client.on('end', () => fastify.log.warn('Redis connection closed'));

    try {
        await client.connect();
    } catch (err) {
        fastify.log.error('❌ Redis connection failed:', err);
        throw new Error('Failed to connect to Redis');
    }

    fastify.decorate('redis', {

        set: async (key: string, value: string, options?: { ttl?: number; nx?: boolean }) => {
            try {
                if (options?.nx) {
                    const result = await client.set(key, value, {
                        NX: true,
                        ...(options?.ttl && { EX: options.ttl })
                    });
                    return result === 'OK' ? 'OK' : null;
                }
                const result = await client.set(key, value, options?.ttl ? { EX: options.ttl } : undefined);
                return result === 'OK' ? 'OK' : null;
            } catch (err) {
                fastify.log.error(`Redis SET error for key ${key}:`, err);
                throw err;
            }
        },

        get: async (key: string) => {
            try {
                return client.get(key);
            } catch (err) {
                fastify.log.error(`Redis GET error for key ${key}:`, err);
                throw err;
            }
        },

        exists: async (key: string) => {
            try {
                const count = await client.exists(key);
                return count === 1;
            } catch (err) {
                fastify.log.error(`Redis EXISTS error for key ${key}:`, err);
                throw err;
            }
        },

        expire: async (key: string, seconds: number) => {
            try {
                const result = await client.expire(key, seconds);
                return result;
            } catch (err) {
                fastify.log.error(`Redis EXPIRE error for key ${key}:`, err);
                throw err;
            }
        },

        incr: async (key: string) => {
            try {
                return await client.incr(key);
            } catch (err) {
                fastify.log.error(`Redis INCR error for key ${key}:`, err);
                throw err;
            }
        },

        del: async (keys: string | string[]) => {
            try {
                return client.del(keys);
            } catch (err) {
                fastify.log.error(`Redis DEL error for keys ${keys}:`, err);
                throw err;
            }
        },

        disconnect: async () => {
            try {
                await client.quit();
            } catch (err) {
                fastify.log.error('Redis disconnect error:', err);
            }
        },

        isConnected: () => client.isReady
    });

    // Close connection when Fastify shuts down
    fastify.addHook('onClose', async () => {
        await fastify.redis.disconnect();
    });
}, {
    name: 'redis',
});
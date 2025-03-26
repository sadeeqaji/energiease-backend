// src/plugins/redis.plugin.ts
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
            del: (key: string | string[]) => Promise<number>;
            disconnect: () => Promise<void>;
            isConnected: () => boolean;
        };
    }
}

export default fp(async (fastify) => {
    const client: RedisClientType = createClient({
        url: env.REDIS_CONNECTION_STRING,
        password: env.REDIS_ACCESS_KEY,
        socket: {
            tls: true,
            connectTimeout: 5000,
            reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
        },
        pingInterval: 30000
    });

    // Error handling
    client.on('error', (err) => fastify.log.error(`Redis error: ${err}`));
    client.on('connect', () => fastify.log.info('Connecting to Redis...'));
    client.on('ready', () => fastify.log.info('✅ Redis connected'));
    client.on('reconnecting', () => fastify.log.warn('Redis reconnecting...'));
    client.on('end', () => fastify.log.warn('Redis connection closed'));

    // Connect to Redis
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
                        ...(options?.ttl && { EX: options.ttl }) // Add EX if ttl provided
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
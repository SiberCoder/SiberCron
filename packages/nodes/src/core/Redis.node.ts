import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Redis node — interact with a Redis server.
 * Supports common Redis operations: get, set, del, keys, publish, etc.
 * Uses ioredis which should already be available as a dependency from BullMQ.
 */
export const RedisNode: INodeType = {
  definition: {
    displayName: 'Redis',
    name: 'sibercron.redis',
    icon: 'Database',
    color: '#DC382D',
    group: 'data',
    version: 1,
    description: 'Read, write, and manage data in Redis',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'redisConnection', required: false, displayName: 'Redis Connection' },
    ],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'get',
        required: true,
        description: 'Redis operation to perform',
        options: [
          { name: 'Get', value: 'get' },
          { name: 'Set', value: 'set' },
          { name: 'Delete', value: 'del' },
          { name: 'Exists', value: 'exists' },
          { name: 'Keys (pattern)', value: 'keys' },
          { name: 'Increment', value: 'incr' },
          { name: 'Hash Get', value: 'hget' },
          { name: 'Hash Set', value: 'hset' },
          { name: 'Hash Get All', value: 'hgetall' },
          { name: 'List Push', value: 'lpush' },
          { name: 'List Range', value: 'lrange' },
          { name: 'Set Add', value: 'sadd' },
          { name: 'Set Members', value: 'smembers' },
          { name: 'Publish', value: 'publish' },
          { name: 'TTL', value: 'ttl' },
          { name: 'Expire', value: 'expire' },
        ],
      },
      {
        name: 'key',
        displayName: 'Key / Pattern',
        type: 'string',
        default: '',
        required: true,
        description: 'Redis key (or pattern for keys operation, e.g. user:*)',
      },
      {
        name: 'value',
        displayName: 'Value',
        type: 'string',
        default: '',
        description: 'Value for set/publish/lpush/sadd/hset operations',
      },
      {
        name: 'field',
        displayName: 'Hash Field',
        type: 'string',
        default: '',
        description: 'Field name for hash operations (hget/hset)',
        displayOptions: {
          show: { operation: ['hget', 'hset'] },
        },
      },
      {
        name: 'ttl',
        displayName: 'TTL (seconds)',
        type: 'number',
        default: 0,
        description: 'Time-to-live in seconds (0 for no expiry). Used with set and expire.',
      },
      {
        name: 'rangeStart',
        displayName: 'Range Start',
        type: 'number',
        default: 0,
        description: 'Start index for lrange',
        displayOptions: {
          show: { operation: ['lrange'] },
        },
      },
      {
        name: 'rangeEnd',
        displayName: 'Range End',
        type: 'number',
        default: -1,
        description: 'End index for lrange (-1 for all)',
        displayOptions: {
          show: { operation: ['lrange'] },
        },
      },
      {
        name: 'connectionUrl',
        displayName: 'Connection URL',
        type: 'string',
        default: 'redis://localhost:6379',
        description: 'Redis connection URL (used if no credential is provided)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter<string>('operation');
    const key = context.getParameter<string>('key');
    const value = context.getParameter<string>('value') ?? '';
    const field = context.getParameter<string>('field') ?? '';
    const ttl = context.getParameter<number>('ttl') ?? 0;
    const rangeStart = context.getParameter<number>('rangeStart') ?? 0;
    const rangeEnd = context.getParameter<number>('rangeEnd') ?? -1;
    const connectionUrl = context.getParameter<string>('connectionUrl') ?? 'redis://localhost:6379';

    // Get connection URL from credentials or parameter
    let redisUrl = connectionUrl;
    try {
      const creds = await context.getCredential('redisConnection');
      if (creds['url']) redisUrl = creds['url'] as string;
      else if (creds['host']) {
        const host = creds['host'] as string;
        const port = (creds['port'] as number) ?? 6379;
        const password = creds['password'] as string | undefined;
        redisUrl = password ? `redis://:${password}@${host}:${port}` : `redis://${host}:${port}`;
      }
    } catch { /* use parameter URL */ }

    // ioredis is available as a transitive dependency via BullMQ
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
      enableOfflineQueue: false,
    });

    try {
      await redis.connect().catch((err: Error) => {
        throw new Error(`Redis bağlantısı kurulamadı (${redisUrl.replace(/:[^:@]+@/, ':****@')}): ${err.message}`);
      });
      context.helpers.log(`Redis: ${operation} on key "${key}"`);

      let result: unknown;

      switch (operation) {
        case 'get':
          result = await redis.get(key);
          break;
        case 'set':
          if (ttl > 0) {
            await redis.set(key, value, 'EX', ttl);
          } else {
            await redis.set(key, value);
          }
          result = 'OK';
          break;
        case 'del':
          result = await redis.del(key);
          break;
        case 'exists':
          result = await redis.exists(key);
          break;
        case 'keys':
          result = await redis.keys(key);
          break;
        case 'incr':
          result = await redis.incr(key);
          break;
        case 'hget':
          result = await redis.hget(key, field);
          break;
        case 'hset':
          await redis.hset(key, field, value);
          result = 'OK';
          break;
        case 'hgetall':
          result = await redis.hgetall(key);
          break;
        case 'lpush':
          result = await redis.lpush(key, value);
          break;
        case 'lrange':
          result = await redis.lrange(key, rangeStart, rangeEnd);
          break;
        case 'sadd':
          result = await redis.sadd(key, value);
          break;
        case 'smembers':
          result = await redis.smembers(key);
          break;
        case 'publish':
          result = await redis.publish(key, value);
          break;
        case 'ttl':
          result = await redis.ttl(key);
          break;
        case 'expire':
          result = await redis.expire(key, ttl);
          break;
        default:
          throw new Error(`Unknown Redis operation: ${operation}`);
      }

      // Try to parse JSON values from get/hget
      if ((operation === 'get' || operation === 'hget') && typeof result === 'string') {
        try { result = JSON.parse(result); } catch { /* keep as string */ }
      }

      return [{
        json: {
          operation,
          key,
          result,
          ...(typeof result === 'object' && result !== null && !Array.isArray(result) ? result as Record<string, unknown> : {}),
        },
      }];
    } finally {
      redis.disconnect();
    }
  },
};

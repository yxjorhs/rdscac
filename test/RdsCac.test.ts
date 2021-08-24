import redis from 'redis';
import IORedis from 'ioredis'
import assert from 'assert';
import RdsCac from '../src'
import { sleep } from '../src/util';

async function rdsCacTest(redis: IORedis.Redis | redis.RedisClient) {
  await new IORedis().flushdb()

  const rdscac = new RdsCac<'ev' | 'ev2'>({
    redis,
    expireIn: 86400,
    unique: ''
  })

  let v = 1
  async function case1Get(forceRefresh: boolean) {
    return rdscac.get(
        'case1',
        async () => {
          await sleep(1)
          return v++
        },
        forceRefresh,
    )
  }

  assert.strictEqual(await case1Get(false), 1);

  assert.strictEqual(await case1Get(false), 1);

  assert.strictEqual(await case1Get(true), 2);

  assert.strictEqual(await case1Get(false), 2);

  async function case2Get() {
    return rdscac.bindEvGet(
        'case2',
        async () => {
          await sleep(1)
          return v++
        },
        ['ev'],
    )
  }

  assert.strictEqual(await case2Get(), 3);

  await rdscac.refreshByEv(['ev'])

  assert.strictEqual(await case2Get(), 4);
}

describe("RdsCac", () => {
  it('redis', async () => {
    await rdsCacTest(redis.createClient())
  })

  it("IORedis", async () => {
    await rdsCacTest(new IORedis())
  })
})

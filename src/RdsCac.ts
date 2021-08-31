/**
 * RdsCac is Redis Cache.
 * Request Data from Redis simply.
 * Refresh cache in event mod by call bindEvGet.
 * Or force refresh cache when call get function.
 * Use Redlock to avoid parallel request data source when cache not exsits.
 */
import {promisify} from 'util';
import Redlock from 'redlock';
import {EvKeyDict} from './EvKeyDict';
import {Redis} from './Redis';
import {sleep} from './util';

type RdsCacOpt = {
  redis: (() => Redis) | Redis,
  expireIn: number,
  unique: string
};

type HashCache = {
  val: string | undefined,
  signRefreshAt: string | undefined,
  refreshAt: string | undefined
} | null;

/** RefreshLock expire in second */
const REFRESH_LOCK_TTL = 10;
/** getGeneric max wait times */
const WAIT_TIMES = 10;
/** getGeneric wait interval */
const WAIT_INTERVAL = 100;

/**
 * Redis Cache
 */
export class RdsCac<EV extends string> {
  private evKeyDic: EvKeyDict;
  private redisSource: (() => Redis) | Redis;
  private expireIn: number;
  private keyGet: (key: string) => string;

  /**
   * @param {RdsCacOpt} opt
   */
  constructor(opt: RdsCacOpt) {
    this.evKeyDic = new EvKeyDict(opt);
    this.redisSource = opt.redis;
    this.expireIn = opt.expireIn
    this.keyGet = key => `RdsCac:${opt.unique}:${key}`
  };

  private get redis() {
    return typeof this.redisSource === 'function' ? this.redisSource() : this.redisSource
  }

  /**
   * return cache
   * @param {string} key
   * @param {function} source data source function
   * @param {boolean} refreshForce
   * @return {T}
   */
  public async get<T>(
      key: string,
      source: () => Promise<T>,
      refreshForce: boolean,
  ): Promise<T> {
    return this.getGeneric(key, source, [], refreshForce);
  }

  /**
   * bind event to key and return cache
   * @param {string} key
   * @param {function} source data source function
   * @param {string[]} ev cache would refresh when call refreshByEv(ev)
   * @return {T}
   */
  public async bindEvGet<T>(
      key: string,
      source: () => Promise<T>,
      ev: EV[],
  ): Promise<T> {
    return this.getGeneric(key, source, ev, false);
  }

  /**
   * get cache from Redis or source
   * @param {string} key
   * @param {function} source
   * @param {string[]} refreshEvent
   * @param {boolean} refreshForce
   * @return {T}
   */
  private async getGeneric<T>(
      key: string,
      source: () => Promise<T>,
      refreshEvent: EV[],
      refreshForce: boolean,
  ): Promise<T> {
    key = this.keyGet(key);

    if (refreshEvent.length > 0) {
      await this.evKeyDic.add(key, refreshEvent);
    }

    let val: T;
    let isLoadVal = false;

    const cac = (await promisify(this.redis.hgetall)
        .bind(this.redis)(key)) as HashCache;

    if (cac !== null && cac.val !== undefined) {
      val = JSON.parse(cac.val);
      isLoadVal = true;
    }

    // refresh
    if (
      cac === null ||
      cac.val === undefined ||
      refreshForce === true ||
      Number(cac.signRefreshAt) >= Number(cac.refreshAt) // event refresh
    ) {
      let isGetLock = false;
      try {
        // use redlock to avoid parallel request source
        const lock = await new Redlock([this.redis], {retryCount: 0})
            .lock(`refreshLock:${key}`, REFRESH_LOCK_TTL);

        isGetLock = true;

        try {
          val = await source();

          isLoadVal = true;

          const multi = this.redis.multi()
              .hset(
                  key,
                  'val',
                  JSON.stringify(val),
                  'refreshAt',
                  Date.now().toString(),
              )
              .expire(key, this.expireIn);

          await promisify(multi.exec).bind(multi)();
        } finally {
          await lock.unlock();
        }
      } catch {}

      // wait the thread that got lock to update cache, event refresh skip it
      if (
        (
          cac === null ||
          cac.val === undefined ||
          refreshForce === true
        ) &&
        isGetLock === false
      ) {
        for (let i = 0; i < WAIT_TIMES; i++) {
          await sleep(WAIT_INTERVAL);

          const cac = (await promisify(this.redis.hgetall)
              .bind(this.redis)(key)) as HashCache;

          if (
            cac &&
            cac.val &&
            Number(cac.signRefreshAt) < Number(cac.refreshAt)
          ) {
            val = JSON.parse(cac.val);
            isLoadVal = true;
            break;
          }
        }
      }
    }

    // ensure get data finally
    if (isLoadVal === false) {
      val = await source();
      const multi = this.redis.multi()
          .hset(
              key,
              'val',
              JSON.stringify(val),
              'refreshAt',
              Date.now().toString(),
          )
          .expire(key, this.expireIn);
      await promisify(multi.exec).bind(multi)();
    }

    return val!;
  }

  /**
   * refresh cache from source base on refreshEvent
   * @param {string} ev
   */
  public async refreshByEv(ev: EV[]) {
    const keys = await this.evKeyDic.get(ev);

    if (keys.length === 0) {
      return;
    }

    const multi = this.redis.multi();
    for (let i = 0; i < keys.length; i++) {
      multi.hset(keys[i], 'signRefreshAt', Date.now());
      multi.expire(keys[i], this.expireIn);
    }
    await promisify(multi.exec).bind(multi)();
  }
}

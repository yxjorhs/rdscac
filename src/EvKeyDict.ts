/**
 * EvKeyDict, event key dictionary
 *
 * use Redis Set to save dict data, RdsRac Event as key, RdsCac Keys as members.
 *
 * use memory dictionary(MemDict), reduce request Redis frequency,
 * improve dict speed
 */
import {promisify} from 'util';
import {Redis} from './Redis';

type EvKeyDictOption = {
  redis: (() => Redis) | Redis,
  unique: string
}

type MemDict = Record<string, {
  dict: Record<string, 1>,
  /** return true if Dict have been load Redis cache */
  isLoadCache: boolean
}>

/**
 * event key dictionary
 */
export class EvKeyDict {
  private redis: Redis;
  private memDict: MemDict = {}
  private keyGet: (key: string) => string;

  /**
   * @param {EvKeyDictOption} opt
   */
  constructor(opt: EvKeyDictOption) {
    this.redis = typeof opt.redis === 'function' ? opt.redis() : opt.redis;
    this.keyGet = key => `EvKeyDict:${opt.unique}:${key}`;
  }

  /**
   * build event => key
   * @param {string} key
   * @param {string[]} evs
   */
  public async add(key: string, evs: string[]): Promise<void> {
    const multi = this.redis.multi();
    let needExec = false;

    for (const ev of evs) {
      if (this.memDict[ev] === undefined) {
        this.memDictAdd(ev);
      }

      if (this.memDict[ev].dict[key] === undefined) {
        this.memDict[ev].dict[key] = 1;
        multi.sadd(this.keyGet(ev), key);
        needExec = true;
      }
    }

    if (needExec) {
      await promisify(multi.exec).bind(multi)();
    }
  }

  /**
   * get keys in event
   * @param {string[]} evs
   * @return {string[]}
   */
  public async get(evs: string[]): Promise<string[]> {
    let allKeys: string[] = [];

    for (const ev of evs) {
      // search key from memDict if memDict[ev] have been load redis cache
      if (this.memDict[ev] && this.memDict[ev].isLoadCache) {
        for (const key of Object.keys(this.memDict[ev].dict)) {
          allKeys.push(key);
        }
        continue;
      }

      const keys = await promisify(this.redis.smembers)
          .bind(this.redis)(this.keyGet(ev));

      allKeys = allKeys.concat(keys);

      // memDict load redis cache
      if (this.memDict[ev] === undefined) {
        this.memDictAdd(ev);
      }

      for (const key of keys) {
        this.memDict[ev].dict[key] = 1;
      }

      this.memDict[ev].isLoadCache = true;
    }

    return allKeys;
  }

  /**
   * @param {string} ev
   */
  private memDictAdd(ev: string): void {
    if (this.memDict[ev] !== undefined) {
      return;
    }

    this.memDict[ev] = {
      dict: {},
      isLoadCache: false,
    };
  }
}

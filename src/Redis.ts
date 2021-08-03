type Callback<T> = (err: Error | null, res: T) => void
export type Redis = {
  eval(args: (string | number)[], cb: Callback<any>): void;
  hgetall(key: string, cb: Callback<null | Record<string, string>>): void;
  multi(): any;
  smembers(key: string, cb: Callback<string[]>): void;
}

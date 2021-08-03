/**
 * @param {number} ms
 * @return {Promise<void>}
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

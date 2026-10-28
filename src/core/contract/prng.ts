// 可复现随机：纯函数 PRNG，禁用 Math.random 与 Date。
// 种子还原 = 用同一 generatorVersion 重跑生成器；IR 才是权威，seed 只是来源凭据。

const MASK = 0xffffffff;

export interface Rng {
  readonly seed: number;
  next(): number;
  int(limit: number): number;
  pick<T>(list: ReadonlyArray<T>): T;
}

export function createRng(seed: number): Rng {
  let state = (Number.isInteger(seed) ? seed : 0) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const int = (limit: number): number => {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error('int(limit) 需要正整数。');
    return Math.floor(next() * limit) % limit;
  };
  const pick = <T>(list: ReadonlyArray<T>): T => {
    if (!Array.isArray(list) || list.length === 0) throw new Error('pick(list) 需要非空数组。');
    return list[int(list.length)]!;
  };
  return Object.freeze({ seed: state, next, int, pick });
}

export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) & MASK;
  }
  return hash >>> 0;
}

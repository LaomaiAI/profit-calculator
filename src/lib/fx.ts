/**
 * fx.ts: 汇率取数（浏览器端）。
 * 主源 Frankfurter（欧洲央行官方汇率，免费、无 Key、日频）；
 * 失败时用静态兜底表，并明确标注日期与“非实时”。
 * 卖家真实财务数据不发往任何第三方——汇率请求只含币种代码，不含金额。
 */

export interface FxRate {
  /** 汇率日期（Frankfurter 返回的日期，或兜底表日期） */
  date: string;
  /** 基准币 */
  base: string;
  /** 目标币 -> 本币/1基准币 */
  rates: Record<string, number>;
  source: 'frankfurter' | 'fallback';
}

export const FX_SYMBOLS = ['CNY', 'EUR', 'GBP', 'JPY'] as const;

/**
 * 静态兜底表：仅在 Frankfurter 不可达时使用。
 * 数值为 2026-11-14 前后的参考价（取整），页面上必须标注“兜底参考价，非实时”。
 */
export const FALLBACK_RATES: FxRate = {
  date: '2026-11-14',
  base: 'USD',
  rates: { CNY: 7.1, EUR: 0.92, GBP: 0.79, JPY: 155 },
  source: 'fallback',
};

const FRANKFURTER_URLS = [
  'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY,EUR,GBP,JPY',
  'https://api.frankfurter.app/latest?base=USD&symbols=CNY,EUR,GBP,JPY',
];

/** 取当日汇率；任一源成功即返回，全部失败返回兜底表。 */
export async function fetchFxRates(): Promise<FxRate> {
  for (const url of FRANKFURTER_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
      if (data.rates && Object.keys(data.rates).length > 0) {
        return { date: data.date ?? '未知', base: 'USD', rates: data.rates, source: 'frankfurter' };
      }
    } catch {
      // 换下一个源
    }
  }
  return FALLBACK_RATES;
}

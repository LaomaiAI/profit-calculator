/**
 * csv.ts: 结算 / 订单 CSV 解析与字段映射。
 * 只处理用户自己从 Seller Central 导出的 CSV，不爬取任何平台数据。
 * 解析用 papaparse；映射接受中英文列名；数值全部用确定性代码算。
 */
import Papa from 'papaparse';
import type { OrderRow } from './profit-core';

/** 列名别名表：统一后的字段 -> 接受的列名（小写比对） */
const COLUMN_ALIASES: Record<keyof Omit<OrderRow, 'sku' | 'date'> | 'sku' | 'date', string[]> = {
  sku: ['sku', 'asin', '商品编码', '商品sku', '产品编码'],
  date: ['date', 'order-date', 'order_date', '日期', '订单日期'],
  units: ['units', 'quantity', 'qty', '数量', '件数', '销量'],
  price: ['price', 'sale-price', 'sale_price', '售价', '单价', 'item-price'],
  referralFee: ['referral-fee', 'referral_fee', 'referralfee', '推荐费', '销售佣金'],
  fbaFee: ['fba-fee', 'fba_fee', 'fbafee', 'fba费', '配送费', 'fulfillment-fee'],
  adSpend: ['ad-spend', 'ad_spend', 'adspend', '广告花费', '广告费', '广告支出'],
  returnUnits: ['return-units', 'return_units', 'returnunits', '退货件数', '退货数量'],
  returnCostEach: ['return-cost-each', 'return_cost_each', '退货成本', '单件退货成本'],
  landedCostEach: ['landed-cost-each', 'landed_cost_each', '到岸成本', '采购成本', '单件成本'],
};

export interface ParseResult {
  rows: OrderRow[];
  /** 被跳过的行数（空行或 SKU 为空） */
  skipped: number;
  /** 未能识别的列名（原样列出，提醒用户检查） */
  unmappedColumns: string[];
  errors: string[];
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function findColumn(headers: string[], field: keyof typeof COLUMN_ALIASES): string | null {
  const aliases = COLUMN_ALIASES[field].map(normalizeHeader);
  for (const h of headers) {
    if (aliases.includes(normalizeHeader(h))) return h;
  }
  return null;
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[,¥$]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * 解析结算 CSV 文本。必填列：sku、units、price；其余列缺失时按 0 处理。
 * 列名大小写不敏感，接受中英文别名。
 */
export function parseSettlementCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const errors: string[] = parsed.errors.map((e) => `第 ${e.row !== undefined ? e.row + 1 : '?'} 行：${e.message}`);
  const headers = parsed.meta.fields ?? [];
  const unmappedColumns = headers.filter(
    (h) => !Object.values(COLUMN_ALIASES).flat().map(normalizeHeader).includes(normalizeHeader(h)),
  );

  const col: Record<string, string | null> = {};
  for (const field of Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]) {
    col[field] = findColumn(headers, field);
  }

  const rows: OrderRow[] = [];
  let skipped = 0;
  for (const rec of parsed.data) {
    const sku = col.sku ? String(rec[col.sku] ?? '').trim() : '';
    if (!sku) {
      skipped += 1;
      continue;
    }
    const get = (field: keyof typeof COLUMN_ALIASES): number =>
      col[field] ? toNumber(rec[col[field] as string]) : 0;
    rows.push({
      sku,
      date: col.date ? String(rec[col.date] ?? '').trim() : '',
      units: get('units'),
      price: get('price'),
      referralFee: get('referralFee'),
      fbaFee: get('fbaFee'),
      adSpend: get('adSpend'),
      returnUnits: get('returnUnits'),
      returnCostEach: get('returnCostEach'),
      landedCostEach: get('landedCostEach'),
    });
  }
  return { rows, skipped, unmappedColumns, errors };
}

/** 把 SKU 汇总导出为 CSV 文本（UTF-8，带 BOM 以便 Excel 打开不乱码） */
export function summariesToCsv(
  summaries: { sku: string; units: number; revenue: number; totalProfit: number; margin: number; returnRate: number }[],
): string {
  const header = 'SKU,销量（件）,收入（USD）,利润（USD）,毛利率,退货率';
  const lines = summaries.map((s) =>
    [
      s.sku,
      s.units,
      s.revenue.toFixed(2),
      s.totalProfit.toFixed(2),
      `${(s.margin * 100).toFixed(2)}%`,
      `${(s.returnRate * 100).toFixed(2)}%`,
    ].join(','),
  );
  return '\uFEFF' + [header, ...lines].join('\n');
}

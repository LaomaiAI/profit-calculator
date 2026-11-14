import { describe, expect, it } from 'vitest';
import { parseSettlementCsv, summariesToCsv } from './csv';

const SAMPLE = `sku,date,units,price,referral-fee,fba-fee,ad-spend,return-units,return-cost-each,landed-cost-each
A001,2026-10-05,10,20,3,3.17,20,1,6.5,8.3
A001,2026-10-20,5,20,3,3.17,10,0,6.5,8.3
B002,2026-11-02,2,15,2.25,2.5,30,1,5,12`;

describe('parseSettlementCsv', () => {
  it('解析英文列并映射全部字段', () => {
    const r = parseSettlementCsv(SAMPLE);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ sku: 'A001', date: '2026-10-05', units: 10, price: 20, adSpend: 20, returnUnits: 1 });
    expect(r.skipped).toBe(0);
    expect(r.unmappedColumns).toEqual([]);
  });
  it('接受中文列名', () => {
    const r = parseSettlementCsv('商品编码,日期,数量,售价,推荐费\nA001,2026-10-05,10,20,3');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ sku: 'A001', units: 10, price: 20, referralFee: 3 });
  });
  it('缺失可选列时按 0 处理，SKU 为空的行跳过', () => {
    const r = parseSettlementCsv('sku,units,price\nA001,10,20\n,5,15\nB002,2,15');
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.rows[0].fbaFee).toBe(0);
  });
  it('未识别的列原样报告', () => {
    const r = parseSettlementCsv('sku,units,price,备注\nA001,10,20,hello');
    expect(r.unmappedColumns).toEqual(['备注']);
    expect(r.rows).toHaveLength(1);
  });
});

describe('summariesToCsv', () => {
  it('导出带 BOM 的 CSV，含表头与百分号', () => {
    const out = summariesToCsv([
      { sku: 'A001', units: 15, revenue: 300, totalProfit: 46.45, margin: 0.1548, returnRate: 0.0667 },
    ]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toContain('SKU,销量（件）,收入（USD）,利润（USD）,毛利率,退货率');
    expect(out).toContain('A001,15,300.00,46.45,15.48%,6.67%');
  });
});

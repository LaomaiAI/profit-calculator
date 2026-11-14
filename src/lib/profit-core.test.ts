import { describe, expect, it } from 'vitest';
import {
  acos,
  breakevenAcos,
  breakevenPrice,
  convertCurrency,
  defaultUnitInput,
  fbaFeeWithSurcharge,
  fxLossPerUnit,
  referralFee,
  returnCostPerUnit,
  storageFee,
  summarizeByMonth,
  summarizeBySku,
  tacos,
  unitProfit,
  type OrderRow,
} from './profit-core';

describe('referralFee 推荐费', () => {
  it('售价 × 费率', () => {
    expect(referralFee(22.03, 0.15)).toBe(3.3);
    expect(referralFee(100, 0.08)).toBe(8);
  });
  it('售价或费率 <= 0 时为 0', () => {
    expect(referralFee(0, 0.15)).toBe(0);
    expect(referralFee(22.03, 0)).toBe(0);
  });
});

describe('fbaFeeWithSurcharge FBA 附加费', () => {
  it('基准费 × (1 + 3.5%)', () => {
    // 2026-04-17 起 +3.5% 燃油/物流附加费
    expect(fbaFeeWithSurcharge(3.06, 0.035)).toBe(3.17);
    expect(fbaFeeWithSurcharge(10, 0.035)).toBe(10.35);
  });
  it('无附加费时等于基准', () => {
    expect(fbaFeeWithSurcharge(5, 0)).toBe(5);
  });
});

describe('storageFee 仓储费', () => {
  it('淡季 $0.78/cf', () => {
    expect(storageFee(2, 3, 'off-peak')).toBe(4.68);
  });
  it('旺季 $2.40/cf', () => {
    expect(storageFee(2, 3, 'peak')).toBe(14.4);
  });
});

describe('returnCostPerUnit 退货成本', () => {
  it('退货率 × 单件退货成本之和', () => {
    // 5% × (2.0 + 1.5 + 3.0) = 0.325 -> 0.33（四舍五入到分）
    expect(returnCostPerUnit(0.05, 2.0, 1.5, 3.0)).toBe(0.33);
  });
  it('退货率为 0 时为 0', () => {
    expect(returnCostPerUnit(0, 2, 1.5, 3)).toBe(0);
  });
});

describe('acos / tacos', () => {
  it('ACOS = 广告花费 / 广告销售额', () => {
    expect(acos(150, 1000)).toBe(0.15);
  });
  it('TACoS = 广告花费 / 总销售额', () => {
    expect(tacos(150, 1500)).toBe(0.1);
  });
  it('分母为 0 时返回 0 而不是 NaN', () => {
    expect(acos(150, 0)).toBe(0);
    expect(tacos(150, 0)).toBe(0);
  });
});

describe('breakevenAcos 盈亏平衡 ACOS', () => {
  it('售价 20，平台费 3，FBA 3.17，采购 6，退货 0.33 -> (20-3-3.17-6-0.33)/20', () => {
    expect(breakevenAcos(20, 3, 3.17, 6, 0.33)).toBeCloseTo(0.375, 3);
  });
  it('售价为 0 时返回 0', () => {
    expect(breakevenAcos(0, 3, 3, 6, 0.3)).toBe(0);
  });
});

describe('breakevenPrice 盈亏平衡价', () => {
  it('在盈亏平衡价处净利润为 0', () => {
    const input = defaultUnitInput();
    const bp = breakevenPrice(input);
    expect(bp).toBeGreaterThan(0);
    const atBp = unitProfit({ ...input, price: bp });
    expect(atBp.netProfit).toBeCloseTo(0, 1);
  });
  it('推荐费率 100% 时无解返回 0', () => {
    expect(breakevenPrice({ ...defaultUnitInput(), referralRate: 1 })).toBe(0);
  });
});

describe('unitProfit 6 层单件利润公式', () => {
  it('默认示例：逐层相加等于总成本，净利润 = 售价 - 总成本', () => {
    const input = defaultUnitInput();
    const r = unitProfit(input);
    // 推荐费 22.03×0.15=3.30；FBA 3.06×1.035=3.17；退货 0.05×6.5=0.33
    expect(r.referralFee).toBe(3.3);
    expect(r.fbaFeeTotal).toBe(3.17);
    expect(r.returnCost).toBe(0.33);
    // 总成本 = 3.30+3.17+0.50+6.00+1.50+0.80+2.20+0.33+0.15 = 17.95
    expect(r.totalCost).toBe(17.95);
    expect(r.netProfit).toBe(4.08);
    expect(r.margin).toBeCloseTo(0.1852, 4);
    expect(r.roi).toBeCloseTo(0.4916, 4);
  });
  it('售价低于成本时净利润为负、毛利率为负', () => {
    const r = unitProfit({ ...defaultUnitInput(), price: 10 });
    expect(r.netProfit).toBeLessThan(0);
    expect(r.margin).toBeLessThan(0);
  });
  it('售价为 0 时不出现 NaN', () => {
    const r = unitProfit({ ...defaultUnitInput(), price: 0 });
    expect(Number.isNaN(r.netProfit)).toBe(false);
    expect(Number.isNaN(r.margin)).toBe(false);
    expect(Number.isNaN(r.roi)).toBe(false);
  });
  it('盈亏平衡 ACOS 与盈亏平衡价互相印证：按盈亏平衡价定价时 ACOS 上限约等于广告占比', () => {
    const input = defaultUnitInput();
    const r = unitProfit(input);
    // 广告后利润 = 售价 - 总成本；广告占比 adSpend/price 应小于 breakevenAcos
    expect(input.adSpendPerUnit / input.price).toBeLessThan(r.breakevenAcos);
  });
});

describe('convertCurrency / fxLossPerUnit 汇率换算', () => {
  it('金额 × 汇率', () => {
    expect(convertCurrency(100, 7.1)).toBe(710);
  });
  it('结算汇率下跌造成损失', () => {
    // 100 美元，售出时 7.20，结算时 7.10，损失 100×0.10=10 元
    expect(fxLossPerUnit(100, 7.2, 7.1)).toBe(10);
  });
  it('结算汇率上涨为收益（负损失）', () => {
    expect(fxLossPerUnit(100, 7.1, 7.2)).toBe(-10);
  });
});

const rows: OrderRow[] = [
  { sku: 'A001', date: '2026-10-05', units: 10, price: 20, referralFee: 3, fbaFee: 3.17, adSpend: 20, returnUnits: 1, returnCostEach: 6.5, landedCostEach: 8.3 },
  { sku: 'A001', date: '2026-10-20', units: 5, price: 20, referralFee: 3, fbaFee: 3.17, adSpend: 10, returnUnits: 0, returnCostEach: 6.5, landedCostEach: 8.3 },
  { sku: 'B002', date: '2026-11-02', units: 2, price: 15, referralFee: 2.25, fbaFee: 2.5, adSpend: 30, returnUnits: 1, returnCostEach: 5, landedCostEach: 12 },
];

describe('summarizeBySku 按 SKU 汇总', () => {
  it('汇总收入、利润、退货率，亏损 SKU 排在最前并标 isLoss', () => {
    const out = summarizeBySku(rows);
    expect(out).toHaveLength(2);
    // B002: 收入 30，成本 2×(2.25+2.5+12)+30+1×5 = 68.5，亏损 -38.5
    expect(out[0].sku).toBe('B002');
    expect(out[0].isLoss).toBe(true);
    expect(out[0].totalProfit).toBe(-38.5);
    // A001: 收入 300，成本 171.20+82.35 = 253.55，利润 46.45
    expect(out[1].sku).toBe('A001');
    expect(out[1].units).toBe(15);
    expect(out[1].totalProfit).toBe(46.45);
    expect(out[1].returnRate).toBeCloseTo(0.0667, 4);
  });
  it('空数组返回空数组', () => {
    expect(summarizeBySku([])).toEqual([]);
  });
});

describe('summarizeByMonth 按月汇总', () => {
  it('按 YYYY-MM 分组并按月份排序', () => {
    const out = summarizeByMonth(rows);
    expect(out).toHaveLength(2);
    expect(out[0].month).toBe('2026-10');
    expect(out[0].units).toBe(15);
    expect(out[1].month).toBe('2026-11');
    expect(out[1].totalProfit).toBe(-38.5);
  });
});

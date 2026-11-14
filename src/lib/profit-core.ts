/**
 * profit-core: 纯 TypeScript 确定性计算模块
 * 不依赖任何运行时、不发网络请求、不碰 LLM。
 * 所有金额默认单位为美元 (USD)，除非另有说明。
 * 费率口径见 docs/fees-2026.md（亚马逊 2026 年费率，核查日期 2026-09-10）。
 */

// ---------------------------------------------------------------------------
// 常量：2026 年费率（来源见 docs/fees-2026.md）
// ---------------------------------------------------------------------------

/** 推荐费：多数类目 15%，可按类目在 8% - 15% 之间调整 */
export const REFERRAL_RATE_DEFAULT = 0.15;
export const REFERRAL_RATE_MIN = 0.08;
export const REFERRAL_RATE_MAX = 0.15;

/** FBA 配送费：2026-01-15 起平均每件 +$0.08（调用方把调整后的基准费传进来） */
export const FBA_FEE_INCREASE_2026_01_15 = 0.08;

/** 2026-04-17 起燃油/物流附加费：FBA 配送费的 +3.5% */
export const FBA_SURCHARGE_RATE_2026_04_17 = 0.035;

/** 亚马逊仓储费（美元 / 立方英尺 / 月） */
export const STORAGE_RATE_OFF_PEAK = 0.78; // 淡季
export const STORAGE_RATE_PEAK = 2.4; // 旺季（10-12 月）

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface UnitCostInput {
  /** 售价 / 件 */
  price: number;
  /** 推荐费率（小数，如 0.15 表示 15%） */
  referralRate: number;
  /** FBA 配送费 / 件（2026-01-15 调整后的基准） */
  fbaFee: number;
  /** FBA 附加费率（小数，默认 0.035） */
  fbaSurchargeRate: number;
  /** 分摊到每件的仓储费 */
  storagePerUnit: number;
  /** 采购成本 / 件 */
  procurementCost: number;
  /** 头程物流 / 件 */
  firstLegCost: number;
  /** 关税 / 件 */
  tariffCost: number;
  /** 分摊到每件的广告花费 */
  adSpendPerUnit: number;
  /** 退货率（小数，如 0.05 表示 5%） */
  returnRate: number;
  /** 退款管理费 / 件（按退货件计） */
  refundAdminFee: number;
  /** 退货处理费 / 件（按退货件计） */
  returnProcessingFee: number;
  /** 不可售损失 / 件（按退货件计） */
  unsellableLoss: number;
  /** 汇兑损益 / 件（正数表示损失，负数表示收益） */
  fxLossPerUnit: number;
}

export interface UnitProfitResult {
  /** 推荐费 / 件 */
  referralFee: number;
  /** FBA 配送费（含附加费）/ 件 */
  fbaFeeTotal: number;
  /** 退货相关成本 / 件 */
  returnCost: number;
  /** 总成本 / 件（不含售价） */
  totalCost: number;
  /** 净利润 / 件 */
  netProfit: number;
  /** 毛利率 = 净利润 / 售价 */
  margin: number;
  /** ROI = 净利润 / (采购 + 头程 + 关税) */
  roi: number;
  /** 盈亏平衡价：净利润为 0 时的售价 */
  breakevenPrice: number;
  /** 盈亏平衡 ACOS：广告花费占售价的最大比例 */
  breakevenAcos: number;
}

// ---------------------------------------------------------------------------
// 单项计算
// ---------------------------------------------------------------------------

/** 推荐费 = 售价 × 费率 */
export function referralFee(price: number, rate: number): number {
  if (price <= 0 || rate <= 0) return 0;
  return round2(price * rate);
}

/** 含附加费的 FBA 配送费 = 基准费 × (1 + 附加费率) */
export function fbaFeeWithSurcharge(baseFee: number, surchargeRate: number): number {
  if (baseFee <= 0) return 0;
  return round2(baseFee * (1 + surchargeRate));
}

/** 仓储费 = 体积(立方英尺) × 月数 × 当季单价 */
export function storageFee(
  cubicFeet: number,
  months: number,
  season: 'off-peak' | 'peak',
): number {
  if (cubicFeet <= 0 || months <= 0) return 0;
  const rate = season === 'peak' ? STORAGE_RATE_PEAK : STORAGE_RATE_OFF_PEAK;
  return round2(cubicFeet * months * rate);
}

/** 退货成本 / 件 = 退货率 × (退款管理费 + 退货处理费 + 不可售损失) */
export function returnCostPerUnit(
  returnRate: number,
  refundAdminFee: number,
  returnProcessingFee: number,
  unsellableLoss: number,
): number {
  if (returnRate <= 0) return 0;
  return round2(returnRate * (refundAdminFee + returnProcessingFee + unsellableLoss));
}

/** ACOS = 广告花费 / 广告销售额 */
export function acos(adSpend: number, adSales: number): number {
  if (adSales <= 0 || adSpend <= 0) return 0;
  return adSpend / adSales;
}

/** TACoS = 广告花费 / 总销售额 */
export function tacos(adSpend: number, totalSales: number): number {
  if (totalSales <= 0 || adSpend <= 0) return 0;
  return adSpend / totalSales;
}

/**
 * 盈亏平衡 ACOS = (售价 - 平台费 - FBA - 采购 - 退货) / 售价
 * 即广告花费占售价的上限，超过它广告后必然亏损。
 */
export function breakevenAcos(
  price: number,
  referralFeeAmount: number,
  fbaFeeTotal: number,
  procurementCost: number,
  returnCostAmount: number,
): number {
  if (price <= 0) return 0;
  return (price - referralFeeAmount - fbaFeeTotal - procurementCost - returnCostAmount) / price;
}

/**
 * 盈亏平衡价：净利润为 0 时的售价。
 * 净利润 = 售价 × (1 - 推荐费率) - (FBA + 仓储 + 采购 + 头程 + 关税 + 广告 + 退货 + 汇兑)
 * 令净利润为 0，解出售价。
 */
export function breakevenPrice(input: UnitCostInput): number {
  const fixed =
    fbaFeeWithSurcharge(input.fbaFee, input.fbaSurchargeRate) +
    input.storagePerUnit +
    input.procurementCost +
    input.firstLegCost +
    input.tariffCost +
    input.adSpendPerUnit +
    returnCostPerUnit(
      input.returnRate,
      input.refundAdminFee,
      input.returnProcessingFee,
      input.unsellableLoss,
    ) +
    input.fxLossPerUnit;
  const denom = 1 - input.referralRate;
  if (denom <= 0 || fixed <= 0) return 0;
  return round2(fixed / denom);
}

// ---------------------------------------------------------------------------
// 6 层单件利润公式（报告 §5a 口径）
// 售价 - 推荐费 - FBA/仓储 - 采购/头程/关税 - 广告 - 退货 - 汇兑 = 净利润
// ---------------------------------------------------------------------------

export function unitProfit(input: UnitCostInput): UnitProfitResult {
  const fee = referralFee(input.price, input.referralRate);
  const fbaTotal = fbaFeeWithSurcharge(input.fbaFee, input.fbaSurchargeRate);
  const ret = returnCostPerUnit(
    input.returnRate,
    input.refundAdminFee,
    input.returnProcessingFee,
    input.unsellableLoss,
  );
  const totalCost = round2(
    fee +
      fbaTotal +
      input.storagePerUnit +
      input.procurementCost +
      input.firstLegCost +
      input.tariffCost +
      input.adSpendPerUnit +
      ret +
      input.fxLossPerUnit,
  );
  const netProfit = round2(input.price - totalCost);
  const margin = input.price > 0 ? netProfit / input.price : 0;
  const invested = input.procurementCost + input.firstLegCost + input.tariffCost;
  const roi = invested > 0 ? netProfit / invested : 0;
  return {
    referralFee: fee,
    fbaFeeTotal: fbaTotal,
    returnCost: ret,
    totalCost,
    netProfit,
    margin: round4(margin),
    roi: round4(roi),
    breakevenPrice: breakevenPrice(input),
    breakevenAcos: round4(
      breakevenAcos(input.price, fee, fbaTotal, input.procurementCost, ret),
    ),
  };
}

// ---------------------------------------------------------------------------
// 汇率换算（纯函数；取数在 src/lib/fx.ts，失败用兜底表）
// ---------------------------------------------------------------------------

/** 金额换算：外币金额 × 汇率（本币/外币）= 本币金额 */
export function convertCurrency(amount: number, rate: number): number {
  if (rate <= 0) return 0;
  return round2(amount * rate);
}

/**
 * 汇兑损益 / 件：售出时汇率与结算时汇率之差造成的损失。
 * rateAtSale、rateAtSettlement 均为「本币 / 1 外币」。
 * 结算时汇率跌了（本币升值），到手变少，损失为正。
 */
export function fxLossPerUnit(amount: number, rateAtSale: number, rateAtSettlement: number): number {
  return round2(amount * (rateAtSale - rateAtSettlement));
}

// ---------------------------------------------------------------------------
// 批量汇总
// ---------------------------------------------------------------------------

export interface OrderRow {
  sku: string;
  /** 订单日期 YYYY-MM-DD（可为空） */
  date: string;
  units: number;
  /** 销售单价 / 件 */
  price: number;
  referralFee: number;
  fbaFee: number;
  adSpend: number;
  /** 退货件数 */
  returnUnits: number;
  /** 每件退货成本（退款管理费 + 处理费 + 不可售损失） */
  returnCostEach: number;
  /** 每件采购+头程+关税成本 */
  landedCostEach: number;
}

export interface SkuSummary {
  sku: string;
  units: number;
  revenue: number;
  totalProfit: number;
  margin: number;
  returnUnits: number;
  returnRate: number;
  isLoss: boolean;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  units: number;
  revenue: number;
  totalProfit: number;
  margin: number;
}

/** 按 SKU 汇总：收入、利润、毛利率、退货率；亏损 SKU 用 isLoss 标红 */
export function summarizeBySku(rows: OrderRow[]): SkuSummary[] {
  const map = new Map<string, SkuSummary & { cost: number }>();
  for (const r of rows) {
    const revenue = r.units * r.price;
    const cost =
      r.units * (r.referralFee + r.fbaFee + r.landedCostEach) +
      r.adSpend +
      r.returnUnits * r.returnCostEach;
    const profit = revenue - cost;
    const cur = map.get(r.sku) ?? {
      sku: r.sku,
      units: 0,
      revenue: 0,
      totalProfit: 0,
      margin: 0,
      returnUnits: 0,
      returnRate: 0,
      isLoss: false,
      cost: 0,
    };
    cur.units += r.units;
    cur.revenue = round2(cur.revenue + revenue);
    cur.totalProfit = round2(cur.totalProfit + profit);
    cur.returnUnits += r.returnUnits;
    map.set(r.sku, cur);
  }
  return [...map.values()]
    .map(({ cost: _cost, ...s }) => ({
      ...s,
      revenue: round2(s.revenue),
      totalProfit: round2(s.totalProfit),
      margin: s.revenue > 0 ? round4(s.totalProfit / s.revenue) : 0,
      returnRate: s.units > 0 ? round4(s.returnUnits / s.units) : 0,
      isLoss: s.totalProfit < 0,
    }))
    .sort((a, b) => a.totalProfit - b.totalProfit);
}

/** 按月汇总 */
export function summarizeByMonth(rows: OrderRow[]): MonthlySummary[] {
  const map = new Map<string, MonthlySummary>();
  for (const r of rows) {
    const month = r.date ? r.date.slice(0, 7) : '未知月份';
    const revenue = r.units * r.price;
    const cost =
      r.units * (r.referralFee + r.fbaFee + r.landedCostEach) +
      r.adSpend +
      r.returnUnits * r.returnCostEach;
    const cur = map.get(month) ?? { month, units: 0, revenue: 0, totalProfit: 0, margin: 0 };
    cur.units += r.units;
    cur.revenue = round2(cur.revenue + revenue);
    cur.totalProfit = round2(cur.totalProfit + (revenue - cost));
    map.set(month, cur);
  }
  return [...map.values()]
    .map((m) => ({
      ...m,
      revenue: round2(m.revenue),
      totalProfit: round2(m.totalProfit),
      margin: m.revenue > 0 ? round4(m.totalProfit / m.revenue) : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 默认输入：一个 $22.03 均价档的中国卖家典型 SKU（数值仅为示例起点） */
export function defaultUnitInput(): UnitCostInput {
  return {
    price: 22.03,
    referralRate: REFERRAL_RATE_DEFAULT,
    fbaFee: 3.06,
    fbaSurchargeRate: FBA_SURCHARGE_RATE_2026_04_17,
    storagePerUnit: 0.5,
    procurementCost: 6.0,
    firstLegCost: 1.5,
    tariffCost: 0.8,
    adSpendPerUnit: 2.2,
    returnRate: 0.05,
    refundAdminFee: 2.0,
    returnProcessingFee: 1.5,
    unsellableLoss: 3.0,
    fxLossPerUnit: 0.15,
  };
}

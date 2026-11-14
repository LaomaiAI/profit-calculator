import { useEffect, useMemo, useState } from 'react';
import {
  acos,
  breakevenPrice,
  defaultUnitInput,
  FBA_SURCHARGE_RATE_2026_04_17,
  REFERRAL_RATE_MAX,
  REFERRAL_RATE_MIN,
  summarizeByMonth,
  summarizeBySku,
  tacos,
  unitProfit,
  type OrderRow,
  type UnitCostInput,
} from './lib/profit-core';
import { parseSettlementCsv, summariesToCsv } from './lib/csv';
import { fetchFxRates, type FxRate } from './lib/fx';

// ---------------------------------------------------------------------------
// 小组件
// ---------------------------------------------------------------------------

function NumField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{props.label}</span>
      <input
        type="number"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        value={props.value}
        step={props.step ?? 0.01}
        min={props.min ?? 0}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
      />
      {props.hint && <span className="mt-0.5 block text-xs text-slate-500">{props.hint}</span>}
    </label>
  );
}

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm font-medium text-slate-700">
        <span>{props.label}</span>
        <span className="font-mono text-sky-700">{props.format(props.value)}</span>
      </span>
      <input
        type="range"
        className="mt-1 w-full accent-sky-600"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// 主应用
// ---------------------------------------------------------------------------

export default function App() {
  const [input, setInput] = useState<UnitCostInput>(defaultUnitInput());
  const [adSpend, setAdSpend] = useState(450);
  const [adSales, setAdSales] = useState(3000);
  const [totalSales, setTotalSales] = useState(6600);
  const [fx, setFx] = useState<FxRate | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [csvNote, setCsvNote] = useState('');

  useEffect(() => {
    fetchFxRates().then(setFx);
  }, []);

  const result = useMemo(() => unitProfit(input), [input]);
  const skuSummary = useMemo(() => summarizeBySku(rows), [rows]);
  const monthSummary = useMemo(() => summarizeByMonth(rows), [rows]);
  const bePrice = useMemo(() => breakevenPrice(input), [input]);

  const set = (patch: Partial<UnitCostInput>) => setInput((prev) => ({ ...prev, ...patch }));

  const onCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseSettlementCsv(String(reader.result ?? ''));
      setRows(parsed.rows);
      const notes = [
        `已导入 ${parsed.rows.length} 行`,
        parsed.skipped > 0 ? `跳过 ${parsed.skipped} 行（SKU 为空）` : '',
        parsed.unmappedColumns.length > 0
          ? `未识别的列：${parsed.unmappedColumns.join('、')}`
          : '',
        ...parsed.errors.slice(0, 3),
      ]
        .filter(Boolean)
        .join('；');
      setCsvNote(notes);
    };
    reader.readAsText(file);
  };

  const exportCsv = () => {
    const blob = new Blob([summariesToCsv(skuSummary)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profit-summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const layers: { name: string; amount: number }[] = [
    { name: '推荐费', amount: result.referralFee },
    { name: 'FBA 配送费（含 3.5% 附加费）', amount: result.fbaFeeTotal },
    { name: '仓储费', amount: input.storagePerUnit },
    { name: '采购 + 头程 + 关税', amount: input.procurementCost + input.firstLegCost + input.tariffCost },
    { name: '广告花费', amount: input.adSpendPerUnit },
    { name: '退货成本', amount: result.returnCost },
    { name: '汇兑损益', amount: input.fxLossPerUnit },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <h1 className="text-2xl font-bold">跨境电商利润核算器</h1>
          <p className="mt-1 text-sm text-slate-600">
            给亚马逊中小卖家的“到手利润”计算器：售价 − 平台费 − FBA/物流 − 采购/关税 −
            广告 − 退货 − 汇兑损益 = 真实单件利润。本地计算，你的数据不离开浏览器。
          </p>
          {fx && (
            <p className="mt-2 text-xs text-slate-500">
              汇率（USD 基准，{fx.date}）：
              {Object.entries(fx.rates)
                .map(([k, v]) => `1 USD = ${v} ${k}`)
                .join(' · ')}
              {fx.source === 'fallback'
                ? '（Frankfurter 不可达，使用兜底参考价，非实时）'
                : '（来源：Frankfurter / 欧洲央行官方汇率）'}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {/* 单件利润计算器 */}
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">单件利润计算器</h2>
          <p className="mt-1 text-sm text-slate-600">
            6 层公式，每一层都可改。费率按亚马逊 2026 年口径：推荐费多数 15%、FBA
            2026-01-15 起平均 +$0.08/件、2026-04-17 起 +3.5% 附加费、仓储淡季 $0.78/cf、旺季
            $2.40/cf。来源与版本见 docs/fees-2026.md。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumField label="售价（USD / 件）" value={input.price} onChange={(v) => set({ price: v })} />
            <NumField
              label="推荐费率（小数，如 0.15）"
              value={input.referralRate}
              step={0.01}
              onChange={(v) =>
                set({ referralRate: Math.min(REFERRAL_RATE_MAX, Math.max(REFERRAL_RATE_MIN, v)) })
              }
              hint="多数类目 15%，按类目 8%–15% 可调"
            />
            <NumField
              label="FBA 配送费（USD / 件）"
              value={input.fbaFee}
              onChange={(v) => set({ fbaFee: v })}
              hint="2026-01-15 调整后的基准，附加费自动加 3.5%"
            />
            <NumField label="仓储费（USD / 件）" value={input.storagePerUnit} onChange={(v) => set({ storagePerUnit: v })} />
            <NumField label="采购成本（USD / 件）" value={input.procurementCost} onChange={(v) => set({ procurementCost: v })} />
            <NumField label="头程物流（USD / 件）" value={input.firstLegCost} onChange={(v) => set({ firstLegCost: v })} />
            <NumField label="关税（USD / 件）" value={input.tariffCost} onChange={(v) => set({ tariffCost: v })} />
            <NumField label="广告花费（USD / 件）" value={input.adSpendPerUnit} onChange={(v) => set({ adSpendPerUnit: v })} />
            <NumField
              label="退货率（小数，如 0.05）"
              value={input.returnRate}
              step={0.01}
              onChange={(v) => set({ returnRate: v })}
            />
            <NumField label="退款管理费（USD / 退货件）" value={input.refundAdminFee} onChange={(v) => set({ refundAdminFee: v })} />
            <NumField label="退货处理费（USD / 退货件）" value={input.returnProcessingFee} onChange={(v) => set({ returnProcessingFee: v })} />
            <NumField label="不可售损失（USD / 退货件）" value={input.unsellableLoss} onChange={(v) => set({ unsellableLoss: v })} />
            <NumField label="汇兑损益（USD / 件，正数为损失）" value={input.fxLossPerUnit} onChange={(v) => set({ fxLossPerUnit: v })} />
          </div>

          {/* 场景模拟滑杆 */}
          <div className="mt-6 rounded-md bg-slate-50 p-4">
            <h3 className="text-sm font-semibold">场景模拟：拖动滑杆即时看利润变化</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <SliderField
                label="售价"
                value={input.price}
                min={5}
                max={60}
                step={0.5}
                format={(v) => money(v)}
                onChange={(v) => set({ price: v })}
              />
              <SliderField
                label="广告花费 / 件"
                value={input.adSpendPerUnit}
                min={0}
                max={10}
                step={0.1}
                format={(v) => money(v)}
                onChange={(v) => set({ adSpendPerUnit: v })}
              />
              <SliderField
                label="退货率"
                value={input.returnRate}
                min={0}
                max={0.3}
                step={0.01}
                format={(v) => pct(v)}
                onChange={(v) => set({ returnRate: v })}
              />
            </div>
          </div>

          {/* 结果 */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">成本分层</h3>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {layers.map((l) => (
                    <tr key={l.name} className="border-b border-slate-100">
                      <td className="py-1.5 text-slate-600">{l.name}</td>
                      <td className="py-1.5 text-right font-mono">{money(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1.5">总成本 / 件</td>
                    <td className="py-1.5 text-right font-mono">{money(result.totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-semibold">结果</h3>
              <div className="mt-2 space-y-2 text-sm">
                <p className="flex justify-between">
                  <span>净利润 / 件</span>
                  <span className={`font-mono text-base font-bold ${result.netProfit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {money(result.netProfit)}
                  </span>
                </p>
                <p className="flex justify-between"><span>毛利率</span><span className="font-mono">{pct(result.margin)}</span></p>
                <p className="flex justify-between"><span>ROI（净利润 / 采购+头程+关税）</span><span className="font-mono">{pct(result.roi)}</span></p>
                <p className="flex justify-between"><span>盈亏平衡价</span><span className="font-mono">{money(bePrice)}</span></p>
                <p className="flex justify-between">
                  <span>盈亏平衡 ACOS</span>
                  <span className="font-mono">{pct(result.breakevenAcos)}</span>
                </p>
                <p className="text-xs text-slate-500">
                  FBA 附加费率当前为 {(FBA_SURCHARGE_RATE_2026_04_17 * 100).toFixed(1)}%（2026-04-17 起）。
                  盈亏平衡 ACOS 是广告花费占售价的上限，超过它广告后必然亏损。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 广告联动 */}
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">广告与利润联动</h2>
          <p className="mt-1 text-sm text-slate-600">
            输入月度广告数据，看 ACOS、TACoS 与盈亏平衡 ACOS 的对照。只做建议，不自动改出价。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <NumField label="月广告花费（USD）" value={adSpend} onChange={setAdSpend} />
            <NumField label="广告销售额（USD）" value={adSales} onChange={setAdSales} />
            <NumField label="总销售额（USD）" value={totalSales} onChange={setTotalSales} />
          </div>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-slate-500">ACOS</p>
              <p className="font-mono text-lg font-bold">{pct(acos(adSpend, adSales))}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-slate-500">TACoS</p>
              <p className="font-mono text-lg font-bold">{pct(tacos(adSpend, totalSales))}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-slate-500">盈亏平衡 ACOS（单件模型）</p>
              <p className="font-mono text-lg font-bold">{pct(result.breakevenAcos)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {acos(adSpend, adSales) > result.breakevenAcos
                  ? '当前 ACOS 高于盈亏平衡线，广告后在亏钱。'
                  : '当前 ACOS 在盈亏平衡线以内。'}
              </p>
            </div>
          </div>
        </section>

        {/* CSV 批量 */}
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">批量：CSV 导入结算报表</h2>
          <p className="mt-1 text-sm text-slate-600">
            上传你自己从 Seller Central 导出的结算 / 订单 CSV（只接受你自有的数据，不爬取亚马逊）。
            必填列：SKU、数量、售价；可选列：推荐费、FBA 费、广告花费、退货件数、退货成本、到岸成本、日期。
            列名接受中英文。文件只在浏览器内解析，不上传。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
              选择 CSV 文件
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCsvFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            <a href="/sample-settlement.csv" download className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50">
              下载示例 CSV（合成数据）
            </a>
            {rows.length > 0 && (
              <button onClick={exportCsv} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50">
                导出汇总 CSV
              </button>
            )}
          </div>
          {csvNote && <p className="mt-3 text-sm text-slate-600">{csvNote}</p>}

          {skuSummary.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold">按 SKU 汇总（按利润升序，亏损标红）</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 pr-2">SKU</th>
                      <th className="py-2 pr-2 text-right">销量</th>
                      <th className="py-2 pr-2 text-right">收入</th>
                      <th className="py-2 pr-2 text-right">利润</th>
                      <th className="py-2 pr-2 text-right">毛利率</th>
                      <th className="py-2 text-right">退货率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuSummary.map((s) => (
                      <tr key={s.sku} className={`border-b ${s.isLoss ? 'bg-red-50 text-red-700' : ''}`}>
                        <td className="py-2 pr-2 font-mono">{s.sku}</td>
                        <td className="py-2 pr-2 text-right">{s.units}</td>
                        <td className="py-2 pr-2 text-right font-mono">{money(s.revenue)}</td>
                        <td className="py-2 pr-2 text-right font-mono font-semibold">{money(s.totalProfit)}</td>
                        <td className="py-2 pr-2 text-right font-mono">{pct(s.margin)}</td>
                        <td className="py-2 text-right font-mono">{pct(s.returnRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="mt-6 text-sm font-semibold">按月趋势</h3>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-2">月份</th>
                    <th className="py-2 pr-2 text-right">销量</th>
                    <th className="py-2 pr-2 text-right">收入</th>
                    <th className="py-2 pr-2 text-right">利润</th>
                    <th className="py-2 text-right">毛利率</th>
                  </tr>
                </thead>
                <tbody>
                  {monthSummary.map((m) => (
                    <tr key={m.month} className="border-b">
                      <td className="py-2 pr-2 font-mono">{m.month}</td>
                      <td className="py-2 pr-2 text-right">{m.units}</td>
                      <td className="py-2 pr-2 text-right font-mono">{money(m.revenue)}</td>
                      <td className={`py-2 pr-2 text-right font-mono font-semibold ${m.totalProfit < 0 ? 'text-red-600' : ''}`}>
                        {money(m.totalProfit)}
                      </td>
                      <td className="py-2 text-right font-mono">{pct(m.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <footer className="rounded-lg border bg-white p-5 text-xs leading-relaxed text-slate-500 shadow-sm">
          <p>
            <strong>费率来源：</strong>亚马逊 2026 年费率（推荐费多数 15%、FBA 2026-01-15 起平均
            +$0.08/件、2026-04-17 起 +3.5% 附加费、仓储淡季 $0.78/cf、旺季 $2.40/cf），核查日期
            2026-09-10，来源 MyRealProfit / eDesk；详见 docs/fees-2026.md。费率每年会变，使用前请在亚马逊官方费率页复核。
          </p>
          <p className="mt-2">
            <strong>免责声明：</strong>本工具的核算结果仅供参考，不构成经营建议或税务建议。税务测算请以主管税务机关与持牌税务师的意见为准。
            本工具不收集、不上传、不存储你的任何财务数据；不爬取亚马逊或任何平台的数据；不涉及股票、加密货币、资金托管或代客交易。
          </p>
        </footer>
      </main>
    </div>
  );
}

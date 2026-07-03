export const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v))
export const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
export const fmtMoney = (v: number, currency = '') => `${currency}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

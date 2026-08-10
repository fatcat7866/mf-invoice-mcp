/**
 * 金額を「¥1,234,567」形式に整形する。
 *
 * MF のAPIは金額を数値ではなく文字列（例: "23100.0"）で返すことがある。
 * 文字列に .toLocaleString() を直接呼ぶと桁区切りが効かず "¥23100.0" と出てしまい、
 * 金額の読み違いにつながるため、必ず数値に寄せてから整形する。
 */
export function yen(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) {
    return `¥${String(value)}`;
  }
  return `¥${n.toLocaleString('ja-JP')}`;
}

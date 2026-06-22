// work in satang (integer) so we never hit float errors. 1 baht = 100 satang.

export function bahtToSatang(baht: number): number {
  return Math.round(baht * 100);
}

export function satangToBaht(satang: number): number {
  return satang / 100;
}

// round half-away-from-zero to the nearest satang. Sign-aware so credit notes /
// negative adjustments (e-Tax doc types 80/81) round symmetrically: -0.5 -> -1, 0.5 -> 1.
export function roundSatang(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

// 123456 -> "1,234.56"
export function formatBaht(satang: number): string {
  return (satang / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

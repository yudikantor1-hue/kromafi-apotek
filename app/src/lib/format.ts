const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const quantity = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export function formatCurrency(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

export function formatQuantity(value: number): string {
  return quantity.format(Number.isFinite(value) ? value : 0);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tidak diketahui';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

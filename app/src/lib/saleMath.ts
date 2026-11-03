import type { Sale, SaleLine, SalePayload } from '../types';

export interface ComputedSale {
  lines: SaleLine[];
  totalTagihan: number;
  totalTagihanFinal: number;
  totalUnits: number;
}

/**
 * Same arithmetic as the server (10.2.24): each line's discount is divided by
 * that line's own quantity, and the nota discount is shared evenly by every unit
 * on the nota. Nothing is rounded here; amounts are rounded only when shown.
 */
export function computeSale(payload: SalePayload, lineIds: string[] = []): ComputedSale {
  const lines: SaleLine[] = payload.items.map((line, index) => {
    const tagihan = Math.round(line.hargaJual * line.jumlah);
    return {
      id: lineIds[index] ?? `line-${index}`,
      ...line,
      tagihan,
      tagihanFinal: Math.max(0, tagihan - line.diskonTagihan),
      hargaJualFinal: 0,
    };
  });

  const totalTagihan = lines.reduce((sum, line) => sum + line.tagihanFinal, 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.jumlah, 0);
  const perUnitNotaDiscount = totalUnits > 0 ? payload.diskonTotal / totalUnits : 0;

  for (const line of lines) {
    line.hargaJualFinal = line.hargaJual - line.diskonTagihan / line.jumlah - perUnitNotaDiscount;
  }

  return {
    lines,
    totalTagihan,
    totalTagihanFinal: Math.max(0, totalTagihan - payload.diskonTotal),
    totalUnits,
  };
}

/** A nota the cashier saved on this device but the centre has not confirmed yet. */
export function saleFromPayload(id: string, payload: SalePayload, base: Sale | undefined, queuedAt: string): Sale {
  const computed = computeSale(payload, base?.lines.map((line) => line.id));
  return {
    id,
    tanggal: payload.tanggal,
    waktu: payload.waktu,
    totalTagihan: computed.totalTagihan,
    diskonTotalTagihan: payload.diskonTotal,
    totalTagihanFinal: computed.totalTagihanFinal,
    metodePembayaran: payload.metodePembayaran,
    bayar: payload.bayar,
    namaPasien: payload.namaPasien,
    namaDokter: payload.namaDokter,
    namaPetugas: base?.namaPetugas ?? '',
    catatan: payload.catatan,
    locked: base?.locked ?? false,
    version: base?.version ?? 0,
    updatedAt: queuedAt,
    serverUpdatedAt: base?.serverUpdatedAt ?? queuedAt,
    lines: computed.lines,
  };
}

import type {
  PackageType,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  PurchaseInvoicePayload,
  PurchaseInvoicePayloadLine,
} from '../types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface LineAmounts {
  jumlah: number;
  hargaModal: number;
  tagihan: number;
  gross: number;
}

/**
 * Mirrors the server arithmetic so a queued invoice shows the same numbers
 * before it is confirmed: discount, then PPN, on the purchase price.
 */
export function lineAmounts(line: Pick<
  PurchaseInvoicePayloadLine,
  'kemasan' | 'jumlahBox' | 'isiPerBox' | 'jumlah' | 'hargaBeli' | 'diskonPersen' | 'ppnPersen'
>): LineAmounts {
  const net = line.hargaBeli * (1 - line.diskonPersen / 100);
  const gross = net * (1 + line.ppnPersen / 100);
  const boxed = line.kemasan === 'per box';
  const jumlah = boxed ? round2(line.jumlahBox * line.isiPerBox) : line.jumlah;
  return {
    jumlah,
    hargaModal: boxed && line.isiPerBox > 0 ? round2(gross / line.isiPerBox) : round2(gross),
    tagihan: Math.round(gross * (boxed ? line.jumlahBox : line.jumlah)),
    gross,
  };
}

export function packageLabel(kemasan: PackageType): string {
  return kemasan === 'per box' ? 'per box' : 'satu unit';
}

/**
 * Builds the row shown while an invoice waits in the outbox, so the screen does
 * not wait for the centre to agree.
 */
export function invoiceFromPayload(
  id: string,
  payload: PurchaseInvoicePayload,
  base: PurchaseInvoice | undefined,
  deviceTime: string,
): PurchaseInvoice {
  const lines: PurchaseInvoiceLine[] = payload.items.map((line, index) => {
    const amounts = lineAmounts(line);
    return {
      id: base?.lines[index]?.id ?? `${id}-line-${index}`,
      itemId: line.itemId,
      nama: line.nama ?? base?.lines[index]?.nama ?? '',
      satuan: line.satuan ?? base?.lines[index]?.satuan ?? '',
      kemasan: line.kemasan,
      jumlahBox: line.kemasan === 'per box' ? line.jumlahBox : 0,
      isiPerBox: line.kemasan === 'per box' ? line.isiPerBox : 0,
      jumlah: amounts.jumlah,
      hargaBeli: line.hargaBeli,
      diskonPersen: line.diskonPersen,
      ppnPersen: line.ppnPersen,
      hargaModal: amounts.hargaModal,
      marginPersen: line.marginPersen,
      hargaJual: line.hargaJual,
      tagihan: amounts.tagihan,
      batch: line.batch,
      tanggalExpired: line.tanggalExpired,
      urutan: index,
    };
  });

  const paid = payload.statusPelunasan === 'Lunas';
  const distributorNama =
    base?.distributorId === payload.distributorId ? base.distributorNama : (base?.distributorNama ?? '');

  return {
    id,
    nomorFaktur: payload.nomorFaktur.trim().toUpperCase(),
    distributorId: payload.distributorId,
    distributorNama,
    tanggalFaktur: payload.tanggalFaktur,
    jatuhTempo: payload.jatuhTempo,
    statusPelunasan: payload.statusPelunasan,
    tanggalPelunasan: paid ? payload.tanggalPelunasan : null,
    locked: paid,
    totalTagihan: lines.reduce((total, line) => total + line.tagihan, 0),
    petugasId: base?.petugasId ?? '',
    petugasNama: base?.petugasNama ?? '',
    catatan: payload.catatan,
    waktu: base?.waktu ?? deviceTime,
    deletedAt: null,
    version: base?.version ?? 0,
    updatedAt: deviceTime,
    serverUpdatedAt: deviceTime,
    lines,
  };
}

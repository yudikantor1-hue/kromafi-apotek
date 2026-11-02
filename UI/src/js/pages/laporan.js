Kromafi.register(() => {
    Alpine.data('laporanPage', () => ({
      storageKey: 'kromafi.laporanDraft',
      reportDraft: null,
      formData: { from: '', to: '' },
      isFormOpen: false,
      isProcessing: false,
      isDeleteConfirmOpen: false,
      reportError: '',
      loadError: '',
      toastMessage: '',
      toastTimer: null,

      init() {
        try {
          const stored = localStorage.getItem(this.storageKey);
          if (stored === null) return;
          const parsed = JSON.parse(stored);
          if (!parsed || !['proses', 'siap'].includes(parsed.status) || !Array.isArray(parsed.rows) || !parsed.from || !parsed.to) {
            throw new Error('Draft laporan tidak sesuai format.');
          }
          this.reportDraft = parsed;
        } catch (error) {
          console.error('Gagal memuat draft laporan.', error);
          this.loadError = 'Draft laporan tidak dapat dimuat. Hapus draft dari penyimpanan browser sebelum membuat laporan baru.';
        }
      },

      today() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      },

      formatDate(value) {
        if (!value) return '-';
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
      },

      openForm() {
        this.reportError = '';
        if (this.loadError) {
          this.showToast(this.loadError);
          return;
        }
        if (this.reportDraft) {
          this.showToast('Hapus laporan yang ada sebelum membuat laporan baru.');
          return;
        }
        const today = this.today();
        this.formData = { from: `${today.slice(0, 7)}-01`, to: today };
        this.isFormOpen = true;
      },

      closeForm() {
        if (this.isProcessing) return;
        this.isFormOpen = false;
        this.reportError = '';
      },

      readList(key) {
        const stored = localStorage.getItem(key);
        if (stored === null) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) throw new Error(`${key} harus berupa daftar.`);
        return parsed;
      },

      validDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
        if (!match) return false;
        const [, year, month, day] = match.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
      },

      parseAngka(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        let normalized = raw.replace(/[^\d,.-]/g, '');
        if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.').replace(/,/g, '');
        else normalized = normalized.replace(/\./g, '');
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
      },

      persistDraft(draft) {
        localStorage.setItem(this.storageKey, JSON.stringify(draft));
        this.reportDraft = draft;
      },

      processReport() {
        this.reportError = '';
        if (this.reportDraft) {
          this.reportError = 'Hapus laporan yang ada sebelum membuat laporan baru.';
          return;
        }
        const { from, to } = this.formData;
        if (!this.validDate(from) || !this.validDate(to)) {
          this.reportError = 'Tanggal awal dan akhir wajib diisi dengan tanggal yang valid.';
          return;
        }
        if (from > to) {
          this.reportError = 'Tanggal awal tidak boleh melewati tanggal akhir.';
          return;
        }

        const pendingDraft = { from, to, status: 'proses', rows: [], filename: '', generatedAt: '' };
        try {
          this.persistDraft(pendingDraft);
        } catch (error) {
          console.error('Gagal menyimpan status proses laporan.', error);
          this.reportError = 'Draft laporan gagal disimpan. Periksa ruang penyimpanan browser lalu coba lagi.';
          return;
        }

        this.isProcessing = true;
        this.reportError = '';
        window.setTimeout(() => {
          try {
            const rows = this.generateRows(from, to);
            const filename = `laporan_transaksi_${from.replace(/-/g, '')}-${to.replace(/-/g, '')}.csv`;
            const readyDraft = { from, to, status: 'siap', rows, filename, generatedAt: new Date().toISOString() };
            this.persistDraft(readyDraft);
            this.isFormOpen = false;
            this.showToast(`Laporan selesai dibuat (${rows.length} baris).`);
          } catch (error) {
            console.error('Gagal memproses laporan CSV.', error);
            this.reportError = 'Laporan gagal diproses. Hapus draft ini lalu periksa data transaksi sebelum mencoba lagi.';
            this.showToast(this.reportError);
          } finally {
            this.isProcessing = false;
          }
        }, 40);
      },

      generateRows(from, to) {
        const sales = this.readList('kromafi.penjualan');
        const invoices = this.readList('kromafi.fakturOrderan');
        const stocktakes = this.readList('kromafi.stokOpname');
        const expiredMutations = this.readList('kromafi.expiredMutasi');
        const products = this.readList('kromafi.barang');
        const inRange = date => this.validDate(date) && date >= from && date <= to;
        const isDeleted = record => record && (record.is_deleted === true || record.isDeleted === true || record.deleted === true);
        const rows = [];
        const productById = new Map(products.map(product => [String(product.id_barang ?? product.idBarang ?? product.id), product]));
        const invoiceCosts = new Map();

        invoices.filter(invoice => !isDeleted(invoice)).forEach(invoice => {
          const invoiceDate = String(invoice.tanggalFaktur ?? invoice.tanggal_faktur ?? '');
          (Array.isArray(invoice.items) ? invoice.items : []).forEach(line => {
            if (!line || line.kartuStokHapus || isDeleted(line)) return;
            const productId = line.productId ?? line.barangId ?? line.idBarang;
            if (productId === undefined || productId === null || productId === '') return;
            const key = String(productId);
            const entries = invoiceCosts.get(key) || [];
            entries.push({
              date: invoiceDate,
              batch: String(line.batch || ''),
              cost: this.parseAngka(line.hargaModal ?? line.harga_modal ?? line.hargaBeli)
            });
            invoiceCosts.set(key, entries);
          });
        });
        invoiceCosts.forEach(entries => entries.sort((a, b) => a.date.localeCompare(b.date)));

        const productCost = (productId, batch, date) => {
          const candidates = invoiceCosts.get(String(productId)) || [];
          const eligible = candidates.filter(entry => entry.cost !== null && entry.date <= date);
          const matchingBatch = eligible.filter(entry => entry.batch && entry.batch === String(batch || ''));
          const candidate = matchingBatch[matchingBatch.length - 1] || eligible[eligible.length - 1];
          if (candidate) return candidate.cost;
          const product = productById.get(String(productId));
          return product ? this.parseAngka(product.hargaModal ?? product.harga_modal) : '';
        };

        const addRow = (id, jenis, kategori, item, jumlah, satuan, hargaModal, hargaJualFinal, tanggal, distributor = '', batch = '', faktur = '') => {
          rows.push([id, jenis, kategori, item, jumlah, satuan, hargaModal, hargaJualFinal, tanggal, distributor, batch, faktur]);
        };

        sales.filter(sale => !isDeleted(sale) && inRange(String(sale.tanggal || ''))).forEach(sale => {
          (Array.isArray(sale.items) ? sale.items : []).forEach((line, index) => {
            if (!line || line.kartuStokHapus || isDeleted(line)) return;
            const quantity = this.parseAngka(line.jumlah) || 0;
            const gross = this.parseAngka(line.tagihan) ?? quantity * (this.parseAngka(line.hargaJual) || 0);
            const final = this.parseAngka(line.tagihanFinal) ?? Math.max(0, gross - (this.parseAngka(line.diskonTagihan) || 0));
            const unitFinal = quantity ? final / quantity : 0;
            const productId = line.productId ?? line.barangId ?? line.idBarang;
            const cost = line.jenis === 'jasa' ? '' : productCost(productId, line.batch, String(sale.tanggal));
            addRow(
              `penjualan-${sale.id}-${line.id ?? index + 1}`,
              'keluar',
              'penjualan',
              line.nama ?? line.nama_barang ?? '',
              quantity,
              line.satuan || (line.jenis === 'jasa' ? 'Layanan' : ''),
              cost,
              unitFinal,
              sale.tanggal,
              '',
              line.batch || '',
              ''
            );
          });
        });

        const pendingRemovalIds = new Set();
        invoices.forEach(invoice => (invoice.pendingRemovalIds || []).forEach(id => pendingRemovalIds.add(String(id))));
        invoices.filter(invoice => !isDeleted(invoice) && inRange(String(invoice.tanggalFaktur ?? invoice.tanggal_faktur ?? ''))).forEach(invoice => {
          const date = String(invoice.tanggalFaktur ?? invoice.tanggal_faktur ?? '');
          const number = String(invoice.nomorFaktur ?? invoice.nomor_faktur ?? '').toLocaleUpperCase('id');
          (Array.isArray(invoice.items) ? invoice.items : []).forEach((line, index) => {
            if (!line || line.kartuStokHapus || isDeleted(line) || pendingRemovalIds.has(String(line.id))) return;
            addRow(
              `orderan-${invoice.id}-${line.id ?? index + 1}`,
              'masuk',
              'orderan',
              line.nama ?? line.nama_barang ?? '',
              this.parseAngka(line.jumlah) || 0,
              line.satuan || '',
              this.parseAngka(line.hargaModal ?? line.harga_modal ?? line.hargaBeli) ?? '',
              this.parseAngka(line.hargaJual ?? line.harga_jual) ?? '',
              date,
              invoice.distributorNama ?? invoice.distributor_nama ?? '',
              line.batch || '',
              number
            );
          });
        });

        stocktakes.filter(entry => !isDeleted(entry) && inRange(String(entry.tanggal || ''))).forEach((entry, index) => {
          const difference = this.parseAngka(entry.selisih ?? entry.difference) || 0;
          const productId = entry.productId ?? entry.barangId ?? entry.idBarang;
          const product = productById.get(String(productId));
          if (entry.kartuStokHapus) return;
          addRow(
            `stok-opname-${entry.id ?? index + 1}`,
            difference < 0 ? 'keluar' : 'masuk',
            'stok_opname',
            entry.nama ?? entry.nama_barang ?? (product && product.nama) ?? '',
            Math.abs(difference),
            entry.satuan ?? (product && product.satuan) ?? '',
            product ? this.parseAngka(product.hargaModal ?? product.harga_modal) ?? '' : '',
            product ? this.parseAngka(product.hargaJual ?? product.harga_jual) ?? '' : '',
            entry.tanggal,
            '',
            entry.batch || '',
            ''
          );
        });

        expiredMutations.filter(entry => !isDeleted(entry) && inRange(String(entry.tanggal || ''))).forEach((entry, index) => {
          const productId = entry.productId ?? entry.barangId ?? entry.idBarang;
          const product = productById.get(String(productId));
          const quantity = Math.abs(this.parseAngka(entry.selisih ?? entry.jumlah) || 0);
          if (entry.kartuStokHapus) return;
          addRow(
            `expired-${entry.id ?? index + 1}`,
            'keluar',
            String(entry.kartuStokKategori ?? entry.tindakan ?? '').toLocaleLowerCase('id'),
            entry.nama ?? entry.nama_barang ?? (product && product.nama) ?? '',
            quantity,
            entry.satuan ?? (product && product.satuan) ?? '',
            product ? this.parseAngka(product.hargaModal ?? product.harga_modal) ?? '' : '',
            '',
            entry.tanggal,
            entry.distributorNama ?? entry.distributor_nama ?? '',
            entry.batch || '',
            String(entry.nomorFaktur ?? entry.nomor_faktur ?? '').toLocaleUpperCase('id')
          );
        });

        return rows.sort((a, b) => String(a[8]).localeCompare(String(b[8])) || String(a[0]).localeCompare(String(b[0])));
      },

      escapeCsv(value) {
        let text = String(value ?? '');
        if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      },

      downloadReport() {
        if (!this.reportDraft || this.reportDraft.status !== 'siap' || !Array.isArray(this.reportDraft.rows)) {
          this.reportError = 'Laporan belum siap diunduh.';
          return;
        }
        try {
          const header = ['id', 'jenis', 'kategori', 'item', 'jumlah', 'satuan', 'harga_modal', 'harga_jual_final', 'tanggal', 'distributor', 'batch', 'faktur'];
          const csv = [header, ...this.reportDraft.rows].map(row => row.map(value => this.escapeCsv(value)).join(',')).join('\r\n');
          const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = this.reportDraft.filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.reportError = '';
          this.showToast('File CSV berhasil disiapkan untuk diunduh.');
        } catch (error) {
          console.error('Gagal menyiapkan unduhan laporan.', error);
          this.reportError = 'File CSV gagal dibuat. Coba muat ulang halaman lalu unduh kembali.';
        }
      },

      requestDeleteReport() {
        this.isDeleteConfirmOpen = true;
      },

      cancelDeleteReport() {
        this.isDeleteConfirmOpen = false;
      },

      deleteReport() {
        if (this.isProcessing) return;
        try {
          localStorage.removeItem(this.storageKey);
          this.reportDraft = null;
          this.reportError = '';
          this.loadError = '';
          this.isDeleteConfirmOpen = false;
          this.showToast('Draft laporan dihapus. Anda dapat membuat laporan baru.');
        } catch (error) {
          console.error('Gagal menghapus draft laporan.', error);
          this.reportError = 'Draft laporan gagal dihapus. Coba lagi.';
        }
      },

      showToast(message) {
        this.toastMessage = message;
        if (this.toastTimer) window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => { this.toastMessage = ''; }, 4000);
      }
    }));

    // Distributor Page Data
});

Kromafi.register(() => {
    Alpine.data('expiredPage', () => ({
      invoices: [],
      transactions: [],
      products: [],
      distributorList: [],
      monthFilter: '',
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      selectedExpired: null,
      productQuery: '',
      productDropdownOpen: false,
      formError: '',
      toastMessage: '',
      formData: { productId: '', nama: '', jumlah: '', satuan: '', tindakan: 'Pemusnahan', tanggal: '', batch: '', nomorFaktur: '', distributorId: '' },

      init() {
        this.formData.tanggal = this.today();
        this.monthFilter = this.today().slice(0, 7);
        this.loadReferences();
      },

      readList(key) {
        const stored = localStorage.getItem(key);
        if (stored === null) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) throw new Error(`${key} harus berupa daftar.`);
        return parsed;
      },

      loadReferences() {
        const readList = (key, fallback) => {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return Array.isArray(parsed) ? parsed : fallback;
          } catch (error) {
            return fallback;
          }
        };
        this.products = readList('kromafi.barang', []);
        try {
          this.distributorList = readDistributorList();
        } catch (error) {
          console.error('Gagal memuat daftar distributor.', error);
          this.distributorList = [];
        }
        try {
          this.invoices = this.readList('kromafi.fakturOrderan');
        } catch (error) {
          console.error('Gagal memuat data faktur orderan.', error);
          this.invoices = [];
          this.showToast('Data expired tidak dapat dimuat.');
        }
        try {
          this.transactions = this.readList('kromafi.expiredMutasi');
        } catch (error) {
          console.error('Gagal memuat transaksi expired.', error);
          this.transactions = [];
        }
      },

      today() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

      formatRibuan(value) {
        const number = this.parseAngka(value);
        return number === null ? '0' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(number);
      },

      toDateInput(value) {
        if (!value) return '';
        const raw = String(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      },

      formatDate(value) {
        const dateValue = this.toDateInput(value);
        if (!dateValue) return '-';
        return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
      },

      formatMonth(value) {
        if (!value) return '';
        return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T00:00:00`));
      },

      productId(product) {
        return product.id_barang ?? product.idBarang ?? product.id;
      },

      productName(product) {
        return String(product.nama_barang ?? product.namaBarang ?? product.nama ?? '');
      },

      productUnit(product) {
        return product.satuan ?? product.unit ?? 'Unit';
      },

      loggedInStaffName() {
        try {
          const staff = findStaffByEmail(this.readList('kromafi.petugas'), localStorage.getItem('kromafi.loggedInUser'));
          return staff ? staff.nama : (localStorage.getItem('kromafi.loggedInUser') || '-');
        } catch (error) {
          console.error('Gagal membaca petugas aktif.', error);
          return localStorage.getItem('kromafi.loggedInUser') || '-';
        }
      },

      get expiredRows() {
        const rows = [];
        this.invoices.forEach((invoice, parentIndex) => {
          const lines = Array.isArray(invoice.items) ? invoice.items : [];
          lines.forEach((line, lineIndex) => {
            const expired = this.toDateInput(line.tanggalExpired ?? line.expired ?? line.tanggalKedaluwarsa ?? '');
            if (!expired) return;
            const lineProductId = line.productId ?? line.id_barang ?? line.idBarang ?? '';
            const product = this.products.find(item => String(this.productId(item)) === String(lineProductId));
            rows.push({
              id: `expired:${invoice.id ?? parentIndex}:${line.id ?? lineIndex}`,
              parentIndex,
              lineIndex,
              invoiceId: invoice.id ?? '',
              productId: lineProductId || (product ? this.productId(product) : ''),
              nama: line.nama || line.namaBarang || line.nama_barang || (product && this.productName(product)) || 'Barang tidak diketahui',
              satuan: line.satuan || (product && this.productUnit(product)) || 'Unit',
              jumlah: this.parseAngka(line.jumlah) || 0,
              tanggalExpired: expired,
              tanggalFaktur: this.toDateInput(invoice.tanggalFaktur),
              distributorNama: invoice.distributorNama || '-',
              nomorFaktur: String(invoice.nomorFaktur || '-').toLocaleUpperCase('id'),
              batch: line.batch || line.nomorBatch || '-'
            });
          });
        });
        const filtered = this.monthFilter ? rows.filter(row => row.tanggalExpired.slice(0, 7) === this.monthFilter) : [];
        return filtered.sort((a, b) => a.tanggalExpired.localeCompare(b.tanggalExpired) || a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get visibleExpired() {
        return this.expiredRows.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.expiredRows.length > this.visibleCount;
      },

      get selectedMonthLabel() {
        return this.monthFilter ? this.formatMonth(this.monthFilter) : 'Pilih bulan';
      },

      get emptyStateMessage() {
        return 'Tidak ada barang expired di bulan ini';
      },

      get productOptions() {
        return [...this.products]
          .filter(item => String(item.status ?? item.status_barang ?? 'Aktif').trim().toLocaleLowerCase('id') !== 'tidak aktif')
          .sort((a, b) => this.productName(a).localeCompare(this.productName(b), 'id', { sensitivity: 'base' }));
      },

      get filteredProductOptions() {
        const query = (this.productQuery || '').trim().toLocaleLowerCase('id');
        return this.productOptions.filter(product => !query || this.productName(product).toLocaleLowerCase('id').includes(query)).slice(0, 10);
      },

      get distributorOptions() {
        return this.distributorList
          .filter(item => String(item.status || '').trim().toLocaleLowerCase('id') === 'aktif')
          .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
      },

      daysUntilExpiry(row) {
        const target = Date.parse(`${row.tanggalExpired}T00:00:00`);
        const now = Date.parse(`${this.today()}T00:00:00`);
        return Number.isFinite(target) && Number.isFinite(now) ? Math.round((target - now) / 86400000) : null;
      },

      expiryBadgeLabel(row) {
        const days = this.daysUntilExpiry(row);
        if (days === null) return '-';
        if (days < 0) return `Kedaluwarsa ${Math.abs(days)} hari`;
        if (days === 0) return 'Kedaluwarsa hari ini';
        return `${days} hari lagi`;
      },

      expiryBadgeClass(row) {
        const days = this.daysUntilExpiry(row);
        if (days === null || days < 0) return 'bg-red-100 text-red-700 border-red-200';
        if (days <= 7) return 'bg-amber-100 text-amber-800 border-amber-200';
        if (days <= 30) return 'bg-green-100 text-green-700 border-green-200';
        return 'bg-brand-bg text-brand-secondary border-brand-border';
      },

      processedLabel(row) {
        const match = this.transactions.find(item => String(item.productId) === String(row.productId) && String(item.batch || '-') === String(row.batch) && String(item.nomorFaktur || '-') === String(row.nomorFaktur));
        return match ? `Sudah ${String(match.tindakan || '').toLocaleLowerCase('id')}` : 'Belum diproses';
      },

      openSourceInvoice() {
        if (!this.selectedExpired || this.selectedExpired.invoiceId === '') return;
        this.closeDetail();
        window.dispatchEvent(new CustomEvent('tagihan-open-invoice-detail', { detail: this.selectedExpired.invoiceId }));
      },

      loadMore() {
        this.visibleCount += 10;
      },

      openDetail(row) {
        this.selectedExpired = row;
        this.isDetailOpen = true;
        this.$nextTick(() => { if (this.$refs.expiredDetailScroll) this.$refs.expiredDetailScroll.scrollTop = 0; });
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      toggleProductDropdown() {
        this.productDropdownOpen = !this.productDropdownOpen;
        if (this.productDropdownOpen && !this.formData.productId) this.productQuery = '';
      },

      closeProductDropdown() {
        this.productDropdownOpen = false;
      },

      selectProduct(product) {
        this.formData.productId = this.productId(product);
        this.formData.nama = this.productName(product);
        this.formData.satuan = this.productUnit(product);
        this.productQuery = this.formData.nama;
        this.productDropdownOpen = false;
        this.formError = '';
      },

      openForm(row = null) {
        this.formError = '';
        this.productDropdownOpen = false;
        const prefilled = row
          ? {
            productId: row.productId || '',
            nama: row.nama || '',
            jumlah: row.jumlah ? String(row.jumlah) : '',
            satuan: row.satuan || '',
            tindakan: 'Pemusnahan',
            tanggal: this.today(),
            batch: row.batch === '-' ? '' : row.batch,
            nomorFaktur: row.nomorFaktur === '-' ? '' : row.nomorFaktur,
            distributorId: ''
          }
          : { productId: '', nama: '', jumlah: '', satuan: '', tindakan: 'Pemusnahan', tanggal: this.today(), batch: '', nomorFaktur: '', distributorId: '' };
        const distributor = prefilled.nomorFaktur ? this.invoices.find(invoice => String(invoice.nomorFaktur || '').toLocaleUpperCase('id') === prefilled.nomorFaktur.toLocaleUpperCase('id')) : null;
        this.formData = { ...prefilled, distributorId: distributor && distributor.distributorId !== undefined ? distributor.distributorId : '' };
        this.productQuery = this.formData.nama;
        this.isDetailOpen = false;
        this.isFormOpen = true;
        this.$nextTick(() => { if (this.$refs.expiredFormScroll) this.$refs.expiredFormScroll.scrollTop = 0; });
      },

      closeForm() {
        this.isFormOpen = false;
        this.productDropdownOpen = false;
      },

      saveTransaction() {
        this.formError = '';
        const product = this.productOptions.find(item => String(this.productId(item)) === String(this.formData.productId));
        const jumlah = this.parseAngka(this.formData.jumlah);
        const distributor = this.distributorOptions.find(item => String(item.id) === String(this.formData.distributorId));
        if (!product) { this.formError = 'Nama barang wajib diisi.'; return; }
        if (jumlah === null || jumlah <= 0) { this.formError = 'Jumlah harus lebih dari 0.'; return; }
        if (!['Pemusnahan', 'Retur'].includes(this.formData.tindakan)) { this.formError = 'Pilih tindakan Pemusnahan atau Retur.'; return; }
        if (!this.formData.tanggal) { this.formError = 'Tanggal wajib diisi.'; return; }
        if (this.formData.distributorId && !distributor) { this.formError = 'Pilih distributor yang tersedia.'; return; }
        const entry = {
          id: `EXP-${this.formData.tanggal.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toLocaleUpperCase('id')}`,
          productId: this.productId(product),
          nama: this.productName(product),
          satuan: this.formData.satuan || this.productUnit(product),
          jumlah,
          selisih: -Math.abs(jumlah),
          tindakan: this.formData.tindakan,
          kartuStokKategori: this.formData.tindakan,
          tanggal: this.formData.tanggal,
          batch: this.formData.batch,
          nomorFaktur: String(this.formData.nomorFaktur || '-').toLocaleUpperCase('id'),
          tanggalExpired: '',
          distributorNama: distributor ? distributor.nama : '-',
          petugasNama: this.loggedInStaffName(),
          waktu: new Date().toISOString()
        };
        this.transactions = [entry, ...this.transactions];
        try {
          localStorage.setItem('kromafi.expiredMutasi', JSON.stringify(this.transactions));
        } catch (error) {
          console.error('Gagal menyimpan transaksi expired.', error);
          this.transactions = this.transactions.filter(item => item.id !== entry.id);
          this.showToast('Transaksi gagal disimpan.');
          return;
        }
        enqueueSync({ type: 'Expired', refId: entry.id, label: `${entry.nama} (${entry.tindakan})` });
        this.closeForm();
        this.showToast(`Transaksi ${entry.tindakan.toLocaleLowerCase('id')} tersimpan.`);
      },

      showToast(message) {
        this.toastMessage = message;
        window.setTimeout(() => { if (this.toastMessage === message) this.toastMessage = ''; }, 3000);
      }
    }));
});

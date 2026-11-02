Kromafi.register(() => {
    Alpine.data('paretoPage', () => ({
      filterFrom: '',
      filterTo: '',
      filterJenis: 'semua',
      searchQuery: '',
      sales: [],
      paretoItems: [],
      hasProcessed: false,
      isStale: false,
      visibleCount: 10,

      init() {
        this.initDates();
        this.loadSales();
        if (this.isValidDateRange) {
          this.processPareto();
        }
      },

      initDates() {
        const now = new Date();
        const pad = v => String(v).padStart(2, '0');
        this.filterTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        this.filterFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      },

      loadSales() {
        try {
          const stored = localStorage.getItem('kromafi.penjualan');
          const parsed = stored ? JSON.parse(stored) : [];
          this.sales = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          this.sales = [];
        }
      },

      get daysDifference() {
        if (!this.filterFrom || !this.filterTo) return 0;
        const fromDate = new Date(`${this.filterFrom}T00:00:00`);
        const toDate = new Date(`${this.filterTo}T00:00:00`);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return 0;
        const diffTime = toDate.getTime() - fromDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
      },

      get isValidDateRange() {
        return this.daysDifference >= 1 && this.daysDifference <= 31;
      },

      get dateRangeError() {
        if (!this.filterFrom || !this.filterTo) return 'Pilih tanggal awal dan akhir.';
        const diff = this.daysDifference;
        if (diff < 1) return 'Tanggal sampai harus setelah atau sama dengan dari tanggal.';
        if (diff > 31) return 'Rentang tanggal maksimal 31 hari.';
        return '';
      },

      onFilterChange() {
        this.isStale = true;
      },

      processPareto() {
        if (!this.isValidDateRange) return;
        this.loadSales();

        const map = new Map();
        const fromStr = this.filterFrom;
        const toStr = this.filterTo;
        const selectedJenis = this.filterJenis;

        this.sales.forEach(sale => {
          if (!sale || !sale.tanggal) return;
          if (sale.tanggal < fromStr || sale.tanggal > toStr) return;
          if (!Array.isArray(sale.items)) return;

          sale.items.forEach(line => {
            if (!line || !line.nama) return;
            const lineJenis = line.jenis === 'jasa' ? 'jasa' : 'barang';

            if (selectedJenis !== 'semua' && lineJenis !== selectedJenis) return;

            const lineAmount = this.parseAngka(line.tagihanFinal) ?? (this.parseAngka(line.tagihan) || 0);
            const key = line.nama.trim().toLocaleLowerCase('id');

            if (!map.has(key)) {
              map.set(key, {
                id: line.productId || line.jasaId || line.id || key,
                nama: line.nama.trim(),
                jenis: lineJenis,
                omzet: 0
              });
            }
            const itemObj = map.get(key);
            itemObj.omzet += lineAmount;
          });
        });

        const items = Array.from(map.values());
        const grandTotal = items.reduce((sum, item) => sum + item.omzet, 0);

        items.forEach(item => {
          item.persentase = grandTotal > 0 ? (item.omzet / grandTotal) * 100 : 0;
        });
        items.sort((a, b) => b.omzet - a.omzet || a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));

        this.paretoItems = items;
        this.hasProcessed = true;
        this.isStale = false;
        this.visibleCount = 10;
      },

      get totalOmzet() {
        return this.paretoItems.reduce((sum, item) => sum + item.omzet, 0);
      },

      get filteredItems() {
        const query = this.searchQuery.trim().toLocaleLowerCase('id');
        if (!query) return this.paretoItems;
        return this.paretoItems.filter(item => item.nama.toLocaleLowerCase('id').includes(query));
      },

      get visibleItems() {
        return this.filteredItems.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredItems.length > this.visibleCount;
      },

      loadMore() {
        this.visibleCount += 10;
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
        return number === null ? '0' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(number);
      },

      formatHarga(value) {
        return `Rp ${this.formatRibuan(value)}`;
      },

      formatPersen(value) {
        const num = Number(value) || 0;
        return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num) + '%';
      }
    }));

    // Forecast Page Data
});

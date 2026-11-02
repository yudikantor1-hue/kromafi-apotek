Kromafi.register(() => {
    Alpine.data('forecastPage', () => ({
      filterFrom: '',
      filterTo: '',
      searchQuery: '',
      sales: [],
      products: [],
      forecastItems: [],
      hasProcessed: false,
      isStale: false,
      visibleCount: 10,

      init() {
        this.initDates();
        this.loadData();
        if (this.isValidDateRange) {
          this.processForecast();
        }
      },

      initDates() {
        const now = new Date();
        const pad = v => String(v).padStart(2, '0');
        this.filterTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const past = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        this.filterFrom = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
      },

      loadData() {
        try {
          const storedSales = localStorage.getItem('kromafi.penjualan');
          this.sales = storedSales ? JSON.parse(storedSales) : [];
        } catch (e) {
          this.sales = [];
        }
        try {
          const storedProducts = localStorage.getItem('kromafi.barang');
          const parsed = storedProducts ? JSON.parse(storedProducts) : [];
          this.products = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          this.products = [];
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
        return this.daysDifference >= 1 && this.daysDifference <= 92;
      },

      get dateRangeError() {
        if (!this.filterFrom || !this.filterTo) return 'Pilih tanggal awal dan akhir.';
        const diff = this.daysDifference;
        if (diff < 1) return 'Tanggal sampai harus setelah atau sama dengan dari tanggal.';
        if (diff > 92) return 'Rentang tanggal maksimal 92 hari (3 bulan).';
        return '';
      },

      onFilterChange() {
        this.isStale = true;
      },

      processForecast() {
        if (!this.isValidDateRange) return;
        this.loadData();

        const days = this.daysDifference;
        const fromStr = this.filterFrom;
        const toStr = this.filterTo;

        const salesMap = new Map();

        (this.sales || []).forEach(sale => {
          if (!sale || !sale.tanggal) return;
          if (sale.tanggal < fromStr || sale.tanggal > toStr) return;
          if (!Array.isArray(sale.items)) return;

          sale.items.forEach(line => {
            if (!line || !line.nama) return;
            if (line.jenis === 'jasa') return;

            const qty = this.parseAngka(line.jumlah) || 0;
            const keyById = line.productId ? String(line.productId) : null;
            const keyByName = line.nama.trim().toLocaleLowerCase('id');

            if (keyById) {
              salesMap.set(keyById, (salesMap.get(keyById) || 0) + qty);
            }
            salesMap.set(keyByName, (salesMap.get(keyByName) || 0) + qty);
          });
        });

        const activeProducts = this.products.filter(p => String(p.status || '').trim().toLocaleLowerCase('id') === 'aktif');

        const result = activeProducts.map(p => {
          const keyById = String(p.id);
          const keyByName = String(p.nama || '').trim().toLocaleLowerCase('id');
          const qtySold = salesMap.get(keyById) ?? salesMap.get(keyByName) ?? 0;

          const stok = this.parseAngka(p.stok) || 0;
          const kebutuhanPerHari = qtySold / days;
          const satuan = p.satuan || 'unit';

          let ketahananHari = 0;
          let isInfinite = false;

          if (kebutuhanPerHari <= 0) {
            if (stok > 0) {
              isInfinite = true;
              ketahananHari = Infinity;
            } else {
              ketahananHari = 0;
            }
          } else {
            if (stok <= 0) {
              ketahananHari = 0;
            } else {
              ketahananHari = stok / kebutuhanPerHari;
            }
          }

          return {
            id: p.id,
            nama: p.nama,
            stok,
            satuan,
            qtySold,
            kebutuhanPerHari,
            ketahananHari,
            isInfinite
          };
        });

        result.sort((a, b) => {
          if (a.ketahananHari !== b.ketahananHari) {
            return a.ketahananHari - b.ketahananHari;
          }
          return a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' });
        });

        this.forecastItems = result;
        this.hasProcessed = true;
        this.isStale = false;
        this.visibleCount = 10;
      },

      get filteredItems() {
        const query = this.searchQuery.trim().toLocaleLowerCase('id');
        if (!query) return this.forecastItems;
        return this.forecastItems.filter(item => item.nama.toLocaleLowerCase('id').includes(query));
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

      formatKetahanan(item) {
        if (item.isInfinite) return 'Tak terhingga';
        const val = Math.floor(item.ketahananHari);
        return `${this.formatRibuan(val)} hari`;
      },

      formatKebutuhan(item) {
        const num = item.kebutuhanPerHari;
        if (num === 0) return `0 ${item.satuan}/hari`;
        const formattedNum = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num);
        return `${formattedNum} ${item.satuan}/hari`;
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
      }
    }));
});

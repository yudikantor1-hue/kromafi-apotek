Kromafi.register(() => {
    Alpine.data('barangMinusPage', () => ({
      barangList: [],
      visibleCount: 10,
      loadError: '',

      init() {
        try {
          const stored = localStorage.getItem('db_barang');
          if (stored === null) return;
          const parsed = JSON.parse(stored);
          if (!Array.isArray(parsed)) throw new Error('Data barang harus berupa daftar.');
          this.barangList = parsed;
        } catch (error) {
          console.error('Gagal memuat data barang minus:', error);
          this.loadError = 'Data barang tidak dapat dimuat.';
        }
      },

      get filteredBarangMinus() {
        return this.barangList
          .filter(item => item && item.nama && Number.isFinite(Number(item.stok)) && Number(item.stok) < 0)
          .sort((a, b) => Number(a.stok) - Number(b.stok));
      },

      get visibleBarangMinus() {
        return this.filteredBarangMinus.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredBarangMinus.length > this.visibleCount;
      },

      loadMore() {
        this.visibleCount += 10;
      },

      formatRibuan(value) {
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value));
      }
    }));
});

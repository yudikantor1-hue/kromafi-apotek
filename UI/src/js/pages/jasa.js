Kromafi.register(() => {
    Alpine.data('jasaPage', () => ({
      filter: 'semua',
      searchQuery: '',
      isSearchOpen: false,
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      formError: '',
      selectedItem: null,
      formData: {
        id: null,
        nama: '',
        harga: '',
        status: 'Aktif'
      },
      jasaList: [
        { id: 1, nama: 'Suntik', harga: 100000, status: 'Aktif' },
        { id: 2, nama: 'Infus', harga: 150000, status: 'Aktif' },
        { id: 3, nama: 'Cek darah', harga: 50000, status: 'Tidak aktif' },
      ],

      init() {
        try {
          const stored = localStorage.getItem('kromafi.jasa');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) this.jasaList = parsed;
          }
        } catch (e) {}
      },

      get filteredJasa() {
        let list = this.jasaList;
        if (this.filter === 'aktif') list = list.filter(item => item.status === 'Aktif');
        if (this.filter === 'tidak aktif') list = list.filter(item => item.status === 'Tidak aktif');
        const query = this.searchQuery.trim().toLocaleLowerCase('id');
        if (query) list = list.filter(item => item.nama.toLocaleLowerCase('id').includes(query));
        return [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get visibleJasa() {
        return this.filteredJasa.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredJasa.length > this.visibleCount;
      },

      toggleSearch() {
        this.isSearchOpen = !this.isSearchOpen;
        if (this.isSearchOpen) {
          this.$nextTick(() => this.$refs.searchInput.focus());
        } else {
          this.searchQuery = '';
        }
      },

      loadMore() {
        this.visibleCount += 10;
      },

      formatHarga(harga) {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
        }).format(Number(harga) || 0);
      },

      openDetail(item) {
        this.selectedItem = { ...item };
        this.isDetailOpen = true;
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      openForm(item = null) {
        this.formError = '';
        this.formData = item
          ? { ...item }
          : { id: null, nama: '', harga: '', status: 'Aktif' };
        this.isDetailOpen = false;
        this.isFormOpen = true;
      },

      closeForm() {
        this.isFormOpen = false;
        this.formError = '';
      },

      saveList() {
        try {
          localStorage.setItem('kromafi.jasa', JSON.stringify(this.jasaList));
        } catch (e) {}
      },

      saveJasa() {
        this.formError = '';
        const nama = this.formData.nama.trim();
        const harga = Number(this.formData.harga);
        if (!nama || !Number.isFinite(harga) || harga < 0) return;

        const readList = (key) => {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) { return []; }
        };

        const currentBarangList = readList('kromafi.barang');
        const currentJasaList = readList('kromafi.jasa');
        const normalizedNama = nama.toLocaleLowerCase('id');
        const editId = this.formData.id;

        const existsInJasa = currentJasaList.some(j => String(j.id) !== String(editId) && String(j.nama || '').trim().toLocaleLowerCase('id') === normalizedNama);
        const existsInBarang = currentBarangList.some(b => String(b.nama || '').trim().toLocaleLowerCase('id') === normalizedNama);

        if (existsInBarang || existsInJasa) {
          this.formError = 'Nama sudah dipakai';
          return;
        }

        this.formData.nama = nama;
        this.formData.harga = harga;
        if (this.formData.id) {
          const index = this.jasaList.findIndex(item => item.id === this.formData.id);
          if (index !== -1) {
            this.jasaList[index] = { ...this.formData };
            this.selectedItem = { ...this.formData };
          }
        } else {
          const newItem = { ...this.formData, id: Date.now() };
          this.jasaList.unshift(newItem);
          this.selectedItem = newItem;
        }
        this.saveList();
        this.isFormOpen = false;
        this.isDetailOpen = true;
      }
    }));

    // Penjualan Page Data
});

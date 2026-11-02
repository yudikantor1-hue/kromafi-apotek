Kromafi.register(() => {
    Alpine.data('barangPage', () => ({
      filter: 'semua',
      searchQuery: '',
      isSearchOpen: false,
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      formError: '',
      selectedItem: null,
      lemariOptions: [],
      formData: {
        id: null,
        nama: '',
        stok: 0,
        hargaModal: '',
        hargaJual: '',
        satuan: '',
        lemari: '',
        status: 'Aktif'
      },
      barangList: [
        { id: 1, nama: 'Amoxicilin', stok: 300, hargaModal: 400, hargaJual: 500, satuan: 'Tablet', lemari: 'Lemari depan', status: 'Aktif' },
        { id: 2, nama: 'Betametason', stok: 25, hargaModal: 4000, hargaJual: 5000, satuan: 'Tube', lemari: 'Lemari depan', status: 'Aktif' },
        { id: 3, nama: 'Cetirizin', stok: 400, hargaModal: 300, hargaJual: 400, satuan: 'Tablet', lemari: 'Lemari narkotik', status: 'Tidak aktif' },
      ],

      init() {
        try {
          const stored = localStorage.getItem('kromafi.barang');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) this.barangList = parsed;
          }
        } catch (e) {}
        this.loadLemariOptions();
      },

      loadLemariOptions() {
        const defaultLemari = [
          { nama: 'Lemari narkotik', status: 'Aktif' },
          { nama: 'Lemari depan', status: 'Aktif' },
          { nama: 'Lemari belakang', status: 'Tidak aktif' }
        ];
        try {
          const stored = localStorage.getItem('kromafi.lemari');
          const parsed = stored ? JSON.parse(stored) : defaultLemari;
          this.lemariOptions = Array.isArray(parsed)
            ? parsed.filter(item => item.status === 'Aktif' && item.nama).map(item => item.nama)
            : defaultLemari.filter(item => item.status === 'Aktif').map(item => item.nama);
        } catch (e) {
          this.lemariOptions = defaultLemari.filter(item => item.status === 'Aktif').map(item => item.nama);
        }
      },

      get filteredBarang() {
        let list = this.barangList;
        if (this.filter === 'aktif') list = list.filter(item => item.status === 'Aktif');
        if (this.filter === 'tidak aktif') list = list.filter(item => item.status === 'Tidak aktif');
        const query = this.searchQuery.trim().toLocaleLowerCase('id');
        if (query) list = list.filter(item => item.nama.toLocaleLowerCase('id').includes(query));
        return [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get visibleBarang() {
        return this.filteredBarang.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredBarang.length > this.visibleCount;
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

      formatStok(stok) {
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(stok) || 0);
      },

      openDetail(item) {
        this.selectedItem = { ...item };
        this.isDetailOpen = true;
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      openForm(item = null) {
        this.loadLemariOptions();
        this.formError = '';
        this.formData = item
          ? { ...item }
          : { id: null, nama: '', stok: 0, hargaModal: '', hargaJual: '', satuan: '', lemari: '', status: 'Aktif' };
        this.isDetailOpen = false;
        this.isFormOpen = true;
      },

      closeForm() {
        this.isFormOpen = false;
        this.formError = '';
      },

      saveList() {
        try {
          localStorage.setItem('kromafi.barang', JSON.stringify(this.barangList));
        } catch (e) {}
      },

      saveBarang() {
        this.formError = '';
        const nama = this.formData.nama.trim();
        const satuan = this.formData.satuan.trim();
        const hargaModal = Number(this.formData.hargaModal);
        const hargaJual = Number(this.formData.hargaJual);
        if (!nama || !satuan || !Number.isFinite(hargaModal) || hargaModal < 0 || !Number.isFinite(hargaJual) || hargaJual < 0) return;

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

        const existsInBarang = currentBarangList.some(b => String(b.id) !== String(editId) && String(b.nama || '').trim().toLocaleLowerCase('id') === normalizedNama);
        const existsInJasa = currentJasaList.some(j => String(j.nama || '').trim().toLocaleLowerCase('id') === normalizedNama);

        if (existsInBarang || existsInJasa) {
          this.formError = 'Nama sudah dipakai';
          return;
        }

        const item = {
          ...this.formData,
          nama,
          satuan,
          hargaModal,
          hargaJual,
          stok: Number(this.formData.stok) || 0,
          lemari: this.lemariOptions.includes(this.formData.lemari) ? this.formData.lemari : ''
        };
        if (item.id) {
          const index = this.barangList.findIndex(existing => existing.id === item.id);
          if (index !== -1) {
            this.barangList[index] = item;
            this.selectedItem = { ...item };
          }
        } else {
          item.id = Date.now();
          item.stok = 0;
          this.barangList.unshift(item);
          this.selectedItem = item;
        }
        this.saveList();
        this.isFormOpen = false;
        this.isDetailOpen = true;
      }
    }));
});

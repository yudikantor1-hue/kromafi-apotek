Kromafi.register(() => {
    Alpine.data('lemariPage', () => ({
      filter: 'semua', // 'semua', 'aktif', 'tidak aktif'
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      selectedLemari: null,
      formData: {
        id: null,
        nama: '',
        status: 'Aktif'
      },
      lemariList: [
        { id: 1, nama: 'Lemari narkotik', status: 'Aktif' },
        { id: 2, nama: 'Lemari depan', status: 'Aktif' },
        { id: 3, nama: 'Lemari belakang', status: 'Tidak aktif' },
      ],

      init() {
        try {
          const stored = localStorage.getItem('kromafi.lemari');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) this.lemariList = parsed;
          }
        } catch (e) {}
      },

      get filteredLemari() {
        let list = this.lemariList;
        if (this.filter === 'aktif') list = list.filter(l => l.status === 'Aktif');
        if (this.filter === 'tidak aktif') list = list.filter(l => l.status === 'Tidak aktif');
        return [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get visibleLemari() {
        return this.filteredLemari.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredLemari.length > this.visibleCount;
      },

      loadMore() {
        this.visibleCount += 10;
      },

      openDetail(lemari) {
        this.selectedLemari = { ...lemari };
        this.isDetailOpen = true;
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      openForm(lemari = null) {
        if (lemari) {
          this.formData = { ...lemari };
        } else {
          this.formData = { id: null, nama: '', status: 'Aktif' };
        }
        this.isDetailOpen = false;
        this.isFormOpen = true;
      },

      closeForm() {
        this.isFormOpen = false;
      },

      saveList() {
        try {
          localStorage.setItem('kromafi.lemari', JSON.stringify(this.lemariList));
        } catch (e) {}
      },

      saveLemari() {
        if (!this.formData.nama.trim()) return;
        this.formData.nama = this.formData.nama.trim();
        if (this.formData.id) {
          const idx = this.lemariList.findIndex(l => l.id === this.formData.id);
          if (idx !== -1) {
            this.lemariList[idx] = { ...this.formData };
            this.selectedLemari = { ...this.formData };
          }
        } else {
          const newId = Date.now();
          const newItem = { ...this.formData, id: newId };
          this.lemariList.unshift(newItem);
          this.selectedLemari = newItem;
        }
        this.saveList();
        this.isFormOpen = false;
        this.isDetailOpen = true;
      }
    }));

    // Metode Pembayaran Page Data
});

Kromafi.register(() => {
    Alpine.data('distributorPage', () => ({
      filter: 'semua', // 'semua', 'aktif', 'tidak aktif'
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      selectedItem: null,
      formData: {
        id: null,
        nama: '',
        status: 'Aktif'
      },
      itemList: [
        { id: 1, nama: 'BSP', status: 'Aktif' },
        { id: 2, nama: 'Enseval', status: 'Aktif' },
        { id: 3, nama: 'MPI', status: 'Tidak aktif' },
      ],

      init() {
        try {
          const stored = localStorage.getItem('kromafi.distributors');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) this.itemList = parsed;
          }
        } catch (e) {}
      },

      get filteredList() {
        let list = this.itemList;
        if (this.filter === 'aktif') list = list.filter(item => item.status === 'Aktif');
        if (this.filter === 'tidak aktif') list = list.filter(item => item.status === 'Tidak aktif');
        return [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get visibleList() {
        return this.filteredList.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredList.length > this.visibleCount;
      },

      loadMore() {
        this.visibleCount += 10;
      },

      openDetail(item) {
        this.selectedItem = { ...item };
        this.isDetailOpen = true;
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      openForm(item = null) {
        if (item) {
          this.formData = { ...item };
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
          localStorage.setItem('kromafi.distributors', JSON.stringify(this.itemList));
        } catch (e) {}
      },

      saveItem() {
        if (!this.formData.nama.trim()) return;
        this.formData.nama = this.formData.nama.trim();
        if (this.formData.id) {
          const idx = this.itemList.findIndex(i => i.id === this.formData.id);
          if (idx !== -1) {
            this.itemList[idx] = { ...this.formData };
            this.selectedItem = { ...this.formData };
          }
        } else {
          const newId = Date.now();
          const newItem = { ...this.formData, id: newId };
          this.itemList.unshift(newItem);
          this.selectedItem = newItem;
        }
        this.saveList();
        this.isFormOpen = false;
        this.isDetailOpen = true;
      }
    }));
});

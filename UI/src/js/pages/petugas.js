Kromafi.register(() => {
    Alpine.data('petugasPage', () => ({
      filter: 'semua', // 'semua', 'aktif', 'tidak aktif'
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      formError: '',
      selectedPetugas: null,
      formData: {
        id: null,
        nama: '',
        email: '',
        password: '',
        role: 'staf',
        status: 'Aktif'
      },
      petugasList: DEFAULT_STAFF_LIST.map(item => ({ ...item })),

      init() {
        this.petugasList = readStaffList();
      },

      get activeStaff() {
        return findStaffByEmail(this.petugasList, localStorage.getItem('kromafi.loggedInUser'));
      },

      get isAdmin() {
        return !!this.activeStaff && String(this.activeStaff.role || '').trim().toLocaleLowerCase('id') === 'admin';
      },

      roleLabel(role) {
        const text = String(role || '').trim();
        if (!text) return '-';
        return text.charAt(0).toLocaleUpperCase('id') + text.slice(1);
      },

      get filteredPetugas() {
        let list = this.isAdmin
          ? this.petugasList
          : this.activeStaff
            ? this.petugasList.filter(petugas => String(petugas.id) === String(this.activeStaff.id))
            : [];
        if (!this.isAdmin) return [...list];
        if (this.filter === 'aktif') list = list.filter(p => p.status === 'Aktif');
        if (this.filter === 'tidak aktif') list = list.filter(p => p.status === 'Tidak aktif');
        return [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get visiblePetugas() {
        return this.filteredPetugas.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredPetugas.length > this.visibleCount;
      },

      loadMore() {
        this.visibleCount += 10;
      },

      openDetail(petugas) {
        this.selectedPetugas = { ...petugas };
        this.isDetailOpen = true;
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      openForm(petugas = null) {
        if (!this.isAdmin) return;
        this.formError = '';
        if (petugas) {
          this.formData = { ...petugas, password: '' };
        } else {
          this.formData = { id: null, nama: '', email: '', password: '', role: 'staf', status: 'Aktif' };
        }
        this.isDetailOpen = false;
        this.isFormOpen = true;
      },

      closeForm() {
        this.isFormOpen = false;
      },

      async savePetugas() {
        if (!this.isAdmin) return;
        this.formError = '';
        const nama = String(this.formData.nama || '').trim();
        const email = String(this.formData.email || '').trim().toLocaleLowerCase('id');
        if (!nama || !email) {
          this.formError = 'Nama dan email wajib diisi.';
          return;
        }
        if (this.petugasList.some(staff => String(staff.email || '').toLocaleLowerCase('id') === email && String(staff.id) !== String(this.formData.id || ''))) {
          this.formError = 'Email sudah digunakan oleh petugas lain.';
          return;
        }

        try {
          let nextList;
          let savedStaff;
          if (this.formData.id) {
            const index = this.petugasList.findIndex(staff => String(staff.id) === String(this.formData.id));
            if (index < 0) {
              this.formError = 'Petugas tidak ditemukan.';
              return;
            }
            savedStaff = {
              ...this.petugasList[index],
              nama,
              email,
              role: this.formData.role === 'admin' ? 'admin' : 'staf',
              status: this.formData.status
            };
            nextList = [...this.petugasList];
            nextList.splice(index, 1, savedStaff);
          } else {
            if (!this.formData.password) {
              this.formError = 'Password awal wajib diisi.';
              return;
            }
            savedStaff = {
              id: Date.now(),
              nama,
              email,
              role: this.formData.role === 'admin' ? 'admin' : 'staf',
              status: this.formData.status,
              ...await hashStaffPassword(this.formData.password)
            };
            nextList = [savedStaff, ...this.petugasList];
          }

          localStorage.setItem('kromafi.petugas', JSON.stringify(nextList));
          this.petugasList = nextList;
          this.selectedPetugas = { ...savedStaff };
          this.isFormOpen = false;
          this.isDetailOpen = true;
        } catch (error) {
          console.error('Gagal menyimpan petugas.', error);
          this.formError = error.message || 'Petugas gagal disimpan. Coba lagi.';
        }
      }
    }));

    // Lemari Page Data
});

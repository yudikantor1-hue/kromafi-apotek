Kromafi.register(() => {
    Alpine.data('profilApotekPage', () => ({
      formData: {
        name: 'Kromafi Apotek',
        address: ''
      },
      errors: {},
      isLoading: false,
      toastMessage: null,

      init() {
        this.loadStore();
      },

      get isAdmin() {
        const staff = findStaffByEmail(readStaffList(), localStorage.getItem('kromafi.loggedInUser'));
        return !!staff && String(staff.role || '').trim().toLocaleLowerCase('id') === 'admin';
      },

      loadStore() {
        try {
          const stored = localStorage.getItem('kromafi.pharmacy');
          if (stored) {
            const parsed = JSON.parse(stored);
            this.formData = {
              name: parsed.name || 'Kromafi Apotek',
              address: parsed.address || ''
            };
            return;
          }
        } catch(e) {}
        this.formData = { name: 'Kromafi Apotek', address: '' };
      },

      validate() {
        this.errors = {};
        if (!this.formData.name.trim()) {
          this.errors.name = 'Nama apotek wajib diisi';
        }
        return Object.keys(this.errors).length === 0;
      },

      save() {
        if (!this.isAdmin) return;
        if (!this.validate()) return;
        this.isLoading = true;
        setTimeout(() => {
          const dataToSave = {
            name: this.formData.name.trim(),
            address: this.formData.address.trim()
          };
          localStorage.setItem('kromafi.pharmacy', JSON.stringify(dataToSave));
          window.dispatchEvent(new CustomEvent('pharmacy-updated'));
          this.isLoading = false;
          this.toastMessage = 'Profil apotek tersimpan';
          setTimeout(() => { this.toastMessage = null; }, 3000);
        }, 400);
      },

      reset() {
        this.loadStore();
        this.errors = {};
      }
    }));

    // Petugas Page Data
});

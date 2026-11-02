Kromafi.register(() => {
    Alpine.data('app', () => ({
      page: 'login',
      isDrawerOpen: false,
      headerTitle: 'Petugas',
      headerMode: 'list',
      pharmacyName: 'Kromafi Apotek',
      loginEmail: '',
      loginPassword: '',
      loginError: '',
      showPassword: false,
      isLoggingIn: false,
      accountsReady: false,
      isForgotPasswordOpen: false,
      forgotPasswordStep: 'email',
      forgotPasswordEmail: '',
      forgotPasswordMessage: '',
      currentUser: '',
      syncQueueCount: 0,
      syncNotice: '',
      syncNoticeTimer: null,

      init() {
        ensureStaffAccounts().then(() => {
          this.currentUser = this.readGasUser() || localStorage.getItem('kromafi.loggedInUser') || '';
          this.accountsReady = true;
        }).catch(error => {
          console.error('Gagal menyiapkan akun aplikasi.', error);
          this.loginError = error.message || 'Akun tidak dapat disiapkan.';
        });
        this.loadPharmacy();
        this.refreshSyncQueue();
        window.addEventListener('pharmacy-updated', () => {
          this.loadPharmacy();
        });
        window.addEventListener('sync-queue-updated', () => {
          this.refreshSyncQueue();
        });
      },

      get activeStaff() {
        const login = (localStorage.getItem('kromafi.loggedInUser') || '').trim();
        return findStaffByEmail(readStaffList(), login);
      },

      get activeStaffName() {
        if (this.activeStaff) return this.activeStaff.nama;
        return (localStorage.getItem('kromafi.loggedInUser') || '').trim() || '-';
      },

      get activeStaffRole() {
        const role = this.activeStaff ? String(this.activeStaff.role || '').trim() : '';
        if (!role) return '-';
        return role.charAt(0).toLocaleUpperCase('id') + role.slice(1);
      },

      get isAdmin() {
        return !!this.activeStaff && String(this.activeStaff.role || '').trim().toLocaleLowerCase('id') === 'admin';
      },

      refreshSyncQueue() {
        this.syncQueueCount = readSyncQueue().length;
      },

      showSyncNotice(message) {
        this.syncNotice = message;
        window.clearTimeout(this.syncNoticeTimer);
        this.syncNoticeTimer = window.setTimeout(() => { this.syncNotice = ''; }, 4000);
      },

      syncNow() {
        const count = readSyncQueue().length;
        if (!count) {
          this.showSyncNotice('Tidak ada data yang menunggu dikirim.');
          return;
        }
        this.showSyncNotice(`Pusat belum diatur. ${count} transaksi tetap tersimpan di antrean.`);
      },

      loadPharmacy() {
        try {
          const stored = localStorage.getItem('kromafi.pharmacy');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.name) {
              this.pharmacyName = parsed.name;
              return;
            }
          }
        } catch(e) {}
        this.pharmacyName = 'Kromafi Apotek';
      },

      async login() {
        this.loginError = '';
        const email = this.loginEmail.trim();
        const password = this.loginPassword;

        if (!this.accountsReady) {
          this.loginError = 'Akun belum siap. Muat ulang aplikasi atau hubungi admin.';
          return;
        }
        if (!email || !password) {
          this.loginError = 'Email dan password wajib diisi.';
          return;
        }

        this.isLoggingIn = true;
        try {
          const now = Date.now();
          const lockedUntil = loginLockout(email, now);
          if (lockedUntil > now) {
            const minutes = Math.ceil((lockedUntil - now) / 60000);
            this.loginError = `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`;
            return;
          }

          const staff = findStaffByEmail(readStaffList(), email);
          const isActive = staff && String(staff.status || '').trim().toLocaleLowerCase('id') === 'aktif';
          if (!isActive || !(await verifyStaffPassword(staff, password))) {
            const attempt = recordFailedLogin(email, now);
            this.loginError = attempt.lockedUntil > now
              ? 'Terlalu banyak percobaan. Akun dikunci selama 15 menit.'
              : 'Email atau password salah.';
            this.loginPassword = '';
            return;
          }

          clearFailedLogin(email);
          this.currentUser = staffLoginKey(staff);
          localStorage.setItem('kromafi.loggedInUser', this.currentUser);
          this.showPassword = false;
          this.loginPassword = '';
          this.page = 'petugas';
        } catch (error) {
          console.error('Gagal memproses login.', error);
          this.loginError = error.message || 'Login tidak dapat diproses. Coba lagi.';
        } finally {
          this.isLoggingIn = false;
        }
      },

      openForgotPassword() {
        this.forgotPasswordEmail = this.loginEmail.trim();
        this.forgotPasswordStep = 'email';
        this.forgotPasswordMessage = '';
        this.isForgotPasswordOpen = true;
      },

      continueForgotPassword() {
        this.forgotPasswordEmail = this.forgotPasswordEmail.trim().toLocaleLowerCase('id');
        this.forgotPasswordStep = 'confirm';
        this.forgotPasswordMessage = '';
      },

      confirmForgotPassword() {
        this.forgotPasswordStep = 'unavailable';
        this.forgotPasswordMessage = 'Tautan reset belum dapat dikirim karena server dan layanan email belum dikonfigurasi.';
      },

      closeForgotPassword() {
        this.isForgotPasswordOpen = false;
        this.forgotPasswordStep = 'email';
        this.forgotPasswordMessage = '';
      },

      readGasUser() {
        const value = document.getElementById('gas-active-user')?.textContent.trim() || '';
        return value.includes('<?') ? '' : value;
      },

      openInvoiceFromTagihan(invoiceId) {
        this.page = 'faktur orderan';
        this.isDrawerOpen = false;
        this.$nextTick(() => {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-invoice-detail-from-tagihan', { detail: invoiceId }));
          }, 0);
        });
      },
      
      logout() {
        this.currentUser = '';
        localStorage.removeItem('kromafi.loggedInUser');
        this.page = 'login';
        this.isDrawerOpen = false;
        this.showPassword = false;
        this.loginPassword = '';
        this.loginError = '';
        this.isForgotPasswordOpen = false;
        this.forgotPasswordStep = 'email';
        this.forgotPasswordEmail = '';
        this.forgotPasswordMessage = '';
      }
    }));

    // Profil Apotek Page Data
});

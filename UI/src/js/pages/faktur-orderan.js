Kromafi.register(() => {
    Alpine.data('fakturOrderanPage', () => ({
      distributorFilter: 'semua',
      monthFilter: '',
      openFilterDropdown: false,
      invoiceDistributorDropdownOpen: false,
      visibleCount: 10,
      invoices: [],
      distributorList: [],
      productList: [],
      staffList: [],
      isDetailOpen: false,
      isFormOpen: false,
      isLineFormOpen: false,
      isLineDetailOpen: false,
      isMarkPaidDialogOpen: false,
      isDeleteConfirmOpen: false,
      deleteConfirmMessage: '',
      deleteConfirmHandler: null,
      viewOnlyFromTagihan: false,
      autocompleteOpen: false,
      selectedInvoice: null,
      selectedLine: null,
      selectedProduct: null,
      lineFormIndex: null,
      isHargaJualEdited: false,
      formError: '',
      lineFormError: '',
      markPaidError: '',
      paymentDateDraft: '',
      toastMessage: '',
      formData: { items: [] },
      lineForm: { kemasan: 'satu unit', productId: '', jumlah: '', jumlahBox: '', isiPerBox: '', hargaBeli: '', diskon: 0, ppn: 0, margin: 0, hargaJual: '', tanggalExpired: '', batch: '' },

      init() {
        this.loadReferences();
        const now = new Date();
        this.monthFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        try {
          const stored = localStorage.getItem('kromafi.fakturOrderan');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) this.invoices = parsed;
          }
        } catch (e) {}
      },

      loadReferences() {
        const readList = (key, fallback) => {
          try {
            const stored = localStorage.getItem(key);
            const parsed = stored ? JSON.parse(stored) : null;
            return Array.isArray(parsed) ? parsed : fallback;
          } catch (e) {
            return fallback;
          }
        };
        try {
          this.distributorList = readDistributorList();
        } catch (error) {
          console.error('Gagal memuat daftar distributor.', error);
          this.distributorList = [];
          this.toastMessage = 'Daftar distributor tidak dapat dimuat.';
        }
        this.productList = readList('kromafi.barang', [
          { id: 1, nama: 'Amoxicilin', hargaModal: 400, hargaJual: 500, satuan: 'Tablet', status: 'Aktif' },
          { id: 2, nama: 'Betametason', hargaModal: 4000, hargaJual: 5000, satuan: 'Tube', status: 'Aktif' },
          { id: 3, nama: 'Cetirizin', hargaModal: 300, hargaJual: 400, satuan: 'Tablet', status: 'Tidak aktif' }
        ]);
        this.staffList = readList('kromafi.petugas', DEFAULT_STAFF_LIST.map(item => ({ ...item })));
      },

      get distributorOptions() {
        return this.distributorList.filter(item => String(item.status || '').trim().toLocaleLowerCase('id') === 'aktif').sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
      },

      toggleFilterDropdown() {
        this.openFilterDropdown = !this.openFilterDropdown;
      },

      closeFilterDropdown() {
        this.openFilterDropdown = false;
      },

      toggleInvoiceDistributorDropdown() {
        this.invoiceDistributorDropdownOpen = !this.invoiceDistributorDropdownOpen;
      },

      closeInvoiceDistributorDropdown() {
        this.invoiceDistributorDropdownOpen = false;
      },

      get productOptions() {
        return [...this.productList].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get filteredProductOptions() {
        const query = (this.lineForm.nama || '').trim().toLocaleLowerCase('id');
        return this.productOptions
          .filter(product => !query || product.nama.toLocaleLowerCase('id').includes(query))
          .slice(0, 10);
      },

      get hargaModalLama() {
        if (!this.selectedProduct) return null;
        return this.selectedProduct.harga_modal_lama ?? this.selectedProduct.hargaModalLama ?? this.selectedProduct.hargaModal ?? this.selectedProduct.harga_modal ?? null;
      },

      get hargaJualLama() {
        if (!this.selectedProduct) return null;
        return this.selectedProduct.harga_jual_lama ?? this.selectedProduct.hargaJualLama ?? this.selectedProduct.hargaJual ?? this.selectedProduct.harga_jual ?? null;
      },

      get hasHargaModalLama() {
        return this.parseAngka(this.hargaModalLama) !== null;
      },

      get hasHargaJualLama() {
        return this.parseAngka(this.hargaJualLama) !== null;
      },

      get staffOptions() {
        return this.staffList.filter(item => item.status !== 'Tidak aktif').sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get activeStaff() {
        return findStaffByEmail(this.staffList, localStorage.getItem('kromafi.loggedInUser'));
      },

      get isAdmin() {
        return !!this.activeStaff && String(this.activeStaff.role || '').trim().toLocaleLowerCase('id') === 'admin';
      },

      get filteredInvoices() {
        let list = this.invoices;
        if (this.monthFilter) {
          list = list.filter(invoice => String(invoice.tanggalFaktur || '').slice(0, 7) === this.monthFilter);
        }
        if (this.distributorFilter !== 'semua') {
          list = list.filter(invoice => String(invoice.distributorId) === this.distributorFilter);
        }
        return [...list].sort((a, b) => (b.tanggalFaktur || '').localeCompare(a.tanggalFaktur || ''));
      },

      get visibleInvoices() {
        return this.filteredInvoices.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredInvoices.length > this.visibleCount;
      },

      get totalFormTagihan() {
        return (this.formData.items || []).reduce((total, item) => total + (Number(item.tagihan) || 0), 0);
      },

      formatRibuan(value) {
        if (value === '' || value === null || value === undefined) return '';
        const number = this.parseAngka(value);
        return number === null ? '' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 20 }).format(number);
      },

      parseAngka(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        let normalized = raw.replace(/[^\d,.-]/g, '');
        if (normalized.includes(',')) {
          normalized = normalized.replace(/\./g, '').replace(',', '.').replace(/,/g, '');
        } else {
          normalized = normalized.replace(/\./g, '');
        }
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
      },

      formatPersen(value) {
        const number = this.parseAngka(value);
        return number === null ? '' : new Intl.NumberFormat('id-ID', { useGrouping: false, maximumFractionDigits: 20 }).format(number);
      },

      normalizeInputValue(value, grouped) {
        let raw = String(value ?? '').replace(/[^\d.,-]/g, '');
        if (grouped) {
          if (!raw.includes(',') && raw.includes('.')) {
            const lastDot = raw.lastIndexOf('.');
            const decimals = raw.length - lastDot - 1;
            if (decimals <= 2) raw = raw.slice(0, lastDot).replace(/\./g, '') + ',' + raw.slice(lastDot + 1);
          }
          const decimalIndex = raw.indexOf(',');
          if (decimalIndex !== -1) raw = raw.slice(0, decimalIndex).replace(/\./g, '') + ',' + raw.slice(decimalIndex + 1).replace(/[,.]/g, '');
          else raw = raw.replace(/[,.]/g, '');
          return raw;
        }
        if (raw.includes(',')) {
          const decimalIndex = raw.indexOf(',');
          raw = raw.slice(0, decimalIndex).replace(/[,.]/g, '') + ',' + raw.slice(decimalIndex + 1).replace(/[,.]/g, '');
        } else if (raw.includes('.')) {
          const decimalIndex = raw.lastIndexOf('.');
          raw = raw.slice(0, decimalIndex).replace(/[,.]/g, '') + ',' + raw.slice(decimalIndex + 1).replace(/[,.]/g, '');
        }
        return raw;
      },

      formatInput(event, field, grouped) {
        const input = event.target;
        const original = input.value;
        const caret = input.selectionStart ?? original.length;
        const digitsBefore = (original.slice(0, caret).match(/\d/g) || []).length;
        const decimalBefore = original.slice(0, caret).includes(',');
        const normalized = this.normalizeInputValue(original, grouped);
        const number = this.parseAngka(normalized);
        let formatted = number === null ? '' : grouped ? this.formatRibuan(number) : this.formatPersen(number);
        if (normalized.endsWith(',') && !formatted.includes(',')) formatted += ',';
        this.lineForm[field] = formatted;
        input.value = formatted;
        let nextCaret = 0;
        let digitCount = 0;
        while (nextCaret < formatted.length && digitCount < digitsBefore) {
          if (/\d/.test(formatted[nextCaret])) digitCount += 1;
          nextCaret += 1;
        }
        if (decimalBefore && formatted[nextCaret] === ',') nextCaret += 1;
        input.setSelectionRange(nextCaret, nextCaret);
        if (['hargaBeli', 'diskon', 'ppn', 'margin'].includes(field)) this.updateHargaJual();
      },

      formatRibuanInput(event, field) {
        this.formatInput(event, field, true);
      },

      formatPersenInput(event, field) {
        this.formatInput(event, field, false);
      },

      get lineBaseAfterTax() {
        const price = Math.max(0, this.parseAngka(this.lineForm.hargaBeli) || 0);
        const discount = price * Math.min(100, Math.max(0, this.parseAngka(this.lineForm.diskon) || 0)) / 100;
        const taxable = price - discount;
        const tax = taxable * Math.min(100, Math.max(0, this.parseAngka(this.lineForm.ppn) || 0)) / 100;
        return Math.max(0, taxable + tax);
      },

      get computedLineQuantity() {
        if (this.lineForm.kemasan === 'per box') {
          return (this.parseAngka(this.lineForm.jumlahBox) || 0) * (this.parseAngka(this.lineForm.isiPerBox) || 0);
        }
        return this.parseAngka(this.lineForm.jumlah) || 0;
      },

      get computedModalPrice() {
        if (this.lineForm.kemasan === 'per box') {
          const contents = this.parseAngka(this.lineForm.isiPerBox) || 0;
          return contents ? this.lineBaseAfterTax / contents : 0;
        }
        return this.lineBaseAfterTax;
      },

      get computedLineTotal() {
        const quantity = this.lineForm.kemasan === 'per box'
          ? this.parseAngka(this.lineForm.jumlahBox) || 0
          : this.parseAngka(this.lineForm.jumlah) || 0;
        return this.lineBaseAfterTax * quantity;
      },

      get computedSalePrice() {
        if (this.isHargaJualEdited) {
          const manualPrice = this.parseAngka(this.lineForm.hargaJual);
          return manualPrice === null ? '' : Math.ceil(manualPrice);
        }
        const hargaBeli = this.lineForm.hargaBeli;
        const margin = this.lineForm.margin;
        const parsedHargaBeli = this.parseAngka(hargaBeli);
        const parsedMargin = this.parseAngka(margin);
        if (parsedHargaBeli === null || parsedMargin === null) return '';
        if (this.lineForm.kemasan === 'per box' && !(this.parseAngka(this.lineForm.isiPerBox) > 0)) return '';
        return Math.ceil(this.computedModalPrice * (1 + parsedMargin / 100));
      },

      updateHargaJual() {
        if (this.isHargaJualEdited) return;
        this.lineForm.hargaJual = this.computedSalePrice === '' ? '' : this.formatRibuan(this.computedSalePrice);
      },

      roundManualHargaJual(event) {
        const price = this.parseAngka(this.lineForm.hargaJual);
        if (price === null) return;
        this.lineForm.hargaJual = this.formatRibuan(Math.ceil(price));
        if (event) event.target.value = this.lineForm.hargaJual;
      },

      loadMore() {
        this.visibleCount += 10;
      },

      formatHarga(value) {
        const formatted = this.formatRibuan(value);
        return formatted ? `Rp ${formatted}` : 'Rp 0';
      },

      formatDate(value) {
        if (!value) return '-';
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
      },

      formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      },

      saveList() {
        try {
          localStorage.setItem('kromafi.fakturOrderan', JSON.stringify(this.invoices));
          return true;
        } catch (error) {
          console.error('Gagal menyimpan Faktur Orderan.', error);
        }
        return false;
      },

      openDetail(invoice) {
        this.viewOnlyFromTagihan = false;
        this.selectedInvoice = this.normalizeInvoice(JSON.parse(JSON.stringify(invoice)));
        this.isDetailOpen = true;
        this.$nextTick(() => {
          if (this.$refs.invoiceDetailScroll) this.$refs.invoiceDetailScroll.scrollTop = 0;
        });
      },

      openDetailById(invoiceId) {
        const invoice = this.invoices.find(item => String(item.id) === String(invoiceId));
        if (!invoice) return;
        this.viewOnlyFromTagihan = true;
        this.openDetail(invoice);
        this.viewOnlyFromTagihan = true;
      },

      normalizeInvoice(invoice) {
        return {
          ...invoice,
          distributorNama: invoice.distributorNama ?? invoice.distributor_nama ?? '',
          nomorFaktur: String(invoice.nomorFaktur ?? invoice.nomor_faktur ?? '').toLocaleUpperCase('id'),
          jatuhTempo: invoice.jatuhTempo ?? invoice.jatuh_tempo ?? '',
          statusPelunasan: invoice.statusPelunasan ?? invoice.status_pelunasan ?? 'Belum lunas',
          tanggalPelunasan: invoice.tanggalPelunasan ?? invoice.tanggal_pelunasan ?? '',
          totalTagihan: invoice.totalTagihan ?? invoice.total_tagihan_final ?? invoice.total_tagihan ?? 0,
          petugasNama: invoice.petugasNama ?? invoice.petugas_nama ?? ''
        };
      },

      isLockedInvoice(invoice) {
        return !!invoice && (invoice.locked === true || String(invoice.statusPelunasan ?? invoice.status_pelunasan ?? '').toLocaleLowerCase('id') === 'lunas');
      },

      closeDetail() {
        this.isDetailOpen = false;
        this.viewOnlyFromTagihan = false;
      },

      openMarkPaidDialog() {
        if (!this.selectedInvoice || this.isLockedInvoice(this.selectedInvoice) || this.selectedInvoice.statusPelunasan !== 'Belum lunas') return;
        this.paymentDateDraft = this.todayDateValue();
        this.markPaidError = '';
        this.isMarkPaidDialogOpen = true;
        this.$nextTick(() => {
          if (this.$refs.invoicePaymentDialogScroll) this.$refs.invoicePaymentDialogScroll.scrollTop = 0;
        });
      },

      todayDateValue() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      },

      closeMarkPaidDialog() {
        this.isMarkPaidDialogOpen = false;
        this.markPaidError = '';
      },

      markInvoicePaid() {
        if (!this.selectedInvoice || this.isLockedInvoice(this.selectedInvoice) || this.selectedInvoice.statusPelunasan !== 'Belum lunas') return;
        if (!this.paymentDateDraft) {
          this.markPaidError = 'Tanggal pelunasan wajib diisi';
          return;
        }
        const invoiceIndex = this.invoices.findIndex(invoice => invoice.id === this.selectedInvoice.id);
        if (invoiceIndex === -1) {
          this.markPaidError = 'Faktur tidak ditemukan.';
          return;
        }
        const previous = this.invoices[invoiceIndex];
        const invoice = {
          ...this.selectedInvoice,
          statusPelunasan: 'Lunas',
          status_pelunasan: 'Lunas',
          tanggalPelunasan: this.paymentDateDraft,
          tanggal_pelunasan: this.paymentDateDraft,
          locked: true
        };
        this.invoices.splice(invoiceIndex, 1, invoice);
        if (!this.saveList()) {
          this.invoices.splice(invoiceIndex, 1, previous);
          this.selectedInvoice = this.normalizeInvoice(previous);
          this.markPaidError = 'Faktur gagal disimpan. Coba lagi.';
          return;
        }
        this.selectedInvoice = JSON.parse(JSON.stringify(invoice));
        this.closeMarkPaidDialog();
        this.toastMessage = 'Faktur berhasil ditandai lunas';
        setTimeout(() => { this.toastMessage = ''; }, 3000);
      },

      cancelInvoicePayment() {
        if (!this.selectedInvoice || !this.isAdmin || !this.isLockedInvoice(this.selectedInvoice)) return;
        if (!window.confirm('Batalkan pelunasan faktur ini? Status akan kembali ke Belum lunas.')) return;
        const invoiceIndex = this.invoices.findIndex(invoice => String(invoice.id) === String(this.selectedInvoice.id));
        if (invoiceIndex < 0) return;
        const previous = this.invoices[invoiceIndex];
        const invoice = {
          ...previous,
          statusPelunasan: 'Belum lunas',
          status_pelunasan: 'Belum lunas',
          tanggalPelunasan: '',
          tanggal_pelunasan: '',
          locked: false
        };
        this.invoices.splice(invoiceIndex, 1, invoice);
        if (!this.saveList()) {
          this.invoices.splice(invoiceIndex, 1, previous);
          window.alert('Faktur gagal disimpan. Coba lagi.');
          return;
        }
        this.selectedInvoice = this.normalizeInvoice(invoice);
      },

      deleteInvoice() {
        if (!this.selectedInvoice || this.viewOnlyFromTagihan || this.isLockedInvoice(this.selectedInvoice)) return;
        this.openDeleteConfirm('Yakin hapus faktur ini?', () => {
          this.invoices = this.invoices.filter(invoice => invoice.id !== this.selectedInvoice.id);
          this.saveList();
          this.selectedInvoice = null;
          this.isDetailOpen = false;
          this.toastMessage = 'Faktur berhasil dihapus.';
          setTimeout(() => { this.toastMessage = ''; }, 3000);
        });
      },

      openDeleteConfirm(message, onConfirm) {
        this.deleteConfirmMessage = message;
        this.deleteConfirmHandler = onConfirm;
        this.isDeleteConfirmOpen = true;
      },

      closeDeleteConfirm() {
        this.isDeleteConfirmOpen = false;
        this.deleteConfirmMessage = '';
        this.deleteConfirmHandler = null;
      },

      confirmDelete() {
        const handler = this.deleteConfirmHandler;
        this.closeDeleteConfirm();
        if (typeof handler === 'function') handler();
      },

      openForm(invoice = null) {
        if (invoice && this.isLockedInvoice(invoice)) return;
        this.closeFilterDropdown();
        this.closeInvoiceDistributorDropdown();
        this.loadReferences();
        this.formError = '';
        this.formData = invoice
          ? { ...JSON.parse(JSON.stringify(invoice)), nomorFaktur: (invoice.nomorFaktur || '').toUpperCase() }
          : {
              id: null,
              distributorId: '',
              distributorNama: '',
              tanggalFaktur: new Date().toISOString().slice(0, 10),
              jatuhTempo: '',
              nomorFaktur: '',
              statusPelunasan: 'Belum lunas',
              tanggalPelunasan: '',
              petugasId: '',
              petugasNama: localStorage.getItem('kromafi.loggedInUser') || '',
              catatan: '',
              waktu: '',
              items: []
            };
        this.isDetailOpen = false;
        this.isFormOpen = true;
        this.$nextTick(() => {
          if (this.$refs.invoiceFormScroll) this.$refs.invoiceFormScroll.scrollTop = 0;
        });
      },

      closeForm() {
        this.isFormOpen = false;
        this.isLineFormOpen = false;
        this.formError = '';
      },

      paymentStatusChanged() {
        this.formError = '';
        if (this.formData.statusPelunasan === 'Lunas' && !this.formData.tanggalPelunasan) {
          this.formData.tanggalPelunasan = new Date().toISOString().slice(0, 10);
        }
        if (this.formData.statusPelunasan !== 'Lunas') this.formData.tanggalPelunasan = '';
      },

      openLineForm(line = null, index = null) {
        this.lineFormError = '';
        this.autocompleteOpen = false;
        this.lineFormIndex = index;
        this.isHargaJualEdited = false;
        this.lineForm = line
          ? { ...line, jumlahBox: this.formatRibuan(line.jumlahBox), isiPerBox: this.formatRibuan(line.isiPerBox), jumlah: this.formatRibuan(line.jumlah), hargaBeli: this.formatRibuan(line.hargaBeli), diskon: this.formatPersen(line.diskon), ppn: this.formatPersen(line.ppn), margin: this.formatPersen(line.margin), hargaJual: this.formatRibuan(line.hargaJual) }
          : {
              id: Date.now(), productId: '', nama: '', kemasan: 'satu unit', jumlah: '',
              jumlahBox: '', isiPerBox: '', hargaBeli: '', diskon: 0, ppn: 0,
              margin: 0, hargaModal: 0, hargaJual: '', tagihan: 0, satuan: '',
              tanggalExpired: '', batch: ''
            };
        this.selectedProduct = this.productList.find(product => Number(product.id) === Number(this.lineForm.productId)) || null;
        this.updateHargaJual();
        this.isLineFormOpen = true;
        this.$nextTick(() => {
          if (this.$refs.lineFormScroll) this.$refs.lineFormScroll.scrollTop = 0;
        });
      },

      syncSelectedProduct() {
        const nama = (this.lineForm.nama || '').trim().toLocaleLowerCase('id');
        const product = this.productList.find(item => item.nama.toLocaleLowerCase('id') === nama);
        if (!product) {
          this.selectedProduct = null;
          this.lineForm.productId = '';
          this.lineForm.satuan = '';
          this.lineForm.hargaBeli = '';
          this.lineForm.hargaJual = '';
          this.isHargaJualEdited = false;
          this.updateHargaJual();
          return;
        }
        this.selectedProduct = product;
        this.lineForm.productId = Number(product.id);
        this.lineForm.nama = product.nama;
        this.lineForm.satuan = product.satuan || 'Unit';
        this.lineForm.hargaBeli = '';
        this.lineForm.hargaJual = '';
        this.isHargaJualEdited = false;
        this.updateHargaJual();
      },

      selectProduct(product) {
        this.lineForm.nama = product.nama;
        this.syncSelectedProduct();
        this.autocompleteOpen = false;
      },

      closeLineForm() {
        this.isLineFormOpen = false;
        this.autocompleteOpen = false;
        this.selectedProduct = null;
        this.lineFormError = '';
        this.isHargaJualEdited = false;
      },

      saveLine() {
        if (this.parseAngka(this.computedSalePrice) === null) {
          this.lineFormError = 'Harga jual wajib diisi';
          return;
        }
        const product = this.productList.find(item => Number(item.id) === Number(this.lineForm.productId));
        if (!product) {
          this.lineFormError = 'Pilih barang yang tersedia.';
          return;
        }
        if (this.computedLineQuantity <= 0 || this.computedModalPrice < 0 || this.computedLineTotal < 0) {
          this.lineFormError = 'Jumlah dan harga harus lebih besar dari nol.';
          return;
        }
        const item = {
          ...this.lineForm,
          id: this.lineForm.id || Date.now(),
          nama: product.nama,
          productId: Number(product.id),
          jumlah: this.computedLineQuantity,
          jumlahBox: this.parseAngka(this.lineForm.jumlahBox) || 0,
          isiPerBox: this.parseAngka(this.lineForm.isiPerBox) || 0,
          hargaBeli: this.parseAngka(this.lineForm.hargaBeli) || 0,
          diskon: this.parseAngka(this.lineForm.diskon) || 0,
          ppn: this.parseAngka(this.lineForm.ppn) || 0,
          margin: this.parseAngka(this.lineForm.margin) || 0,
          hargaModal: this.computedModalPrice,
          hargaJual: this.computedSalePrice === '' ? '' : this.computedSalePrice,
          tagihan: this.computedLineTotal,
          satuan: product.satuan || 'Unit'
        };
        if (this.lineFormIndex === null) this.formData.items.push(item);
        else this.formData.items.splice(this.lineFormIndex, 1, item);
        this.closeLineForm();
      },

      removeLine(index) {
        this.formData.items.splice(index, 1);
      },

      openLineDetail(line) {
        this.selectedLine = { ...line };
        this.isLineDetailOpen = true;
      },

      closeLineDetail() {
        this.isLineDetailOpen = false;
      },

      saveInvoice() {
        this.formError = '';
        if (this.formData.statusPelunasan === 'Lunas' && !this.formData.tanggalPelunasan) {
          this.formError = 'Tanggal pelunasan wajib diisi';
          return;
        }
        if (!this.formData.items.length) {
          this.formError = 'Tambahkan minimal satu barang ke faktur.';
          return;
        }
        const distributor = this.distributorOptions.find(item => String(item.id) === String(this.formData.distributorId));
        if (!distributor) {
          this.formError = 'Pilih distributor yang masih aktif.';
          return;
        }
        const invoice = {
          ...this.formData,
          distributorNama: distributor.nama,
          nomorFaktur: this.formData.nomorFaktur.trim().toUpperCase(),
          totalTagihan: this.totalFormTagihan,
          petugasNama: this.formData.petugasNama || '-',
          status_pelunasan: this.formData.statusPelunasan,
          locked: this.formData.statusPelunasan === 'Lunas',
          tanggalPelunasan: this.formData.statusPelunasan === 'Lunas'
            ? (this.formData.tanggalPelunasan || new Date().toISOString().slice(0, 10))
            : '',
          tanggal_pelunasan: this.formData.statusPelunasan === 'Lunas'
            ? (this.formData.tanggalPelunasan || new Date().toISOString().slice(0, 10))
            : '',
          waktu: this.formData.waktu || new Date().toISOString()
        };
        if (invoice.id) {
          const index = this.invoices.findIndex(item => item.id === invoice.id);
          if (index !== -1) this.invoices.splice(index, 1, invoice);
        } else {
          invoice.id = Date.now();
          this.invoices.unshift(invoice);
        }
        this.saveList();
        enqueueSync({ type: 'Faktur orderan', refId: invoice.id, label: `Faktur ${invoice.nomorFaktur}` });
        this.selectedInvoice = JSON.parse(JSON.stringify(invoice));
        this.isFormOpen = false;
        this.isDetailOpen = true;
      }
    }));

    // Pareto Page Data
});

Kromafi.register(() => {
    Alpine.data('penjualanPage', () => ({
      sales: [],
      productList: [],
      paymentList: [],
      doctorList: [],
      staffList: [],
      filterTanggal: new Date().toISOString().slice(0, 10),
      filterMetode: 'semua',
      visibleCount: 10,
      isDetailOpen: false,
      isFormOpen: false,
      isLineFormOpen: false,
      isLineDetailOpen: false,
      isDeleteConfirmOpen: false,
      toastMessage: '',
      deleteConfirmMessage: '',
      deleteConfirmHandler: null,
      autocompleteOpen: false,
      openDropdown: '',
      selectedSale: null,
      selectedLine: null,
      selectedProduct: null,
      selectedService: null,
      lineFormIndex: null,
      formError: '',
      lineFormError: '',
      formData: { items: [] },
      lineForm: { jenis: 'barang', productId: '', jasaId: '', nama: '', jumlah: '', hargaJual: 0, diskonTagihan: '', batch: '' },

      init() {
        this.loadReferences();
        try {
          const stored = localStorage.getItem('kromafi.penjualan');
          const parsed = stored ? JSON.parse(stored) : [];
          if (Array.isArray(parsed)) this.sales = parsed;
        } catch (e) { this.sales = []; }
      },

      loadReferences() {
        const readList = (key, fallback) => {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return Array.isArray(parsed) ? parsed : fallback;
          } catch (e) { return fallback; }
        };
        this.productList = readList('kromafi.barang', [
          { id: 1, nama: 'Amoxicilin', hargaModal: 400, hargaJual: 500, satuan: 'Tablet', status: 'Aktif' },
          { id: 2, nama: 'Betametason', hargaModal: 4000, hargaJual: 5000, satuan: 'Tube', status: 'Aktif' },
          { id: 3, nama: 'Cetirizin', hargaModal: 300, hargaJual: 400, satuan: 'Tablet', status: 'Aktif' }
        ]);
        this.jasaList = readList('kromafi.jasa', [
          { id: 1, nama: 'Suntik', harga: 100000, status: 'Aktif' },
          { id: 2, nama: 'Infus', harga: 150000, status: 'Aktif' },
          { id: 3, nama: 'Cek darah', harga: 50000, status: 'Tidak aktif' }
        ]);
        this.paymentList = readList('kromafi.metode-pembayaran', [
          { id: 1, nama: 'Tunai', status: 'Aktif' },
          { id: 2, nama: 'Bank Mandiri', status: 'Aktif' }
        ]);
        this.doctorList = readList('kromafi.dokter', [
          { id: 1, nama: 'dr. Budi', status: 'Aktif' },
          { id: 2, nama: 'dr. Siti', status: 'Aktif' }
        ]);
        this.staffList = readList('kromafi.petugas', DEFAULT_STAFF_LIST.map(item => ({ ...item })));
      },

      get paymentOptions() {
        return this.paymentList.filter(item => item.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get doctorOptions() {
        return this.doctorList.filter(item => item.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get itemOptions() {
        const items = [];
        (this.productList || []).forEach(p => {
          if (p && p.status !== 'Tidak aktif' && p.nama) {
            items.push({
              id: p.id,
              nama: p.nama,
              jenis: 'barang',
              raw: p
            });
          }
        });
        (this.jasaList || []).forEach(j => {
          if (j && j.status !== 'Tidak aktif' && j.nama) {
            items.push({
              id: j.id,
              nama: j.nama,
              jenis: 'jasa',
              raw: j
            });
          }
        });
        return items.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      },

      get filteredItemOptions() {
        const query = (this.lineForm.nama || '').trim().toLocaleLowerCase('id');
        return this.itemOptions.filter(item => !query || item.nama.toLocaleLowerCase('id').includes(query)).slice(0, 10);
      },

      itemStockInfo(item) {
        if (!item || item.jenis === 'jasa') return '';
        const raw = item.raw || {};
        const stok = this.parseAngka(raw.stok ?? raw.stok_akhir);
        const satuan = String(raw.satuan || 'Unit');
        const lemari = String(raw.lemari || '').trim();
        const stokLabel = stok === null ? '-' : `${this.formatRibuan(stok)} ${satuan}`;
        return `Stok: ${stokLabel} · Lemari: ${lemari || '-'}`;
      },

      get selectedProductStok() {
        if (!this.selectedProduct) return '-';
        const stok = this.parseAngka(this.selectedProduct.stok ?? this.selectedProduct.stok_akhir);
        if (stok === null) return '-';
        return `${this.formatRibuan(stok)} ${String(this.selectedProduct.satuan || 'Unit')}`;
      },

      get selectedProductLemari() {
        if (!this.selectedProduct) return '-';
        return String(this.selectedProduct.lemari || '').trim() || '-';
      },

      get activeStaff() {
        return findStaffByEmail(this.staffList, localStorage.getItem('kromafi.loggedInUser'));
      },

      get activeStaffName() {
        return this.activeStaff ? this.activeStaff.nama : (localStorage.getItem('kromafi.loggedInUser') || '');
      },

      get isAdmin() {
        return !!this.activeStaff && String(this.activeStaff.role || '').toLocaleLowerCase('id') === 'admin';
      },

      get filteredSales() {
        return this.sales.filter(sale => sale.tanggal === this.filterTanggal && (this.filterMetode === 'semua' || sale.metodePembayaran === this.filterMetode))
          .sort((a, b) => (b.waktu || '').localeCompare(a.waktu || '') || (b.id || '').localeCompare(a.id || ''));
      },

      get visibleSales() {
        return this.filteredSales.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredSales.length > this.visibleCount;
      },

      get totalOmzet() {
        return this.filteredSales.reduce((sum, sale) => sum + (this.parseAngka(sale.total_tagihan_final) || 0), 0);
      },

      get totalTagihan() {
        return (this.formData.items || []).reduce((sum, line) => {
          const finalAmount = this.parseAngka(line.tagihanFinal);
          return sum + (finalAmount === null ? (this.parseAngka(line.tagihan) || 0) : finalAmount);
        }, 0);
      },

      get totalFinal() {
        return Math.max(0, this.totalTagihan - (this.parseAngka(this.formData.diskonTotal) || 0));
      },

      get kembalian() {
        return Math.max(0, (this.parseAngka(this.formData.bayar) || 0) - this.totalFinal);
      },

      get lineTotal() {
        return (this.parseAngka(this.lineForm.jumlah) || 0) * (this.parseAngka(this.lineForm.hargaJual) || 0);
      },

      get lineFinal() {
        return Math.max(0, this.lineTotal - (this.parseAngka(this.lineForm.diskonTagihan) || 0));
      },

      formatRibuan(value) {
        if (value === '' || value === null || value === undefined) return '';
        const number = this.parseAngka(value);
        return number === null ? '' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(number);
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

      formatMoneyInput(event, field) {
        const input = event.target;
        const digitsBefore = (input.value.slice(0, input.selectionStart || 0).match(/\d/g) || []).length;
        const digits = input.value.replace(/\D/g, '');
        const formatted = digits ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(digits)) : '';
        const target = ['jumlah', 'diskonTagihan'].includes(field) ? this.lineForm : this.formData;
        target[field] = formatted;
        input.value = formatted;
        let caret = 0;
        let seen = 0;
        while (caret < formatted.length && seen < digitsBefore) {
          if (/\d/.test(formatted[caret])) seen += 1;
          caret += 1;
        }
        input.setSelectionRange(caret, caret);
      },

      formatHarga(value) {
        const formatted = this.formatRibuan(value);
        return `Rp ${formatted || '0'}`;
      },

      formatDate(value) {
        if (!value) return '-';
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
      },

      formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return `${this.formatDate(date.toISOString().slice(0, 10))} ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)}`;
      },

      saleSubtotal(sale) {
        return (sale && sale.items ? sale.items : []).reduce((sum, line) => {
          const finalAmount = this.parseAngka(line.tagihanFinal);
          return sum + (finalAmount === null ? (this.parseAngka(line.tagihan) || 0) : finalAmount);
        }, 0);
      },

      saleNames(sale) {
        const names = (sale.items || []).slice(0, 3).map(line => line.nama);
        return names.join(', ') + ((sale.items || []).length > 3 ? ', ...' : '');
      },

      isCash(method) {
        return String(method || '').trim().toLocaleLowerCase('id') === 'tunai';
      },

      productSalePrice(product) {
        const value = product.harga_jual ?? product.hargaJual ?? product.harga_jual_lama ?? product.hargaJualLama;
        const price = this.parseAngka(value);
        return price === null ? 0 : Math.ceil(price);
      },

      loadMore() {
        this.visibleCount += 10;
      },

      toggleDropdown(name) {
        this.openDropdown = this.openDropdown === name ? '' : name;
      },

      closeDropdown() {
        this.openDropdown = '';
      },

      saveList() {
        try { localStorage.setItem('kromafi.penjualan', JSON.stringify(this.sales)); } catch (e) {}
      },

      openDetail(sale) {
        this.selectedSale = JSON.parse(JSON.stringify(sale));
        this.isDetailOpen = true;
      },

      closeDetail() {
        this.isDetailOpen = false;
        this.isLineDetailOpen = false;
      },

      commitSale(updated) {
        const index = this.sales.findIndex(item => item.id === updated.id);
        if (index !== -1) this.sales.splice(index, 1, updated);
        this.saveList();
        this.selectedSale = JSON.parse(JSON.stringify(updated));
      },

      lockSale() {
        if (!this.selectedSale || !window.confirm('Kunci nota ini? Setelah dikunci tidak bisa diedit.')) return;
        this.commitSale({ ...this.selectedSale, locked: true });
      },

      unlockSale() {
        if (!this.selectedSale || !this.isAdmin || !window.confirm('Buka kunci nota ini?')) return;
        this.commitSale({ ...this.selectedSale, locked: false });
      },

      deleteSale() {
        if (!this.selectedSale || this.selectedSale.locked) return;
        this.openDeleteConfirm('Yakin hapus penjualan ini?', () => {
          this.sales = this.sales.filter(item => item.id !== this.selectedSale.id);
          this.saveList();
          this.selectedSale = null;
          this.isDetailOpen = false;
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

      printSale() {
        const sale = this.selectedSale;
        if (!sale || !sale.locked) {
          this.showToast('Struk hanya dapat dicetak setelah nota dikunci.');
          return;
        }

        let pharmacy = { name: 'Kromafi Apotek', address: '' };
        try {
          const stored = localStorage.getItem('kromafi.pharmacy');
          if (stored) {
            const parsed = JSON.parse(stored);
            pharmacy = {
              name: String(parsed.name || pharmacy.name),
              address: String(parsed.address || '')
            };
          }
        } catch (error) {
          console.error('Gagal membaca profil apotek untuk struk.', error);
          this.showToast('Profil apotek tidak dapat dibaca. Struk tidak dicetak.');
          return;
        }

        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]);
        const money = value => this.formatHarga(value);
        const items = Array.isArray(sale.items) ? sale.items : [];
        const itemMarkup = items.map(line => {
          const quantity = this.parseAngka(line.jumlah) || 0;
          const gross = this.parseAngka(line.tagihan) ?? quantity * (this.parseAngka(line.hargaJual) || 0);
          const discount = this.parseAngka(line.diskonTagihan) || 0;
          const finalAmount = this.parseAngka(line.tagihanFinal) ?? Math.max(0, gross - discount);
          return `<section class="item">
            <div class="item-name">${escapeHtml(line.nama || 'Item')}</div>
            <div class="row"><span>${escapeHtml(money(line.hargaJual))} x ${escapeHtml(this.formatRibuan(quantity))}</span><span>${escapeHtml(money(gross))}</span></div>
            <div class="row muted"><span>Diskon tagihan</span><span>${escapeHtml(money(discount))}</span></div>
            <div class="row strong"><span>Tagihan final</span><span>${escapeHtml(money(finalAmount))}</span></div>
          </section>`;
        }).join('');
        const total = this.parseAngka(sale.total_tagihan) ?? items.reduce((sum, line) => {
          const finalAmount = this.parseAngka(line.tagihanFinal);
          return sum + (finalAmount === null ? (this.parseAngka(line.tagihan) || 0) : finalAmount);
        }, 0);
        const totalDiscount = this.parseAngka(sale.diskon_total_tagihan) || 0;
        const finalTotal = this.parseAngka(sale.total_tagihan_final) ?? Math.max(0, total - totalDiscount);
        const printedAt = new Date();
        const printDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(printedAt);
        const printTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(printedAt);
        const popup = window.open('', '_blank', 'width=420,height=720');
        if (!popup) {
          this.showToast('Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.');
          return;
        }

        const receipt = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Struk ${escapeHtml(sale.id)}</title><style>
          *{box-sizing:border-box}body{margin:0;padding:16px;font:12px/1.45 Arial,sans-serif;color:#111}.receipt{width:100%;max-width:320px;margin:0 auto}.center{text-align:center}.pharmacy{font-size:16px;font-weight:700}.address{white-space:pre-wrap;margin-top:3px}.divider{border:0;border-top:1px dashed #555;margin:10px 0}.item{padding:0 0 8px;margin:0 0 8px;border-bottom:1px dashed #aaa}.item-name{font-weight:700;overflow-wrap:anywhere;margin-bottom:3px}.row{display:flex;justify-content:space-between;gap:8px}.row span:first-child{min-width:0}.row span:last-child{white-space:nowrap;text-align:right}.muted{color:#444}.strong{font-weight:700}.summary{padding:0 0 8px}.staff{margin-top:10px}.meta{margin-top:3px}@page{size:80mm auto;margin:4mm}@media print{body{padding:0}.receipt{max-width:none}}
          </style></head><body><main class="receipt">
          <header class="center"><div class="pharmacy">${escapeHtml(pharmacy.name)}</div><div class="address">${escapeHtml(pharmacy.address)}</div></header>
          <hr class="divider">${itemMarkup}
          <div class="summary">
            <div class="row"><span>Total tagihan</span><span>${escapeHtml(money(total))}</span></div>
            <div class="row muted"><span>Diskon total tagihan</span><span>${escapeHtml(money(totalDiscount))}</span></div>
            <div class="row strong"><span>Total tagihan final</span><span>${escapeHtml(money(finalTotal))}</span></div>
          </div>
          <hr class="divider"><footer class="center"><div class="staff">${escapeHtml(sale.namaPetugas || this.activeStaffName || '-')}</div><div class="meta">${printDate} : ${printTime}</div></footer>
          </main><script>window.addEventListener('load',function(){window.focus();window.print();});window.addEventListener('afterprint',function(){window.close();});<\/script></body></html>`;
        popup.document.open();
        popup.document.write(receipt);
        popup.document.close();
      },

      showToast(message) {
        this.toastMessage = message;
        window.setTimeout(() => { this.toastMessage = ''; }, 4000);
      },

      openForm(sale = null) {
        this.loadReferences();
        this.closeDropdown();
        if (sale && sale.locked) return;
        this.formError = '';
        this.selectedSale = null;
        this.formData = sale
          ? { ...JSON.parse(JSON.stringify(sale)), items: sale.items.map(line => ({ ...line, tagihanFinal: this.parseAngka(line.tagihanFinal) ?? (this.parseAngka(line.tagihan) || 0) })), diskonTotal: this.formatRibuan(sale.diskon_total_tagihan), bayar: this.formatRibuan(sale.bayar) }
          : { id: '', items: [], diskonTotal: '', metodePembayaran: '', bayar: '', tanggal: new Date().toISOString().slice(0, 10), namaPasien: '', namaDokter: '', catatan: '', locked: false };
        this.isDetailOpen = false;
        this.isFormOpen = true;
        this.$nextTick(() => { if (this.$refs.saleFormScroll) this.$refs.saleFormScroll.scrollTop = 0; });
      },

      closeForm() {
        this.isFormOpen = false;
        this.isLineFormOpen = false;
        this.autocompleteOpen = false;
        this.closeDropdown();
        this.formError = '';
      },

      removeSaleLine(index) {
        this.openDeleteConfirm('Hapus barang ini dari penjualan?', () => {
          this.formData.items.splice(index, 1);
        });
      },

      openLineForm(line = null, index = null) {
        this.lineFormError = '';
        this.autocompleteOpen = false;
        this.lineFormIndex = index;
        this.lineForm = line
          ? { ...line, jenis: line.jenis === 'jasa' ? 'jasa' : 'barang', jumlah: this.formatRibuan(line.jumlah), diskonTagihan: this.formatRibuan(line.diskonTagihan) }
          : { jenis: 'barang', productId: '', jasaId: '', nama: '', jumlah: '', hargaJual: 0, diskonTagihan: '', batch: '' };
        this.selectedProduct = this.lineForm.jenis === 'barang' ? this.productList.find(item => String(item.id) === String(this.lineForm.productId)) || null : null;
        this.selectedService = this.lineForm.jenis === 'jasa' ? this.jasaList.find(item => String(item.id) === String(this.lineForm.jasaId)) || null : null;
        this.isLineFormOpen = true;
        this.$nextTick(() => { if (this.$refs.saleLineScroll) this.$refs.saleLineScroll.scrollTop = 0; });
      },

      selectItem(item) {
        this.lineForm.nama = item.nama;
        this.lineForm.jenis = item.jenis;
        if (item.jenis === 'barang') {
          this.lineForm.productId = item.id;
          this.lineForm.jasaId = '';
          this.selectedProduct = item.raw;
          this.selectedService = null;
          this.lineForm.hargaJual = this.productSalePrice(item.raw);
          this.lineForm.batch = item.raw.batchTerakhir || item.raw.batch_terakhir || item.raw.lastBatch || item.raw.batch || (Array.isArray(item.raw.batches) && item.raw.batches.length ? (item.raw.batches[item.raw.batches.length - 1].batch || '') : '');
        } else {
          this.lineForm.jasaId = item.id;
          this.lineForm.productId = '';
          this.selectedService = item.raw;
          this.selectedProduct = null;
          this.lineForm.hargaJual = this.parseAngka(item.raw.harga) || 0;
          this.lineForm.batch = '';
        }
        this.autocompleteOpen = false;
        this.lineFormError = '';
      },

      syncSelectedItem() {
        const query = (this.lineForm.nama || '').trim().toLocaleLowerCase('id');
        if (!query) {
          this.selectedProduct = null;
          this.selectedService = null;
          this.lineForm.productId = '';
          this.lineForm.jasaId = '';
          this.lineForm.jenis = 'barang';
          this.lineForm.hargaJual = 0;
          this.lineForm.batch = '';
          return;
        }
        const match = this.itemOptions.find(item => item.nama.trim().toLocaleLowerCase('id') === query);
        if (match) {
          this.lineForm.jenis = match.jenis;
          if (match.jenis === 'barang') {
            this.lineForm.productId = match.id;
            this.lineForm.jasaId = '';
            this.selectedProduct = match.raw;
            this.selectedService = null;
            this.lineForm.hargaJual = this.productSalePrice(match.raw);
            this.lineForm.batch = match.raw.batchTerakhir || match.raw.batch_terakhir || match.raw.lastBatch || match.raw.batch || (Array.isArray(match.raw.batches) && match.raw.batches.length ? (match.raw.batches[match.raw.batches.length - 1].batch || '') : '');
          } else {
            this.lineForm.jasaId = match.id;
            this.lineForm.productId = '';
            this.selectedService = match.raw;
            this.selectedProduct = null;
            this.lineForm.hargaJual = this.parseAngka(match.raw.harga) || 0;
            this.lineForm.batch = '';
          }
        } else {
          this.selectedProduct = null;
          this.selectedService = null;
          this.lineForm.productId = '';
          this.lineForm.jasaId = '';
          this.lineForm.jenis = 'barang';
          this.lineForm.hargaJual = 0;
          this.lineForm.batch = '';
        }
      },

      closeLineForm() {
        this.isLineFormOpen = false;
        this.autocompleteOpen = false;
        this.selectedProduct = null;
        this.selectedService = null;
        this.lineFormError = '';
      },

      saveLine() {
        const quantity = this.parseAngka(this.lineForm.jumlah) || 0;
        if (quantity <= 0) {
          this.lineFormError = 'Jumlah wajib lebih besar dari nol.';
          return;
        }
        const queryName = (this.lineForm.nama || '').trim().toLocaleLowerCase('id');
        const matchedItem = this.itemOptions.find(item => item.nama.trim().toLocaleLowerCase('id') === queryName || (this.lineForm.jenis === 'jasa' ? String(item.id) === String(this.lineForm.jasaId) : String(item.id) === String(this.lineForm.productId)));
        if (!matchedItem || !this.lineForm.nama.trim()) {
          this.lineFormError = 'Pilih item yang tersedia.';
          return;
        }
        const isService = matchedItem.jenis === 'jasa';
        const selectedItem = matchedItem.raw;
        const price = isService ? (this.parseAngka(selectedItem.harga) || 0) : this.productSalePrice(selectedItem);
        const discount = this.parseAngka(this.lineForm.diskonTagihan) || 0;
        const grossAmount = quantity * price;
        const line = {
          ...this.lineForm,
          id: this.lineForm.id || `${isService ? 'JSA' : 'BAR'}-${Date.now()}`,
          jenis: isService ? 'jasa' : 'barang',
          productId: isService ? '' : selectedItem.id,
          jasaId: isService ? selectedItem.id : '',
          nama: selectedItem.nama,
          jumlah: quantity,
          hargaJual: price,
          diskonTagihan: discount,
          tagihan: grossAmount,
          tagihanFinal: Math.max(0, grossAmount - discount),
          satuan: isService ? 'Layanan' : (selectedItem.satuan || 'Unit'),
          batch: isService ? '' : (this.lineForm.batch || '')
        };
        if (this.lineFormIndex === null) this.formData.items.push(line);
        else this.formData.items.splice(this.lineFormIndex, 1, line);
        this.closeLineForm();
      },

      openLineDetail(line) {
        this.selectedLine = { ...line };
        this.isLineDetailOpen = true;
      },

      closeLineDetail() {
        this.isLineDetailOpen = false;
      },

      saveSale() {
        this.formError = '';
        if (!this.formData.items.length) { this.formError = 'Tambahkan minimal satu barang.'; return; }
        if (!this.formData.metodePembayaran) { this.formError = 'Pilih metode pembayaran.'; return; }
        if (!this.formData.tanggal) { this.formError = 'Tanggal wajib diisi.'; return; }
        const dateCode = this.formData.tanggal.replace(/-/g, '');
        const sale = {
          ...this.formData,
          id: this.formData.id || `PEN-${dateCode}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          items: this.formData.items.map(line => ({ ...line, jumlah: this.parseAngka(line.jumlah) || 0, hargaJual: this.parseAngka(line.hargaJual) || 0, diskonTagihan: this.parseAngka(line.diskonTagihan) || 0, tagihan: this.parseAngka(line.tagihan) || 0, tagihanFinal: this.parseAngka(line.tagihanFinal) ?? (this.parseAngka(line.tagihan) || 0) })),
          diskon_total_tagihan: this.parseAngka(this.formData.diskonTotal) || 0,
          total_tagihan: this.totalTagihan,
          total_tagihan_final: this.totalFinal,
          bayar: this.parseAngka(this.formData.bayar) || 0,
          namaPetugas: this.activeStaffName,
          waktu: this.formData.waktu || new Date().toISOString(),
          locked: false
        };
        const index = this.sales.findIndex(item => item.id === sale.id);
        if (index === -1) this.sales.unshift(sale);
        else this.sales.splice(index, 1, sale);
        this.saveList();
        enqueueSync({ type: 'Penjualan', refId: sale.id, label: `Nota ${sale.id}` });
        this.isFormOpen = false;
        this.isDetailOpen = false;
        this.selectedSale = null;
      }
    }));
});

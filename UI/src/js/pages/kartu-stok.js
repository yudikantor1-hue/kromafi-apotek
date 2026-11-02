Kromafi.register(() => {
    Alpine.data('kartuStokPage', () => ({
      products: [],
      sales: [],
      invoices: [],
      stocktakes: [],
      expiredEntries: [],
      movements: [],
      hasProcessed: false,
      visibleCount: 10,
      filterFrom: '',
      filterTo: '',
      productFilter: '',
      productQuery: '',
      productDropdownOpen: false,
      isDetailOpen: false,
      isEditOpen: false,
      isConfirmOpen: false,
      confirmAction: '',
      confirmMovement: null,
      selectedMovement: null,
      editForm: {},
      editProductQuery: '',
      editProductDropdownOpen: false,
      editCategoryDropdownOpen: false,
      toastMessage: '',

      init() {
        this.filterFrom = this.monthStart();
        this.filterTo = this.today();
        try {
          this.products = this.readList('kromafi.barang');
          if (!this.products.length) {
            this.products = [
              { id: 1, nama: 'Amoxicilin', hargaModal: 400, hargaJual: 500, satuan: 'Tablet', stok: 300, status: 'Aktif' },
              { id: 2, nama: 'Betametason', hargaModal: 4000, hargaJual: 5000, satuan: 'Tube', stok: 25, status: 'Aktif' },
              { id: 3, nama: 'Cetirizin', hargaModal: 300, hargaJual: 400, satuan: 'Tablet', stok: 400, status: 'Aktif' },
              { id: 4, nama: 'Paracetamol', hargaModal: 250, hargaJual: 350, satuan: 'Tablet', stok: 200, status: 'Aktif' },
              { id: 5, nama: 'Ibuprofen', hargaModal: 500, hargaJual: 700, satuan: 'Tablet', stok: 100, status: 'Aktif' },
              { id: 6, nama: 'Antasida', hargaModal: 200, hargaJual: 300, satuan: 'Tablet', stok: 150, status: 'Aktif' }
            ];
            if (localStorage.getItem('kromafi.barang') === null) localStorage.setItem('kromafi.barang', JSON.stringify(this.products));
          }
          this.sales = this.readList('kromafi.penjualan');
          this.invoices = this.readList('kromafi.fakturOrderan');
          this.stocktakes = this.readList('kromafi.stokOpname');
          this.expiredEntries = this.readList('kromafi.expiredMutasi');
        } catch (error) {
          console.error('Gagal memuat data Kartu Stok.', error);
          this.showToast('Data mutasi tidak dapat dimuat.');
        }
      },

      readList(key) {
        const stored = localStorage.getItem(key);
        if (stored === null) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) throw new Error(`${key} harus berupa daftar.`);
        return parsed;
      },

      today() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      },

      monthStart() {
        return `${this.today().slice(0, 7)}-01`;
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

      formatRibuan(value) {
        const number = this.parseAngka(value);
        return number === null ? '0' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(number);
      },

      toDateInput(value) {
        if (!value) return '';
        const raw = String(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      },

      formatDate(value) {
        const dateValue = this.toDateInput(value);
        if (!dateValue) return '-';
        return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
      },

      formatExpired(value) {
        if (!value) return '-';
        const raw = String(value);
        const monthYear = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
        if (monthYear) return `${monthYear[2]}/${monthYear[1]}`;
        if (/^\d{2}\/\d{4}$/.test(raw)) return raw;
        return this.formatDate(raw);
      },

      productId(product) {
        return product.id_barang ?? product.idBarang ?? product.id;
      },

      productName(product) {
        return String(product.nama_barang ?? product.namaBarang ?? product.nama ?? '');
      },

      productUnit(product) {
        return product.satuan ?? product.unit ?? 'Unit';
      },

      buildMutations(data = {}) {
        const products = data.products || this.products;
        const sales = data.sales || this.sales;
        const invoices = data.invoices || this.invoices;
        const stocktakes = data.stocktakes || this.stocktakes;
        const expiredEntries = data.expiredEntries || this.expiredEntries;
        const productById = new Map(products.map(product => [String(this.productId(product)), product]));
        const productIdFor = item => {
          if (item.kartuStokProductId !== undefined && item.kartuStokProductId !== null && item.kartuStokProductId !== '') return item.kartuStokProductId;
          const itemId = item.productId ?? item.id_barang ?? item.idBarang;
          if (itemId !== undefined && itemId !== null && itemId !== '') return itemId;
          const itemName = String(item.nama_barang ?? item.namaBarang ?? item.nama ?? '').toLocaleLowerCase('id');
          const match = products.find(product => this.productName(product).toLocaleLowerCase('id') === itemName);
          return match ? this.productId(match) : '';
        };
        const result = [];
        const addLine = (item, parent, sourceType, parentIndex, lineIndex) => {
          if (sourceType === 'sale' && item.jenis === 'jasa') return;
          if (item.kartuStokHapus === true) return;
          const productId = productIdFor(item);
          const storedQuantity = this.parseAngka(item.kartuStokJumlah);
          const baseQuantity = this.parseAngka(item.jumlah ?? item.selisih);
          if (productId === '' || (storedQuantity === null && baseQuantity === null && sourceType !== 'stocktake')) return;
          const category = item.kartuStokKategori || (sourceType === 'sale' ? 'Penjualan' : sourceType === 'invoice' ? 'Orderan' : 'Penyesuaian');
          let quantity = storedQuantity;
          if (quantity === null) {
            if (sourceType === 'sale') quantity = -Math.abs(this.parseAngka(item.jumlah) || 0);
            else if (sourceType === 'invoice') quantity = Math.abs(this.parseAngka(item.jumlah) || 0);
            else quantity = this.parseAngka(item.selisih ?? item.perubahan ?? item.adjustment ?? item.jumlah);
          }
          if (quantity === null && sourceType === 'stocktake' && item.stokFisik !== undefined && item.stokSistem !== undefined) {
            quantity = (this.parseAngka(item.stokFisik) || 0) - (this.parseAngka(item.stokSistem) || 0);
          }
          if (quantity === null) return;
          const lineId = item.id === undefined ? lineIndex : item.id;
          const parentId = parent.id === undefined ? parentIndex : parent.id;
          const product = productById.get(String(productId));
          const date = item.kartuStokTanggal || parent.tanggal || parent.tanggalFaktur || parent.tanggalTransaksi || parent.date || parent.waktu || item.tanggal || '';
          result.push({
            id: `${sourceType}:${parentId}:${lineId}`,
            sourceType,
            parentIndex,
            lineIndex,
            productId,
            nama: item.kartuStokNama || item.nama_barang || item.namaBarang || item.nama || (product && this.productName(product)) || 'Barang tidak diketahui',
            satuan: item.kartuStokSatuan || item.satuan || (product && this.productUnit(product)) || 'Unit',
            quantity,
            category,
            date: this.toDateInput(date),
            reference: String(parent.nomorFaktur || parent.nomorNota || parent.nomor || parent.id || '-').toLocaleUpperCase('id'),
            batch: item.kartuStokBatch ?? item.batch ?? item.nomorBatch ?? '',
            expired: item.kartuStokExpired ?? item.tanggalExpired ?? item.expired ?? item.tanggalKedaluwarsa ?? '',
            staff: item.kartuStokPetugas || parent.petugasNama || parent.namaPetugas || parent.petugas || '-',
            note: item.kartuStokCatatan ?? parent.catatan ?? item.catatan ?? '',
            locked: !!parent.locked || (sourceType === 'invoice' && String(parent.status_pelunasan || parent.statusPelunasan || '').toLocaleLowerCase('id') === 'lunas')
          });
        };
        sales.forEach((sale, parentIndex) => (Array.isArray(sale.items) ? sale.items : []).forEach((item, lineIndex) => addLine(item, sale, 'sale', parentIndex, lineIndex)));
        invoices.forEach((invoice, parentIndex) => (Array.isArray(invoice.items) ? invoice.items : []).forEach((item, lineIndex) => addLine(item, invoice, 'invoice', parentIndex, lineIndex)));
        stocktakes.forEach((entry, parentIndex) => {
          if (Array.isArray(entry.items)) entry.items.forEach((item, lineIndex) => addLine(item, entry, 'stocktake', parentIndex, lineIndex));
          else addLine(entry, entry, 'stocktake', parentIndex, 0);
        });
        expiredEntries.forEach((entry, parentIndex) => {
          if (Array.isArray(entry.items)) entry.items.forEach((item, lineIndex) => addLine(item, entry, 'expired', parentIndex, lineIndex));
          else addLine(entry, entry, 'expired', parentIndex, 0);
        });
        return result.sort((a, b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31') || a.id.localeCompare(b.id, 'id', { numeric: true, sensitivity: 'base' }));
      },

      get isAdmin() {
        try {
          const staff = findStaffByEmail(this.readList('kromafi.petugas'), localStorage.getItem('kromafi.loggedInUser'));
          return !!staff && String(staff.role || '').trim().toLocaleLowerCase('id') === 'admin';
        } catch (error) {
          console.error('Gagal memeriksa izin Kartu Stok.', error);
          return false;
        }
      },

      get productOptions() {
        return this.products.filter(product => (product.status ?? product.status_barang) === 'Aktif')
          .sort((a, b) => this.productName(a).localeCompare(this.productName(b), 'id', { sensitivity: 'base' }));
      },

      get editProductOptions() {
        const query = (this.editProductQuery || '').trim().toLocaleLowerCase('id');
        return this.productOptions.filter(product => !query || this.productName(product).toLocaleLowerCase('id').includes(query)).slice(0, 10);
      },

      get filteredProductOptions() {
        const query = (this.productQuery || '').trim().toLocaleLowerCase('id');
        return this.productOptions.filter(product => !query || this.productName(product).toLocaleLowerCase('id').includes(query)).slice(0, 10);
      },

      get dateRangeDays() {
        if (!this.filterFrom || !this.filterTo) return 0;
        const from = Date.parse(`${this.filterFrom}T00:00:00Z`);
        const to = Date.parse(`${this.filterTo}T00:00:00Z`);
        return Number.isFinite(from) && Number.isFinite(to) ? Math.floor((to - from) / 86400000) + 1 : 0;
      },

      get filterError() {
        if (!this.filterFrom || !this.filterTo) return 'Tanggal dari dan sampai wajib diisi.';
        if (this.filterFrom > this.filterTo) return 'Tanggal dari tidak boleh melewati tanggal sampai.';
        if (this.dateRangeDays > 31) return 'Rentang maksimal 31 hari';
        if (!this.productFilter) return 'Pilih nama obat untuk melihat kartu stok.';
        return '';
      },

      get selectedProductName() {
        if (!this.productFilter) return 'Pilih obat';
        const product = this.products.find(item => String(this.productId(item)) === String(this.productFilter));
        return product ? this.productName(product) : 'Pilih obat';
      },

      get filteredMovements() {
        if (!this.hasProcessed) return [];
        return this.movements.filter(item => item.date >= this.filterFrom && item.date <= this.filterTo && String(item.productId) === String(this.productFilter));
      },

      get visibleMovements() {
        return this.filteredMovements.slice(0, this.visibleCount);
      },

      get mutationRows() {
        return this.visibleMovements;
      },

      get hasMore() {
        return this.filteredMovements.length > this.visibleCount;
      },

      get isNoMovementForProduct() {
        return !!this.productFilter && this.hasProcessed && !this.movements.some(item => String(item.productId) === String(this.productFilter));
      },

      get isEmptyLedger() {
        return this.hasProcessed && this.movements.length === 0;
      },

      get runningTotal() {
        return this.filteredMovements.reduce((sum, item) => sum + item.quantity, 0);
      },

      filterChanged() {
        this.hasProcessed = false;
        this.visibleCount = 10;
      },

      toggleProductDropdown() {
        this.productDropdownOpen = !this.productDropdownOpen;
        if (this.productDropdownOpen && this.productQuery === this.selectedProductName) this.productQuery = '';
      },

      searchProductFilter() {
        this.productFilter = '';
        this.productDropdownOpen = true;
      },

      closeProductDropdown() {
        this.productDropdownOpen = false;
        if (this.productFilter) this.productQuery = this.selectedProductName;
      },

      selectProductFilter(product) {
        this.productFilter = product ? String(this.productId(product)) : '';
        this.productQuery = product ? this.productName(product) : '';
        this.productDropdownOpen = false;
        this.filterChanged();
      },

      stockBases(products, movements) {
        const net = new Map();
        movements.forEach(item => net.set(String(item.productId), (net.get(String(item.productId)) || 0) + item.quantity));
        return new Map(products.map(product => {
          const productId = String(this.productId(product));
          return [productId, (this.parseAngka(product.stok ?? product.stok_akhir) || 0) - (net.get(productId) || 0)];
        }));
      },

      processFilters() {
        if (this.filterError) return;
        const all = this.buildMutations();
        const bases = this.stockBases(this.products, all);
        const balances = new Map(bases);
        this.movements = all.map(item => {
          const opening = balances.get(String(item.productId)) || 0;
          const closing = opening + item.quantity;
          balances.set(String(item.productId), closing);
          return { ...item, opening, closing };
        });
        this.hasProcessed = true;
        this.visibleCount = 10;
        if (!this.movements.some(item => String(item.productId) === String(this.productFilter))) this.showToast('Belum ada mutasi untuk obat ini.');
      },

      showDetail(movement) {
        this.selectedMovement = movement;
        this.isDetailOpen = true;
        this.$nextTick(() => { if (this.$refs.detailModalScroll) this.$refs.detailModalScroll.scrollTop = 0; });
      },

      closeDetail() {
        this.isDetailOpen = false;
      },

      canModify(movement) {
        if (!movement || !this.isEditableCategory(movement)) return false;
        if (movement.sourceType === 'sale' || movement.sourceType === 'invoice') return false;
        if (movement.sourceType === 'stocktake') return this.isAdmin;
        return !movement.locked;
      },

      isEditableCategory(movement) {
        const category = String(movement && movement.category || '').trim().toLocaleLowerCase('id');
        return ['stok opname', 'retur', 'pemusnahan'].includes(category);
      },

      openEdit(movement) {
        if (!this.canModify(movement)) return;
        this.editForm = {
          id: movement.id,
          date: movement.date,
          category: movement.category,
          productId: String(movement.productId),
          quantity: movement.quantity,
          batch: movement.batch,
          expired: this.toDateInput(movement.expired),
          note: movement.note
        };
        this.editProductDropdownOpen = false;
        this.editProductQuery = movement.nama;
        this.editCategoryDropdownOpen = false;
        this.isDetailOpen = false;
        this.isEditOpen = true;
        this.$nextTick(() => { if (this.$refs.editModalScroll) this.$refs.editModalScroll.scrollTop = 0; });
      },

      closeEdit() {
        this.isEditOpen = false;
        this.editProductDropdownOpen = false;
        this.editProductQuery = '';
        this.editCategoryDropdownOpen = false;
      },

      selectEditProduct(product) {
        this.editForm.productId = String(this.productId(product));
        this.editProductDropdownOpen = false;
        this.editProductQuery = this.productName(product);
      },

      toggleEditProductDropdown() {
        this.editProductDropdownOpen = !this.editProductDropdownOpen;
        if (this.editProductDropdownOpen) {
          const selected = this.products.find(product => String(this.productId(product)) === String(this.editForm.productId));
          if (selected && this.editProductQuery === this.productName(selected)) this.editProductQuery = '';
        } else if (this.editForm.productId) {
          const selected = this.products.find(product => String(this.productId(product)) === String(this.editForm.productId));
          this.editProductQuery = selected ? this.productName(selected) : '';
        }
      },

      searchEditProduct() {
        this.editForm.productId = '';
        this.editProductDropdownOpen = true;
      },

      closeEditProductDropdown() {
        this.editProductDropdownOpen = false;
        const selected = this.products.find(product => String(this.productId(product)) === String(this.editForm.productId));
        this.editProductQuery = selected ? this.productName(selected) : '';
      },

      selectEditCategory(category) {
        this.editForm.category = category;
        this.editCategoryDropdownOpen = false;
      },

      loggedInStaffName() {
        try {
          const staff = findStaffByEmail(this.readList('kromafi.petugas'), localStorage.getItem('kromafi.loggedInUser'));
          return staff ? staff.nama : (localStorage.getItem('kromafi.loggedInUser') || '-');
        } catch (error) {
          console.error('Gagal membaca petugas aktif.', error);
          return localStorage.getItem('kromafi.loggedInUser') || '-';
        }
      },

      getDataSnapshot() {
        return {
          products: JSON.parse(JSON.stringify(this.products)),
          sales: JSON.parse(JSON.stringify(this.sales)),
          invoices: JSON.parse(JSON.stringify(this.invoices)),
          stocktakes: JSON.parse(JSON.stringify(this.stocktakes)),
          expiredEntries: JSON.parse(JSON.stringify(this.expiredEntries))
        };
      },

      persistSnapshot(snapshot, sourceType) {
        const keys = ['kromafi.barang', 'kromafi.penjualan', 'kromafi.fakturOrderan', 'kromafi.stokOpname', 'kromafi.expiredMutasi'];
        const previous = {};
        keys.forEach(key => { previous[key] = localStorage.getItem(key); });
        try {
          const previousMovements = this.buildMutations();
          const bases = this.stockBases(this.products, previousMovements);
          const newMovements = this.buildMutations(snapshot);
          const net = new Map();
          newMovements.forEach(item => net.set(String(item.productId), (net.get(String(item.productId)) || 0) + item.quantity));
          snapshot.products = snapshot.products.map(product => {
            const productId = String(this.productId(product));
            return { ...product, stok: (bases.get(productId) || 0) + (net.get(productId) || 0) };
          });
          localStorage.setItem('kromafi.barang', JSON.stringify(snapshot.products));
          localStorage.setItem('kromafi.penjualan', JSON.stringify(snapshot.sales));
          localStorage.setItem('kromafi.fakturOrderan', JSON.stringify(snapshot.invoices));
          localStorage.setItem('kromafi.stokOpname', JSON.stringify(snapshot.stocktakes));
          localStorage.setItem('kromafi.expiredMutasi', JSON.stringify(snapshot.expiredEntries));
        } catch (error) {
          keys.forEach(key => {
            try {
              if (previous[key] === null) localStorage.removeItem(key);
              else localStorage.setItem(key, previous[key]);
            } catch (rollbackError) {
              console.error(`Gagal memulihkan ${key} setelah penyimpanan gagal.`, rollbackError);
            }
          });
          console.error(`Gagal menyimpan perubahan mutasi ${sourceType}.`, error);
          this.showToast('Perubahan mutasi gagal disimpan.');
          return false;
        }
        this.products = snapshot.products;
        this.sales = snapshot.sales;
        this.invoices = snapshot.invoices;
        this.stocktakes = snapshot.stocktakes;
        this.expiredEntries = snapshot.expiredEntries;
        return true;
      },

      locateMutation(snapshot, movement) {
        const list = movement.sourceType === 'sale' ? snapshot.sales : movement.sourceType === 'invoice' ? snapshot.invoices : movement.sourceType === 'expired' ? snapshot.expiredEntries : snapshot.stocktakes;
        const parent = list[movement.parentIndex];
        if (!parent) return null;
        const lines = Array.isArray(parent.items) ? parent.items : [parent];
        const line = lines[movement.lineIndex];
        return line ? { parent, line } : null;
      },

      requestMutationConfirmation(action, movement = null) {
        this.confirmAction = action;
        this.confirmMovement = movement;
        this.isConfirmOpen = true;
      },

      cancelMutationConfirmation() {
        this.isConfirmOpen = false;
        this.confirmAction = '';
        this.confirmMovement = null;
      },

      confirmMutation() {
        const action = this.confirmAction;
        const movement = this.confirmMovement;
        this.cancelMutationConfirmation();
        if (action === 'save') this.saveEdit(true);
        else if (action === 'delete' && movement) this.deleteMovement(movement, true);
      },

      saveEdit(confirmed = false) {
        if (!confirmed) {
          this.requestMutationConfirmation('save');
          return;
        }
        const movement = this.buildMutations().find(item => item.id === this.editForm.id);
        const quantity = this.parseAngka(this.editForm.quantity);
        const product = this.productOptions.find(item => String(this.productId(item)) === String(this.editForm.productId));
        if (!movement || !this.canModify(movement)) {
          this.showToast('Mutasi tidak dapat diubah.');
          return;
        }
        if (!this.editForm.date || !product || quantity === null || quantity === 0) {
          this.showToast('Lengkapi tanggal, obat, dan jumlah mutasi.');
          return;
        }
        const snapshot = this.getDataSnapshot();
        const target = this.locateMutation(snapshot, movement);
        if (!target) {
          this.showToast('Data sumber mutasi tidak ditemukan.');
          return;
        }
        if (movement.sourceType === 'stocktake') {
          target.line.kartuStokJumlah = quantity;
          target.line.kartuStokKategori = this.editForm.category;
        } else {
          if (movement.sourceType !== 'stocktake' && (target.parent.locked || (movement.sourceType === 'invoice' && String(target.parent.status_pelunasan || target.parent.statusPelunasan || '').toLocaleLowerCase('id') === 'lunas'))) {
            this.showToast('Transaksi terkunci dan tidak dapat diubah.');
            return;
          }
          target.line.kartuStokJumlah = quantity;
          target.line.kartuStokKategori = this.editForm.category;
        }
        target.line.kartuStokProductId = this.productId(product);
        target.line.kartuStokNama = this.productName(product);
        target.line.kartuStokSatuan = this.productUnit(product);
        target.line.kartuStokBatch = this.editForm.batch;
        target.line.kartuStokExpired = this.editForm.expired;
        target.line.kartuStokTanggal = this.editForm.date;
        target.line.kartuStokCatatan = this.editForm.note;
        target.line.kartuStokPetugas = this.loggedInStaffName();
        if (!this.persistSnapshot(snapshot, movement.sourceType)) return;
        enqueueSync({ type: 'Penyesuaian stok', refId: movement.id, label: `Ubah mutasi ${movement.nama || movement.name || ''}`.trim() });
        this.closeEdit();
        this.selectedMovement = null;
        this.processFilters();
        this.showToast('Mutasi berhasil diubah dan stok diperbarui.');
      },

      deleteMovement(movement, confirmed = false) {
        if (!this.canModify(movement)) return;
        if (!confirmed) {
          this.requestMutationConfirmation('delete', movement);
          return;
        }
        const snapshot = this.getDataSnapshot();
        const target = this.locateMutation(snapshot, movement);
        if (!target) {
          this.showToast('Data sumber mutasi tidak ditemukan.');
          return;
        }
        if (target.parent.locked || (movement.sourceType === 'invoice' && String(target.parent.status_pelunasan || target.parent.statusPelunasan || '').toLocaleLowerCase('id') === 'lunas')) {
          this.showToast('Transaksi terkunci dan tidak dapat dihapus.');
          return;
        }
        target.line.kartuStokHapus = true;
        if (!this.persistSnapshot(snapshot, movement.sourceType)) return;
        enqueueSync({ type: 'Penyesuaian stok', refId: movement.id, label: `Hapus mutasi ${movement.nama || movement.name || ''}`.trim() });
        this.isDetailOpen = false;
        this.selectedMovement = null;
        this.processFilters();
        this.showToast('Mutasi dihapus dan stok diperbarui.');
      },

      loadMore() {
        this.visibleCount += 10;
      },

      showToast(message) {
        this.toastMessage = message;
        window.setTimeout(() => { if (this.toastMessage === message) this.toastMessage = ''; }, 3000);
      }
    }));

    // Expired Page Data
});

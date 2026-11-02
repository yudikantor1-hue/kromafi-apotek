Kromafi.register(() => {
    Alpine.data('stokOpnamePage', () => ({
      products: [],
      stocktakes: [],
      selectedProduct: null,
      stokRiil: '',
      visibleCount: 10,
      loadError: '',
      formError: '',
      toastMessage: '',

      init() {
        try {
          this.products = this.readList('kromafi.barang');
          this.stocktakes = this.readList('kromafi.stokOpname');
        } catch (error) {
          console.error('Gagal memuat data Stok Opname.', error);
          this.loadError = 'Data stok opname tidak dapat dimuat.';
        }
      },

      readList(key) {
        const stored = localStorage.getItem(key);
        if (stored === null) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) throw new Error(`${key} harus berupa daftar.`);
        return parsed;
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

      productStock(product) {
        return this.parseAngka(product.stok ?? product.stok_akhir);
      },

      currentPeriod() {
        return this.today().slice(0, 7).replace('-', '');
      },

      isActiveProduct(product) {
        return String(product.status ?? product.status_barang ?? '').trim().toLocaleLowerCase('id') === 'aktif';
      },

      get activeProducts() {
        return this.products
          .filter(product => product && this.isActiveProduct(product) && this.productId(product) !== undefined && this.productId(product) !== null && this.productId(product) !== '' && this.productName(product));
      },

      get sortedProducts() {
        const period = this.currentPeriod();
        return this.activeProducts
          .filter(product => String(product.bulan_stok_opname || '') !== period)
          .sort((a, b) => this.productName(a).localeCompare(this.productName(b), 'id', { sensitivity: 'base' }));
      },

      get visibleProducts() {
        return this.sortedProducts.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.sortedProducts.length > this.visibleCount;
      },

      get difference() {
        if (!this.selectedProduct) return null;
        const realStock = this.parseAngka(this.stokRiil);
        const appStock = this.productStock(this.selectedProduct);
        return realStock === null || appStock === null ? null : realStock - appStock;
      },

      parseAngka(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const normalized = raw.replace(/[^\d,.-]/g, '').replace(/,/g, '.');
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
      },

      formatRibuan(value) {
        const number = this.parseAngka(value);
        return number === null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(number);
      },

      loadMore() {
        this.visibleCount += 10;
      },

      openDetail(product) {
        const stock = this.productStock(product);
        if (stock === null) {
          this.showToast('Stok aplikasi barang tidak valid.');
          return;
        }
        this.selectedProduct = product;
        this.stokRiil = String(stock);
        this.formError = '';
      },

      closeDetail() {
        this.selectedProduct = null;
        this.stokRiil = '';
        this.formError = '';
      },

      today() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      },

      activeStaffName() {
        const username = (localStorage.getItem('kromafi.loggedInUser') || '').trim();
        try {
          const staff = findStaffByEmail(this.readList('kromafi.petugas'), username);
          return staff ? staff.nama : (username || '-');
        } catch (error) {
          console.error('Gagal membaca petugas aktif untuk Stok Opname.', error);
          return username || '-';
        }
      },

      saveOpname() {
        this.formError = '';
        const realStock = this.parseAngka(this.stokRiil);
        if (!this.selectedProduct || realStock === null || realStock < 0) {
          this.formError = 'Masukkan stok riil berupa angka nol atau lebih.';
          return;
        }

        let latestProducts;
        let latestStocktakes;
        try {
          latestProducts = this.readList('kromafi.barang');
          latestStocktakes = this.readList('kromafi.stokOpname');
        } catch (error) {
          console.error('Gagal membaca data terbaru Stok Opname.', error);
          this.formError = 'Data stok tidak dapat dibaca. Perubahan belum disimpan.';
          return;
        }

        const productId = this.productId(this.selectedProduct);
        const productIndex = latestProducts.findIndex(item => String(this.productId(item)) === String(productId));
        if (productIndex < 0) {
          this.formError = 'Barang tidak ditemukan. Muat ulang halaman sebelum mencoba lagi.';
          return;
        }
        const period = this.currentPeriod();
        if (!this.isActiveProduct(latestProducts[productIndex])) {
          this.formError = 'Barang tidak aktif dan tidak dapat di-opname.';
          return;
        }
        if (String(latestProducts[productIndex].bulan_stok_opname || '') === period) {
          this.formError = 'Barang sudah di-opname bulan ini.';
          return;
        }
        const currentStock = this.productStock(latestProducts[productIndex]);
        const displayedStock = this.productStock(this.selectedProduct);
        if (currentStock === null) {
          this.formError = 'Stok aplikasi terbaru tidak valid.';
          return;
        }
        if (currentStock !== displayedStock) {
          this.formError = 'Stok aplikasi berubah. Kembali ke daftar lalu buka barang kembali.';
          return;
        }

        const difference = realStock - currentStock;
        const date = this.today();
        const entry = {
          id: `OPN-${date.replace(/-/g, '')}-${String(Date.now()).slice(-6)}`,
          productId,
          nama: this.productName(this.selectedProduct),
          satuan: this.productUnit(this.selectedProduct),
          stokSistem: currentStock,
          stokFisik: realStock,
          selisih: difference,
          bulan_stok_opname: period,
          kartuStokKategori: 'Stok Opname',
          tanggal: date,
          petugasNama: this.activeStaffName(),
          waktu: new Date().toISOString()
        };
        latestStocktakes.unshift(entry);
        latestProducts[productIndex] = {
          ...latestProducts[productIndex],
          stok: realStock,
          bulan_stok_opname: period
        };

        const keys = ['kromafi.barang', 'kromafi.stokOpname'];
        const previous = {};
        try {
          keys.forEach(key => { previous[key] = localStorage.getItem(key); });
        } catch (error) {
          console.error('Gagal menyiapkan penyimpanan Stok Opname.', error);
          this.formError = 'Data stok tidak dapat disiapkan untuk disimpan.';
          return;
        }
        try {
          localStorage.setItem('kromafi.barang', JSON.stringify(latestProducts));
          localStorage.setItem('kromafi.stokOpname', JSON.stringify(latestStocktakes));
        } catch (error) {
          keys.forEach(key => {
            try {
              if (previous[key] === null) localStorage.removeItem(key);
              else localStorage.setItem(key, previous[key]);
            } catch (rollbackError) {
              console.error(`Gagal memulihkan ${key} setelah penyimpanan Stok Opname gagal.`, rollbackError);
            }
          });
          console.error('Gagal menyimpan perubahan Stok Opname.', error);
          this.formError = 'Stok opname gagal disimpan. Stok tidak diubah.';
          return;
        }

        this.products = latestProducts;
        this.stocktakes = latestStocktakes;
        enqueueSync({ type: 'Stok opname', refId: entry.id, label: `Opname ${entry.nama}` });
        this.closeDetail();
        this.showToast('Stok opname tersimpan dan stok aplikasi diperbarui.');
      },

      showToast(message) {
        this.toastMessage = message;
        window.setTimeout(() => { this.toastMessage = ''; }, 3000);
      }
    }));

    // Jasa Page Data
});

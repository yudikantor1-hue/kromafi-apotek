Kromafi.register(() => {
    Alpine.data('tagihanPage', () => ({
      invoices: [],
      distributorList: [],
      distributorFilter: 'semua',
      monthFilter: '',
      openFilterDropdown: '',
      visibleCount: 10,
      isPaymentDialogOpen: false,
      dialogInvoice: null,
      paymentDateDraft: '',
      pendingRemovalIds: {},
      toastMessage: '',
      toastTimer: null,

      init() {
        const now = new Date();
        this.monthFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        this.loadData();
      },

      toggleFilterDropdown(name) {
        this.openFilterDropdown = this.openFilterDropdown === name ? '' : name;
      },

      closeFilterDropdown() {
        this.openFilterDropdown = '';
      },

      loadData() {
        try {
          const storedInvoices = localStorage.getItem('kromafi.fakturOrderan');
          const parsedInvoices = storedInvoices ? JSON.parse(storedInvoices) : [];
          this.invoices = Array.isArray(parsedInvoices) ? parsedInvoices : [];
          this.distributorList = readDistributorList();
        } catch (error) {
          console.error('Gagal memuat data Tagihan.', error);
          this.invoices = [];
          this.distributorList = [];
          this.showToast('Data tagihan tidak dapat dimuat.');
        }
      },

      get distributorOptions() {
        return this.distributorList
          .filter(item => String(item.status || '').trim().toLocaleLowerCase('id') === 'aktif')
          .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
      },

      get unpaidInvoices() {
        return this.invoices.filter(invoice => this.invoiceStatus(invoice) === 'belum lunas');
      },

      get hasUnpaidInvoices() {
        return this.unpaidInvoices.length > 0;
      },

      get filteredInvoices() {
        return this.invoices
          .filter(invoice => this.invoiceStatus(invoice) === 'belum lunas' || this.pendingRemovalIds[String(invoice.id)])
          .filter(invoice => this.distributorFilter === 'semua' || String(this.invoiceDistributorId(invoice)) === String(this.distributorFilter))
          .filter(invoice => String(this.invoiceJatuhTempo(invoice)).slice(0, 7) === this.monthFilter)
          .sort((a, b) => {
            const dateA = this.invoiceJatuhTempo(a) || '9999-12-31';
            const dateB = this.invoiceJatuhTempo(b) || '9999-12-31';
            const dateOrder = dateA.localeCompare(dateB);
            if (dateOrder) return dateOrder;
            const nameOrder = this.invoiceDistributorName(a).localeCompare(this.invoiceDistributorName(b), 'id', { sensitivity: 'base' });
            if (nameOrder) return nameOrder;
            return this.invoiceNumber(a).localeCompare(this.invoiceNumber(b), 'id', { sensitivity: 'base' });
          });
      },

      get visibleInvoices() {
        return this.filteredInvoices.slice(0, this.visibleCount);
      },

      get hasMore() {
        return this.filteredInvoices.length > this.visibleCount;
      },

      get totalFilteredTagihan() {
        return this.filteredInvoices
          .filter(invoice => this.invoiceStatus(invoice) === 'belum lunas')
          .reduce((sum, invoice) => sum + this.invoiceTotal(invoice), 0);
      },

      today() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      },

      invoiceStatus(invoice) {
        return String(invoice.statusPelunasan ?? invoice.status_pelunasan ?? '').trim().toLocaleLowerCase('id');
      },

      invoiceDistributorId(invoice) {
        return invoice.distributorId ?? invoice.distributor_id ?? '';
      },

      invoiceJatuhTempo(invoice) {
        return String(invoice.jatuhTempo ?? invoice.jatuh_tempo ?? '');
      },

      invoiceNumber(invoice) {
        return String(invoice.nomorFaktur ?? invoice.nomor_faktur ?? '').toLocaleUpperCase('id');
      },

      invoiceDistributorName(invoice) {
        const name = invoice.distributorNama ?? invoice.distributor_nama;
        if (name) return String(name);
        const distributor = this.distributorList.find(item => String(item.id) === String(this.invoiceDistributorId(invoice)));
        return distributor ? String(distributor.nama || '') : '-';
      },

      invoiceTotal(invoice) {
        const value = invoice.total_tagihan_final ?? invoice.totalTagihanFinal ?? invoice.totalTagihan ?? invoice.total_tagihan;
        if (value !== undefined && value !== null && value !== '') {
          const parsed = this.parseAngka(value);
          if (parsed !== null) return parsed;
        }
        return (Array.isArray(invoice.items) ? invoice.items : [])
          .reduce((sum, item) => sum + (this.parseAngka(item.tagihan) || 0), 0);
      },

      localDate(value) {
        if (!value) return null;
        const parts = String(value).slice(0, 10).split('-').map(Number);
        if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return Number.isNaN(date.getTime()) ? null : date;
      },

      isOverdue(invoice) {
        const dueDate = this.invoiceJatuhTempo(invoice);
        return !!dueDate && dueDate < this.today();
      },

      isDueToday(invoice) {
        return !!this.invoiceJatuhTempo(invoice) && this.invoiceJatuhTempo(invoice) === this.today();
      },

      formatDate(value) {
        const date = this.localDate(value);
        return date ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '-';
      },

      formatRibuan(value) {
        const number = this.parseAngka(value);
        return number === null ? '0' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 20 }).format(number);
      },

      formatHarga(value) {
        return `Rp ${this.formatRibuan(value)}`;
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

      showToast(message) {
        this.toastMessage = message;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { this.toastMessage = ''; }, 3000);
      },

      openInvoiceDetail(invoice) {
        window.dispatchEvent(new CustomEvent('tagihan-open-invoice-detail', { detail: invoice.id }));
      },

      openPaymentDialog(invoice) {
        if (this.invoiceStatus(invoice) !== 'belum lunas') return;
        this.dialogInvoice = { ...invoice };
        this.paymentDateDraft = this.today();
        this.isPaymentDialogOpen = true;
        this.$nextTick(() => {
          if (this.$refs.paymentDialogScroll) this.$refs.paymentDialogScroll.scrollTop = 0;
        });
      },

      closePaymentDialog() {
        this.isPaymentDialogOpen = false;
        this.dialogInvoice = null;
        this.paymentDateDraft = '';
      },

      saveInvoices() {
        try {
          localStorage.setItem('kromafi.fakturOrderan', JSON.stringify(this.invoices));
          return true;
        } catch (error) {
          console.error('Gagal menyimpan status tagihan.', error);
          this.showToast('Tagihan gagal disimpan. Coba lagi.');
          return false;
        }
      },

      markInvoicePaid() {
        if (!this.dialogInvoice || this.invoiceStatus(this.dialogInvoice) !== 'belum lunas') return;
        if (!this.paymentDateDraft) {
          this.showToast('Tanggal pelunasan wajib diisi.');
          return;
        }
        const index = this.invoices.findIndex(invoice => String(invoice.id) === String(this.dialogInvoice.id));
        if (index < 0) {
          this.showToast('Faktur tidak ditemukan.');
          return;
        }
        const previous = this.invoices[index];
        const paidInvoice = {
          ...previous,
          statusPelunasan: 'Lunas',
          status_pelunasan: 'Lunas',
          tanggalPelunasan: this.paymentDateDraft,
          tanggal_pelunasan: this.paymentDateDraft,
          locked: true
        };
        this.invoices.splice(index, 1, paidInvoice);
        if (!this.saveInvoices()) {
          this.invoices.splice(index, 1, previous);
          return;
        }
        this.pendingRemovalIds[String(paidInvoice.id)] = true;
        const invoiceNumber = this.invoiceNumber(paidInvoice);
        this.closePaymentDialog();
        this.showToast(`Faktur ${invoiceNumber} ditandai lunas`);
        setTimeout(() => { delete this.pendingRemovalIds[String(paidInvoice.id)]; }, 300);
      },

      loadMore() {
        this.visibleCount += 10;
      }
    }));

    // Faktur Orderan Page Data
});

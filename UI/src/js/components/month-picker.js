Kromafi.register(() => {
    Alpine.data('monthYearPicker', (isRequired = false) => ({
      value: '',
      required: isRequired,
      open: false,
      viewYear: 0,
      panelStyle: {},

      init() {
        const template = document.getElementById('month-year-picker-template');
        if (template) {
          const fragment = template.content.cloneNode(true);
          const nodes = [...fragment.children];
          this.$root.append(fragment);
          nodes.forEach(node => Alpine.initTree(node));
        }
        if (!this.value) this.value = this.currentMonthValue();
        this.viewYear = Number(this.value.slice(0, 4)) || this.currentYear();
        this.handleViewportChange = () => { if (this.open) this.positionPanel(); };
        window.addEventListener('resize', this.handleViewportChange);
        window.addEventListener('scroll', this.handleViewportChange, true);
      },

      destroy() {
        window.removeEventListener('resize', this.handleViewportChange);
        window.removeEventListener('scroll', this.handleViewportChange, true);
      },

      currentYear() {
        return new Date().getFullYear();
      },

      currentMonthValue() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      },

      get displayValue() {
        if (!this.value) return 'Pilih bulan';
        const [year, month] = this.value.split('-').map(Number);
        if (!year || !month) return 'Pilih bulan';
        return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
      },

      get yearLabel() {
        return String(this.viewYear);
      },

      get monthGrid() {
        const formatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
        return Array.from({ length: 12 }, (_, index) => {
          const value = `${this.viewYear}-${String(index + 1).padStart(2, '0')}`;
          return {
            value,
            label: formatter.format(new Date(this.viewYear, index, 1)).replace('.', ''),
            selected: value === this.value,
            isCurrent: value === this.currentMonthValue()
          };
        });
      },

      toggle() {
        this.open = !this.open;
        if (this.open) {
          this.viewYear = Number(this.value.slice(0, 4)) || this.currentYear();
          this.$nextTick(() => this.positionPanel());
        }
      },

      close() {
        this.open = false;
      },

      moveYear(offset) {
        this.viewYear += offset;
        this.$nextTick(() => this.positionPanel());
      },

      chooseMonth(month) {
        this.value = month.value;
        this.open = false;
        this.$dispatch('month-picker-change', { value: this.value });
      },

      chooseCurrentMonth() {
        const value = this.currentMonthValue();
        this.viewYear = Number(value.slice(0, 4));
        this.value = value;
        this.open = false;
        this.$dispatch('month-picker-change', { value });
      },

      positionPanel() {
        const panel = this.$root.querySelector('[data-month-picker-panel]');
        if (!panel || !this.open) return;
        const anchor = this.$root.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 16);
        const height = Math.min(panel.scrollHeight, 300);
        const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
        const below = anchor.bottom + height + 4 <= window.innerHeight;
        const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4);
        this.panelStyle = { left: `${left}px`, top: `${top}px`, width: `${width}px` };
      }
    }));

    // Main App Data
});

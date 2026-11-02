Kromafi.register(() => {
    Alpine.data('compactDatePicker', (isRequired = false) => ({
      value: '',
      required: isRequired,
      disabled: false,
      minDate: '',
      maxDate: '',
      month: '',
      open: false,
      panelStyle: {},

      init() {
        const template = document.getElementById('compact-date-picker-template');
        if (template) {
          const fragment = template.content.cloneNode(true);
          const nodes = [...fragment.children];
          this.$root.append(fragment);
          nodes.forEach(node => Alpine.initTree(node));
        }
        this.handleViewportChange = () => { if (this.open) this.positionPanel(); };
        window.addEventListener('resize', this.handleViewportChange);
        window.addEventListener('scroll', this.handleViewportChange, true);
      },

      destroy() {
        window.removeEventListener('resize', this.handleViewportChange);
        window.removeEventListener('scroll', this.handleViewportChange, true);
      },

      get displayValue() {
        if (!this.value) return '';
        const [year, month, day] = this.value.split('-');
        return `${day}/${month}/${year}`;
      },

      get monthLabel() {
        const [year, month] = (this.month || this.today().slice(0, 7)).split('-').map(Number);
        return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
      },

      get calendarDays() {
        const [year, month] = (this.month || this.today().slice(0, 7)).split('-').map(Number);
        const firstDay = new Date(year, month - 1, 1).getDay();
        return Array.from({ length: 42 }, (_, index) => {
          const date = new Date(year, month - 1, index - firstDay + 1);
          const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          return {
            iso,
            day: date.getDate(),
            inMonth: date.getMonth() === month - 1,
            selected: iso === this.value,
            today: iso === this.today(),
            disabled: (!!this.minDate && iso < this.minDate) || (!!this.maxDate && iso > this.maxDate)
          };
        });
      },

      today() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      },

      setBounds(minDate, maxDate) {
        this.minDate = minDate || '';
        this.maxDate = maxDate || '';
        if (this.open) this.$nextTick(() => this.positionPanel());
      },

      toggle() {
        this.open = !this.open;
        if (this.open) {
          this.month = (this.value || this.today()).slice(0, 7);
          this.$nextTick(() => this.positionPanel());
        }
      },

      close() {
        this.open = false;
      },

      moveMonth(offset) {
        const [year, month] = this.month.split('-').map(Number);
        const date = new Date(year, month - 1 + offset, 1);
        this.month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        this.$nextTick(() => this.positionPanel());
      },

      chooseDate(value) {
        if ((this.minDate && value < this.minDate) || (this.maxDate && value > this.maxDate)) return;
        this.value = value;
        this.close();
        this.$dispatch('date-picker-change', { value });
      },

      clearDate() {
        this.value = '';
        this.close();
        this.$dispatch('date-picker-change', { value: '' });
      },

      chooseToday() {
        const today = this.today();
        if ((!this.minDate || today >= this.minDate) && (!this.maxDate || today <= this.maxDate)) this.chooseDate(today);
      },

      positionPanel() {
        const panel = this.$root.querySelector('[data-date-picker-panel]');
        if (!panel || !this.open) return;
        const anchor = this.$root.getBoundingClientRect();
        const width = Math.min(296, window.innerWidth - 16);
        const height = Math.min(panel.scrollHeight, 320);
        const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
        const below = anchor.bottom + height + 4 <= window.innerHeight;
        const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4);
        this.panelStyle = { left: `${left}px`, top: `${top}px`, width: `${width}px` };
      }
    }));
});

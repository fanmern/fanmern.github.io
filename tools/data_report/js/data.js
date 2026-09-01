// ================================================================
// 3. 数据模块 (data.js)
// ================================================================
const DataStore = {
    allData: [],
    filteredData: [],
    allColumns: [],
    shownColumns: [],
    columnWidths: {},
    filters: {},
    sortState: { col: null, asc: true },
    currentPage: 1,
    pageSize: parseInt(localStorage.getItem(CONFIG.PAGE_SIZE_KEY)) || 50,
    // 初始化默认显示列
    getShownColumns() {
        const saved = Utils.loadData(CONFIG.STORAGE_KEY);
        if (saved && Array.isArray(saved) && saved.length > 0) {
            const filtered = saved.filter(c => this.allColumns.includes(c));
            if (filtered.length > 0) {
                const defaults = Utils.getDefaultShown(this.allColumns);
                const merged = [...new Set([...defaults, ...filtered])];
                const allDisp = Utils.getDisplayColumns(this.allColumns);
                return allDisp.filter(c => merged.includes(c));
            }
        }
        return Utils.getDefaultShown(this.allColumns);
    },
    saveRawData(data) {
        try {
            localStorage.setItem(CONFIG.RAW_DATA_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('保存原始数据失败', e);
        }
    },
    loadRawData() {
        try {
            const raw = localStorage.getItem(CONFIG.RAW_DATA_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {}
        return null;
    },
    clearRawData() {
        try {
            localStorage.removeItem(CONFIG.RAW_DATA_KEY);
        } catch (e) {}
    },
    // 加载持久化数据
    loadPersisted() {
        this.columnWidths = Utils.loadData(CONFIG.COL_WIDTH_KEY) || {};
        const savedOrder = Utils.loadData(CONFIG.COL_ORDER_KEY);
        if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
            this.shownColumns = savedOrder.filter(c => this.allColumns.includes(c));
        } else {
            this.shownColumns = this.getShownColumns();
        }
        this.filters = Utils.loadData(CONFIG.FILTER_STATE_KEY) || {};
        const savedSort = Utils.loadData(CONFIG.SORT_STATE_KEY);
        if (savedSort && typeof savedSort.col === 'string') {
            this.sortState = savedSort;
        } else {
            // 默认按计划名字排序
            if (this.allColumns.includes('计划名字')) {
                this.sortState = { col: '计划名字', asc: true };
            }
        }
        // 确保显示列都在实际列中
        const allDisp = Utils.getDisplayColumns(this.allColumns);
        this.shownColumns = this.shownColumns.filter(c => allDisp.includes(c));
        if (this.shownColumns.length === 0) {
            this.shownColumns = Utils.getDefaultShown(this.allColumns);
        }
    },
    // 保存状态
    saveAll() {
        Utils.saveData(CONFIG.STORAGE_KEY, this.shownColumns);
        Utils.saveData(CONFIG.COL_WIDTH_KEY, this.columnWidths);
        Utils.saveData(CONFIG.COL_ORDER_KEY, this.shownColumns);
        Utils.saveData(CONFIG.FILTER_STATE_KEY, this.filters);
        Utils.saveData(CONFIG.SORT_STATE_KEY, this.sortState);
        Utils.saveData(CONFIG.PAGE_SIZE_KEY, String(this.pageSize));
    },
    // 预处理数据
    preprocess(rows) {
        const dateCol = '日期';
        for (const row of rows) {
            const val = row[dateCol];
            if (val) {
                const s = String(val).trim();
                let start = s;
                if (s.includes('至')) start = s.split('至')[0].trim();
                if (start.length === 8) {
                    start = `${start.slice(0,4)}-${start.slice(4,6)}-${start.slice(6,8)}`;
                }
                row[dateCol] = start;
                row['_dateRaw'] = String(val).trim();
            }
        }
        // 数字列转换
        const numCols = new Set();
        for (const col of this.allColumns) {
            for (const row of rows) {
                const val = row[col];
                if (val !== undefined && val !== null && val !== '') {
                    const num = parseFloat(val);
                    if (!isNaN(num)) { numCols.add(col); break; }
                }
            }
        }
        for (const row of rows) {
            for (const col of numCols) {
                const val = row[col];
                if (val !== undefined && val !== null && val !== '') {
                    const num = parseFloat(val);
                    if (!isNaN(num)) row[col] = num;
                }
            }
        }
        return rows;
    },
    // 筛选
    applyFilters() {
        let data = [...this.allData];
        for (const [col, filterVal] of Object.entries(this.filters)) {
            if (!filterVal) continue;
            data = data.filter(row => {
                const val = row[col];
                if (val === undefined || val === null || val === '') return false;
                const type = Utils.guessColumnType(col, this.allData);
                if (type === 'text') {
                    if (typeof filterVal === 'string') {
                        return String(val).toLowerCase().includes(filterVal.toLowerCase());
                    }
                } else if (type === 'number') {
                    if (typeof filterVal === 'object') {
                        const num = parseFloat(val);
                        if (isNaN(num)) return false;
                        const min = filterVal.min !== '' ? parseFloat(filterVal.min) : -Infinity;
                        const max = filterVal.max !== '' ? parseFloat(filterVal.max) : Infinity;
                        return num >= min && num <= max;
                    }
                } else if (type === 'date') {
                    if (typeof filterVal === 'object') {
                        const dateStr = String(val);
                        const d = new Date(dateStr);
                        if (isNaN(d.getTime())) return false;
                        const start = filterVal.start ? new Date(filterVal.start) : null;
                        const end = filterVal.end ? new Date(filterVal.end) : null;
                        if (start && d < start) return false;
                        if (end && d > end) return false;
                        return true;
                    }
                }
                return true;
            });
        }
        this.filteredData = data;
        this.currentPage = 1;
    },
    // 排序
    sortData(data) {
        if (!this.sortState.col) return data;
        const col = this.sortState.col;
        const asc = this.sortState.asc;
        return [...data].sort((a, b) => {
            let va = a[col] ?? '';
            let vb = b[col] ?? '';
            if (typeof va === 'number' && typeof vb === 'number') {
                return asc ? va - vb : vb - va;
            }
            va = String(va);
            vb = String(vb);
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    },
    // 分页数据
    getPageData() {
        const total = this.filteredData.length;
        const totalPages = Math.ceil(total / this.pageSize) || 1;
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;
        const start = (this.currentPage - 1) * this.pageSize;
        const end = Math.min(start + this.pageSize, total);
        return this.filteredData.slice(start, end);
    },
    get total() { return this.filteredData.length; },
    get totalPages() { return Math.ceil(this.total / this.pageSize) || 1; }
};

// ================================================================
// 3. 数据模块 (data.js)
// ================================================================

// ---- 历史记录存储：IndexedDB ----
// 历史记录保存整份数据，localStorage（约 5MB）装不下，多次上传就会超限丢失；
// IndexedDB 容量大且持久化，刷新后仍可恢复历史。
const HistoryDB = {
    DB_NAME: 'data_report_history_db',
    STORE: 'records',
    dbPromise: null,

    open() {
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                let req;
                try {
                    req = indexedDB.open(this.DB_NAME, 1);
                } catch (e) {
                    reject(e);
                    return;
                }
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE)) {
                        db.createObjectStore(this.STORE, { keyPath: 'id' });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return this.dbPromise;
    },

    getAll() {
        return this.open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE, 'readonly');
            const req = tx.objectStore(this.STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        }));
    },

    put(record) {
        return this.open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE, 'readwrite');
            const req = tx.objectStore(this.STORE).put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        }));
    },

    removeMany(ids) {
        return this.open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE, 'readwrite');
            const store = tx.objectStore(this.STORE);
            for (const id of ids) store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }));
    },

    // 整体替换为指定列表（清空后写入）
    replaceAll(records) {
        return this.open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE, 'readwrite');
            const store = tx.objectStore(this.STORE);
            store.clear();
            for (const r of records) store.put(r);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }));
    },

    clear() {
        return this.open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE, 'readwrite');
            const req = tx.objectStore(this.STORE).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        }));
    }
};

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
    currentHistoryId: null,  // 当前加载的历史记录ID

    // ---- 历史记录管理 ----

    // 一次性迁移旧版 localStorage 中的历史记录（升级后首次运行）
    async migrateLegacyHistory() {
        try {
            const raw = localStorage.getItem(CONFIG.HISTORY_KEY);
            if (!raw) return;
            const list = JSON.parse(raw);
            if (!Array.isArray(list) || list.length === 0) return;
            const existing = await HistoryDB.getAll();
            if (existing.length > 0) return; // 新库已有数据，跳过迁移
            await HistoryDB.replaceAll(list.slice(0, CONFIG.MAX_HISTORY_COUNT));
            localStorage.removeItem(CONFIG.HISTORY_KEY);
        } catch (e) {
            console.warn('迁移旧历史记录失败:', e);
        }
    },

    // 获取所有历史记录（按时间倒序）
    async getHistoryList() {
        try {
            const records = await HistoryDB.getAll();
            if (!Array.isArray(records)) return [];
            return records.sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            console.warn('读取历史记录失败:', e);
            return [];
        }
    },

    // 保存历史记录
    async saveHistory(name, data, columns) {
        try {
            const id = 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

            // 获取当前配置
            const config = {
                shownColumns: this.shownColumns || columns,
                columnWidths: this.columnWidths || {},
                sortState: this.sortState || { col: null, asc: true },
                filters: this.filters || {},
                pageSize: this.pageSize || 20
            };

            const record = {
                id: id,
                name: name,
                timestamp: Date.now(),
                rowCount: data.length,
                columns: columns,
                data: data,
                config: config
            };

            // 最新记录放最前面；只写入新记录，超出上限的删除最旧的
            await HistoryDB.put(record);
            const list = await this.getHistoryList();
            if (list.length > CONFIG.MAX_HISTORY_COUNT) {
                const extra = list.slice(CONFIG.MAX_HISTORY_COUNT);
                await HistoryDB.removeMany(extra.map(r => r.id));
            }
            return id;
        } catch (e) {
            console.warn('保存历史记录失败:', e);
            return null;
        }
    },

    // 加载指定历史记录
    async loadHistory(id) {
        try {
            const list = await this.getHistoryList();
            const record = list.find(item => item.id === id);
            if (!record) return null;

            // 恢复数据
            this.allData = record.data;
            this.allColumns = record.columns;
            this.shownColumns = record.config.shownColumns || record.columns;
            this.columnWidths = record.config.columnWidths || {};
            this.sortState = record.config.sortState || { col: null, asc: true };
            this.filters = record.config.filters || {};
            this.pageSize = record.config.pageSize || 20;
            this.currentHistoryId = id;

            // 保存到 sessionStorage，用于多标签页独立
            sessionStorage.setItem(CONFIG.ACTIVE_HISTORY_KEY, id);

            // 重新应用筛选和渲染
            this.applyFilters();
            return record;
        } catch (e) {
            console.warn('加载历史记录失败:', e);
            return null;
        }
    },

    // 删除历史记录
    async deleteHistory(id) {
        try {
            const list = await this.getHistoryList();
            const next = list.filter(item => item.id !== id);
            await HistoryDB.replaceAll(next);

            // 如果删除的是当前激活的，清除 sessionStorage
            if (this.currentHistoryId === id) {
                sessionStorage.removeItem(CONFIG.ACTIVE_HISTORY_KEY);
                this.currentHistoryId = null;
                this.allData = [];
                this.filteredData = [];
                this.allColumns = [];
                this.shownColumns = [];
                return true;
            }
            return false;
        } catch (e) {
            console.warn('删除历史记录失败:', e);
            return false;
        }
    },

    // 清空所有历史
    async clearHistory() {
        try {
            await HistoryDB.clear();
        } catch (e) {
            console.warn('清空历史记录失败:', e);
        }
        sessionStorage.removeItem(CONFIG.ACTIVE_HISTORY_KEY);
        this.currentHistoryId = null;
        this.allData = [];
        this.filteredData = [];
        this.allColumns = [];
        this.shownColumns = [];
    },

    // 获取当前激活的历史记录ID
    getActiveHistoryId() {
        return sessionStorage.getItem(CONFIG.ACTIVE_HISTORY_KEY);
    },

    // 检查是否有历史数据
    async hasHistory() {
        const list = await this.getHistoryList();
        return list.length > 0;
    },

    // ---- 原有方法 ---- (保持兼容)

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
        // 数据已通过 saveHistory 保存，这里保留兼容
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
            if (this.allColumns.includes('计划名字')) {
                this.sortState = { col: '计划名字', asc: true };
            }
        }
        const allDisp = Utils.getDisplayColumns(this.allColumns);
        this.shownColumns = this.shownColumns.filter(c => allDisp.includes(c));
        if (this.shownColumns.length === 0) {
            this.shownColumns = Utils.getDefaultShown(this.allColumns);
        }
    },

    async saveAll() {
        Utils.saveData(CONFIG.STORAGE_KEY, this.shownColumns);
        Utils.saveData(CONFIG.COL_WIDTH_KEY, this.columnWidths);
        Utils.saveData(CONFIG.COL_ORDER_KEY, this.shownColumns);
        Utils.saveData(CONFIG.FILTER_STATE_KEY, this.filters);
        Utils.saveData(CONFIG.SORT_STATE_KEY, this.sortState);
        Utils.saveData(CONFIG.PAGE_SIZE_KEY, String(this.pageSize));
        
        // 如果有当前历史记录，更新配置
        if (this.currentHistoryId) {
            try {
                const list = await this.getHistoryList();
                const record = list.find(item => item.id === this.currentHistoryId);
                if (record) {
                    record.config = {
                        shownColumns: this.shownColumns,
                        columnWidths: this.columnWidths,
                        sortState: this.sortState,
                        filters: this.filters,
                        pageSize: this.pageSize
                    };
                    await HistoryDB.put(record);
                }
            } catch (e) {
                console.warn('更新历史记录配置失败:', e);
            }
        }
    },

    preprocess(rows) {
        const dateCol = '日期';
        for (const row of rows) {
            const val = row[dateCol];
            if (val) {
                row['_dateRaw'] = String(val).trim();
            }
        }

        const numCols = new Set();
        for (const col of this.allColumns) {
            if (col === '日期') continue;
            for (const row of rows) {
                const val = row[col];
                if (val !== undefined && val !== null && val !== '') {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        numCols.add(col);
                        break;
                    }
                }
            }
        }
        for (const row of rows) {
            for (const col of numCols) {
                const val = row[col];
                if (val !== undefined && val !== null && val !== '') {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        row[col] = num;
                    }
                }
            }
        }
        return rows;
    },

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
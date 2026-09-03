// ================================================================
// 6. UI模块 (ui.js) - 设置面板、上传等
// ================================================================

// ---- UI 管理器 ----
const UIManager = {
    init() {
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInfo = document.getElementById('fileInfo');
        const dataStatus = document.getElementById('dataStatus');
        const rowCount = document.getElementById('rowCount');

        // ---- 通用解析回调 ----
        const onParseData = (rows, fileName) => {
            if (!rows || rows.length < 2) {
                alert('文件为空或格式不正确');
                return;
            }

            const headers = rows[0].map(h => String(h).trim());
            const validHeaders = headers.filter(h => h !== '');
            if (validHeaders.length === 0) {
                alert('未检测到有效的表头');
                return;
            }

            DataStore.allColumns = validHeaders;
            const data = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;
                const hasData = row.some(cell => cell !== '' && cell !== undefined && cell !== null);
                if (!hasData) continue;

                const obj = {};
                for (let j = 0; j < validHeaders.length; j++) {
                    const colName = validHeaders[j];
                    const originalIndex = headers.indexOf(colName);
                    let val = row[originalIndex] !== undefined ? row[originalIndex] : '';
                    if (typeof val === 'string') val = val.trim();
                    obj[colName] = val;
                }
                data.push(obj);
            }

            if (data.length === 0) {
                alert('未解析到有效数据');
                return;
            }

            // 预处理数据
            DataStore.allData = DataStore.preprocess(data);
            DataStore.loadPersisted();
            DataStore.applyFilters();
            
            // 保存到历史记录
            const historyId = DataStore.saveHistory(fileName, data, validHeaders);
            DataStore.currentHistoryId = historyId;
            
            Renderer.render();
            EventManager.rebindTableEvents();
            UIManager.renderSettingsPanel();
            UIManager.renderHistoryPanel();

            const displayName = fileName || '数据';
            dataStatus.textContent = `✅ 共 ${data.length} 条数据 (${displayName})`;
            rowCount.textContent = `${data.length} 行`;
            
            // 更新历史计数
            UIManager.updateHistoryBadge();
        };

        // ---- 解析 CSV（先用 TextDecoder 解码，再交给 XLSX） ----
        const parseCSVFromBuffer = (buffer, fileName, callback) => {
            const encodings = ['gbk', 'gb2312', 'utf-8', 'big5', 'windows-1252'];
            
            for (const encoding of encodings) {
                try {
                    const decoder = new TextDecoder(encoding);
                    const text = decoder.decode(buffer);
                    
                    if (text.includes('�')) continue;
                    
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    if (lines.length < 2) continue;
                    
                    const firstLine = lines[0];
                    const hasChinese = /[\u4e00-\u9fff]/.test(firstLine);
                    const hasGarbled = /�/.test(firstLine);
                    
                    if (hasGarbled) continue;
                    
                    if (hasChinese || encoding === 'utf-8') {
                        try {
                            const workbook = XLSX.read(text, {
                                type: 'string',
                                raw: true
                            });
                            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(firstSheet, {
                                header: 1,
                                defval: '',
                                raw: true
                            });
                            const filteredRows = rows.filter(row => row.some(cell => cell !== '' && cell !== undefined && cell !== null));
                            if (filteredRows.length > 0) {
                                console.log(`✅ 使用编码: ${encoding}`);
                                callback(filteredRows, fileName);
                                return;
                            }
                        } catch (_) {}
                    }
                } catch (_) {}
            }
            
            try {
                const workbook = XLSX.read(buffer, {
                    type: 'array',
                    raw: true,
                    cellDates: false
                });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, {
                    header: 1,
                    defval: '',
                    raw: true
                });
                const filteredRows = rows.filter(row => row.some(cell => cell !== '' && cell !== undefined && cell !== null));
                if (filteredRows.length > 0) {
                    console.log('✅ 使用 XLSX 自动检测');
                    callback(filteredRows, fileName);
                    return;
                }
            } catch (_) {}

            alert('解析 CSV 失败: 无法识别文件编码，请确保文件为 UTF-8 或 GBK 编码');
        };

        // ---- 处理 ZIP 文件 ----
        const processZipFile = async (file) => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                let csvFile = null;
                let csvFileName = '';

                for (const [name, zipEntry] of Object.entries(zip.files)) {
                    if (name.toLowerCase().endsWith('.csv') && !zipEntry.dir) {
                        csvFile = zipEntry;
                        csvFileName = name;
                        break;
                    }
                }

                if (!csvFile) {
                    alert('ZIP 文件中未找到 CSV 文件');
                    return;
                }

                const buffer = await csvFile.async('arraybuffer');
                parseCSVFromBuffer(buffer, csvFileName, onParseData);
                fileInfo.textContent = `📦 ${file.name} → 📎 ${csvFileName}`;

            } catch (err) {
                alert('解压 ZIP 文件失败: ' + err.message);
                console.error(err);
            }
        };

        // ---- 处理普通文件 ----
        const processFile = (file) => {
            const ext = file.name.split('.').pop().toLowerCase();

            if (ext === 'zip') {
                processZipFile(file);
                return;
            }

            if (ext === 'csv') {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const buffer = e.target.result;
                        parseCSVFromBuffer(buffer, file.name, onParseData);
                    } catch (err) {
                        alert('解析 CSV 失败: ' + err.message);
                    }
                };
                reader.readAsArrayBuffer(file);
                return;
            }

            // Excel 文件
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', raw: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                    onParseData(rows, file.name);
                } catch (err) {
                    alert('解析 Excel 失败: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        };

        // ---- 文件输入事件 ----
        fileInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                const file = this.files[0];
                fileInfo.textContent = '📎 ' + file.name;
                processFile(file);
            }
            this.value = '';
        });

        uploadBtn.addEventListener('click', () => fileInput.click());

        // ---- 设置面板 ----
        const settingBtn = document.getElementById('settingBtn');
        const overlay = document.getElementById('settingsOverlay');
        const panel = document.getElementById('settingsPanel');
        const closeBtn = document.getElementById('closeSettingsBtn');
        const closePanelBtn = document.getElementById('closePanelBtn');
        const resetBtn = document.getElementById('resetSettingsBtn');
        const searchCol = document.getElementById('searchCol');

        const openSettings = () => {
            overlay.classList.add('open');
            panel.classList.add('open');
            document.body.style.overflow = 'hidden';
            UIManager.renderSettingsPanel();
            searchCol.value = '';
            searchCol.dispatchEvent(new Event('input'));
        };

        const closeSettings = () => {
            overlay.classList.remove('open');
            panel.classList.remove('open');
            document.body.style.overflow = '';
        };

        settingBtn.addEventListener('click', openSettings);
        closeBtn.addEventListener('click', closeSettings);
        overlay.addEventListener('click', closeSettings);
        closePanelBtn.addEventListener('click', closeSettings);

        resetBtn.addEventListener('click', () => {
            const defaultCols = Utils.getDefaultShown(DataStore.allColumns);
            DataStore.shownColumns = defaultCols;
            DataStore.columnWidths = {};
            DataStore.sortState = { col: '计划名字', asc: true };
            DataStore.filters = {};
            DataStore.currentPage = 1;
            DataStore.saveAll();
            DataStore.applyFilters();
            Renderer.render();
            EventManager.rebindTableEvents();
            UIManager.renderSettingsPanel();
        });

        searchCol.addEventListener('input', UIManager.renderSettingsPanel);

        // ---- 历史面板 ----
        const historyBtn = document.getElementById('historyBtn');
        const historyOverlay = document.getElementById('historyOverlay');
        const historyPanel = document.getElementById('historyPanel');
        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        const historyList = document.getElementById('historyList');
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');

        const openHistory = () => {
            historyOverlay.classList.add('open');
            historyPanel.classList.add('open');
            document.body.style.overflow = 'hidden';
            UIManager.renderHistoryPanel();
        };

        const closeHistory = () => {
            historyOverlay.classList.remove('open');
            historyPanel.classList.remove('open');
            document.body.style.overflow = '';
        };

        historyBtn.addEventListener('click', openHistory);
        closeHistoryBtn.addEventListener('click', closeHistory);
        historyOverlay.addEventListener('click', closeHistory);
        
        // 清空历史
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有历史记录吗？此操作不可恢复！')) {
                DataStore.clearHistory();
                UIManager.renderHistoryPanel();
                UIManager.updateHistoryBadge();
                // 清空表格
                DataStore.allData = [];
                DataStore.filteredData = [];
                DataStore.allColumns = [];
                DataStore.shownColumns = [];
                Renderer.render();
                document.getElementById('dataStatus').textContent = '📂 请上传数据文件或切换历史记录';
                document.getElementById('rowCount').textContent = '';
                document.getElementById('totalInfo').textContent = '共 0 条';
                document.getElementById('fileInfo').textContent = '未选择文件';
                closeHistory();
            }
        });

        // ---- 全局 Esc 关闭 ----
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (panel.classList.contains('open')) closeSettings();
                if (historyPanel.classList.contains('open')) closeHistory();
                const filterPopup = document.getElementById('filterPopup');
                if (filterPopup && filterPopup.style.display === 'flex') {
                    filterPopup.style.display = 'none';
                }
            }
        });

        // ---- 初始化历史面板 ----
        this.updateHistoryBadge();
        
        // ---- 恢复上次激活的历史记录 ----
        this.restoreActiveHistory();
    },

    // ---- 恢复上次激活的历史记录 ----
    restoreActiveHistory() {
        const activeId = DataStore.getActiveHistoryId();
        if (activeId) {
            const record = DataStore.loadHistory(activeId);
            if (record) {
                console.log(`📂 恢复历史记录: ${record.name}`);
                Renderer.render();
                EventManager.rebindTableEvents();
                UIManager.renderSettingsPanel();
                UIManager.renderHistoryPanel();
                document.getElementById('dataStatus').textContent = `✅ 共 ${record.data.length} 条数据 (${record.name})`;
                document.getElementById('rowCount').textContent = `${record.data.length} 行`;
                document.getElementById('fileInfo').textContent = `📎 ${record.name}`;
                return;
            }
        }
        
        // 没有激活的历史，检查是否有历史记录可恢复
        const list = DataStore.getHistoryList();
        if (list.length > 0) {
            // 自动加载最新的历史
            const latest = list[0];
            const record = DataStore.loadHistory(latest.id);
            if (record) {
                console.log(`📂 自动加载最新历史: ${record.name}`);
                Renderer.render();
                EventManager.rebindTableEvents();
                UIManager.renderSettingsPanel();
                UIManager.renderHistoryPanel();
                document.getElementById('dataStatus').textContent = `✅ 共 ${record.data.length} 条数据 (${record.name})`;
                document.getElementById('rowCount').textContent = `${record.data.length} 行`;
                document.getElementById('fileInfo').textContent = `📎 ${record.name}`;
                return;
            }
        }
        
        // 无数据，显示空状态
        this.showEmptyState();
    },

    // ---- 显示空状态 ----
    showEmptyState() {
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            tableBody.innerHTML =
                `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">💡 请点击 "上传文件" 按钮导入数据，或从历史记录中切换</td></tr>`;
        }
        document.getElementById('dataStatus').textContent = '📂 请上传数据文件或切换历史记录';
        document.getElementById('rowCount').textContent = '';
        document.getElementById('totalInfo').textContent = '共 0 条';
        document.getElementById('totalPages').textContent = '1';
        document.getElementById('pageInput').value = '1';
        document.getElementById('prevPage').disabled = true;
        document.getElementById('nextPage').disabled = true;
        document.getElementById('pageSizeSelect').value = DataStore.pageSize;
    },

    // ---- 更新历史徽章 ----
    updateHistoryBadge() {
        const list = DataStore.getHistoryList();
        const badge = document.getElementById('historyBadge');
        if (badge) {
            badge.textContent = list.length;
            badge.style.display = list.length > 0 ? 'inline' : 'none';
        }
    },

    // ---- 渲染历史面板 ----
    renderHistoryPanel() {
        const list = DataStore.getHistoryList();
        const container = document.getElementById('historyList');
        const activeId = DataStore.getActiveHistoryId();
        
        if (list.length === 0) {
            container.innerHTML = `
                <div class="history-empty">
                    <span style="font-size:32px;">📭</span>
                    <p>暂无历史记录</p>
                    <p style="font-size:12px;color:var(--text-muted);">上传数据后会自动保存</p>
                </div>
            `;
            return;
        }

        let html = '';
        for (const item of list) {
            const isActive = item.id === activeId;
            const date = new Date(item.timestamp);
            const dateStr = date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            html += `
                <div class="history-item ${isActive ? 'active' : ''}" data-id="${item.id}">
                    <div class="history-item-info">
                        <div class="history-item-name" title="${item.name}">${item.name}</div>
                        <div class="history-item-meta">
                            <span>📊 ${item.rowCount} 行</span>
                            <span>🕐 ${dateStr}</span>
                        </div>
                    </div>
                    <div class="history-item-actions">
                        <button class="history-btn-load" data-id="${item.id}" title="加载此历史记录">📂</button>
                        <button class="history-btn-delete" data-id="${item.id}" title="删除此历史记录">✕</button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        // 绑定事件
        container.querySelectorAll('.history-btn-load').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                UIManager.loadHistoryRecord(id);
            });
        });

        container.querySelectorAll('.history-btn-delete').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                if (confirm('确定要删除此历史记录吗？')) {
                    const isActive = id === DataStore.getActiveHistoryId();
                    DataStore.deleteHistory(id);
                    UIManager.renderHistoryPanel();
                    UIManager.updateHistoryBadge();
                    if (isActive) {
                        // 如果删除的是当前激活的，尝试加载其他历史或显示空状态
                        const list2 = DataStore.getHistoryList();
                        if (list2.length > 0) {
                            UIManager.loadHistoryRecord(list2[0].id);
                        } else {
                            UIManager.showEmptyState();
                            document.getElementById('fileInfo').textContent = '未选择文件';
                        }
                    }
                }
            });
        });

        // 点击整个条目也可以加载
        container.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', function() {
                const id = this.dataset.id;
                if (id && !this.classList.contains('active')) {
                    UIManager.loadHistoryRecord(id);
                }
            });
        });

        this.updateHistoryBadge();
    },

    // ---- 加载历史记录 ----
    loadHistoryRecord(id) {
        const record = DataStore.loadHistory(id);
        if (!record) {
            alert('加载历史记录失败');
            return;
        }
        
        console.log(`📂 切换到历史记录: ${record.name}`);
        Renderer.render();
        EventManager.rebindTableEvents();
        UIManager.renderSettingsPanel();
        UIManager.renderHistoryPanel();
        
        document.getElementById('dataStatus').textContent = `✅ 共 ${record.data.length} 条数据 (${record.name})`;
        document.getElementById('rowCount').textContent = `${record.data.length} 行`;
        document.getElementById('fileInfo').textContent = `📎 ${record.name}`;
        
        // 关闭历史面板
        document.getElementById('historyPanel').classList.remove('open');
        document.getElementById('historyOverlay').classList.remove('open');
        document.body.style.overflow = '';
    },

    // ---- 渲染设置面板 ----
    renderSettingsPanel() {
        const allDisp = Utils.getDisplayColumns(DataStore.allColumns);
        const shownSet = new Set(DataStore.shownColumns);
        const colList = document.getElementById('colList');
        const settingsCountBadge = document.getElementById('settingsCountBadge');
        const settingCount = document.getElementById('settingCount');

        let html = '';
        for (const col of allDisp) {
            const checked = shownSet.has(col) ? 'checked' : '';
            const isDefault = CONFIG.DEFAULT_SHOWN_COLS.has(col);
            const tag = isDefault ?
                '<span class="col-tag default">默认</span>' :
                '<span class="col-tag">可选</span>';
            html += `
                        <label class="col-item" data-col="${col}">
                            <input type="checkbox" ${checked} value="${col}">
                            <span class="col-name">${col}</span>
                            ${tag}
                        </label>
                    `;
        }
        colList.innerHTML = html;

        const keyword = document.getElementById('searchCol').value.trim().toLowerCase();
        colList.querySelectorAll('.col-item').forEach(el => {
            const name = el.dataset.col.toLowerCase();
            el.style.display = name.includes(keyword) ? '' : 'none';
        });

        colList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', function() {
                const col = this.value;
                if (this.checked) {
                    if (!DataStore.shownColumns.includes(col)) {
                        DataStore.shownColumns.push(col);
                    }
                } else {
                    const idx = DataStore.shownColumns.indexOf(col);
                    if (idx !== -1) {
                        DataStore.shownColumns.splice(idx, 1);
                    }
                }
                DataStore.saveAll();
                Renderer.render();
                EventManager.rebindTableEvents();
                UIManager.renderSettingsPanel();
            });
        });

        UIManager.renderSelectedOrder();

        const count = DataStore.shownColumns.length;
        const totalCols = allDisp.length;
        if (settingCount) settingCount.textContent = count;
        if (settingsCountBadge) {
            settingsCountBadge.textContent = count + ' / ' + totalCols + ' 列';
        }
    },

    // ---- 已选顺序列表 ----
    renderSelectedOrder() {
        const list = document.getElementById('selectedOrderList');
        if (!list) return;

        if (DataStore.shownColumns.length === 0) {
            list.innerHTML = '<li class="empty-hint">暂无已选列</li>';
            return;
        }

        let html = '';
        for (let i = 0; i < DataStore.shownColumns.length; i++) {
            const col = DataStore.shownColumns[i];
            html += `
                        <li class="order-item" draggable="true" data-index="${i}">
                            <span class="drag-icon">⠿</span>
                            <span class="order-name">${col}</span>
                        </li>
                    `;
        }
        list.innerHTML = html;

        list.querySelectorAll('.order-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const li = e.target.closest('.order-item');
                if (!li) return;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', li.dataset.index);
                li.classList.add('dragging');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const li = e.target.closest('.order-item');
                if (li) li.classList.add('drag-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetLi = e.target.closest('.order-item');
                if (!targetLi) return;
                const targetIndex = parseInt(targetLi.dataset.index, 10);
                const srcIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(srcIndex) && srcIndex !== targetIndex) {
                    const cols = [...DataStore.shownColumns];
                    const [removed] = cols.splice(srcIndex, 1);
                    cols.splice(targetIndex, 0, removed);
                    DataStore.shownColumns = cols;
                    DataStore.saveAll();
                    Renderer.render();
                    EventManager.rebindTableEvents();
                    UIManager.renderSettingsPanel();
                }
                document.querySelectorAll('.order-item.drag-over')
                    .forEach(el => el.classList.remove('drag-over'));
            });

            item.addEventListener('dragend', () => {
                document.querySelectorAll('.order-item.dragging')
                    .forEach(el => el.classList.remove('dragging'));
                document.querySelectorAll('.order-item.drag-over')
                    .forEach(el => el.classList.remove('drag-over'));
            });
        });
    }
};

// ================================================================
// 主入口
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    Renderer.init({
        tableHead: document.getElementById('tableHead'),
        tableBody: document.getElementById('tableBody'),
        totalInfo: document.getElementById('totalInfo'),
        totalPagesSpan: document.getElementById('totalPages'),
        pageInput: document.getElementById('pageInput'),
        prevPageBtn: document.getElementById('prevPage'),
        nextPageBtn: document.getElementById('nextPage'),
        pageSizeSelect: document.getElementById('pageSizeSelect'),
        dataStatus: document.getElementById('dataStatus'),
        rowCount: document.getElementById('rowCount'),
        settingCount: document.getElementById('settingCount'),
        settingsCountBadge: document.getElementById('settingsCountBadge')
    });

    EventManager.init({
        tableHead: document.getElementById('tableHead'),
        filterPopup: document.getElementById('filterPopup'),
        filterPopupTitle: document.getElementById('filterPopupTitle'),
        filterPopupBody: document.getElementById('filterPopupBody'),
        filterClearBtn: document.getElementById('filterClearBtn'),
        filterApplyBtn: document.getElementById('filterApplyBtn')
    });

    UIManager.init();

    console.log('📊 分组报表已启动 (支持历史记录 + 多标签页独立)');
});
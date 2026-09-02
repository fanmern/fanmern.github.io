// ================================================================
// 6. UI模块 (ui.js) - 设置面板、上传等
// ================================================================

// ---- 编码检测工具 ----
const EncodingDetector = {
    detectEncoding(buffer) {
        try {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            decoder.decode(buffer);
            return 'utf-8';
        } catch (_) {
            try {
                const decoder = new TextDecoder('gbk', { fatal: true });
                decoder.decode(buffer);
                return 'gbk';
            } catch (_2) {
                return 'gb2312';
            }
        }
    },
    decodeBuffer(buffer, encoding) {
        const decoder = new TextDecoder(encoding);
        return decoder.decode(buffer);
    }
};

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
            DataStore.allColumns = headers;
            const data = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const obj = {};
                for (let j = 0; j < headers.length; j++) {
                    let val = row[j] !== undefined ? row[j] : '';
                    if (typeof val === 'string') val = val.trim();
                    obj[headers[j]] = val;
                }
                data.push(obj);
            }
            DataStore.allData = DataStore.preprocess(data);
            DataStore.loadPersisted();
            DataStore.applyFilters();
            Renderer.render();
            EventManager.rebindTableEvents();
            UIManager.renderSettingsPanel();
            DataStore.saveRawData(data);
            const displayName = fileName || '数据';
            dataStatus.textContent = `✅ 共 ${data.length} 条数据 (${displayName})`;
            rowCount.textContent = `${data.length} 行`;
        };

        // ---- 解析 CSV 内容（支持编码检测） ----
        const parseCSVContent = (content, fileName, callback) => {
            try {
                // 先尝试 UTF-8
                const workbook = XLSX.read(content, { type: 'string', raw: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                callback(rows, fileName);
            } catch (_) {
                // 尝试检测编码后重新解析
                try {
                    const encoder = new TextEncoder();
                    const buffer = encoder.encode(content);
                    const encoding = EncodingDetector.detectEncoding(buffer);
                    const decoded = EncodingDetector.decodeBuffer(buffer, encoding);
                    const workbook = XLSX.read(decoded, { type: 'string', raw: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                    callback(rows, fileName);
                } catch (err) {
                    // 最后尝试 GBK 强制解码
                    try {
                        const encoder = new TextEncoder();
                        const buffer = encoder.encode(content);
                        const decoded = new TextDecoder('gbk').decode(buffer);
                        const workbook = XLSX.read(decoded, { type: 'string', raw: true });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                        callback(rows, fileName);
                    } catch (err2) {
                        alert(`解析 CSV 失败: ${fileName}\n${err2.message}`);
                    }
                }
            }
        };

        // ---- 处理 ZIP 文件 ----
        const processZipFile = async (file) => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                let csvFile = null;
                let csvFileName = '';

                // 查找第一个 .csv 文件
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

                // 读取 CSV 内容
                const content = await csvFile.async('string');
                parseCSVContent(content, csvFileName, onParseData);
                fileInfo.textContent = `📦 ${file.name} → 📎 ${csvFileName}`;

            } catch (err) {
                alert('解压 ZIP 文件失败: ' + err.message);
                console.error(err);
            }
        };

        // ---- 处理普通 CSV/Excel 文件 ----
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
                        const content = e.target.result;
                        parseCSVContent(content, file.name, onParseData);
                    } catch (err) {
                        // 尝试以 ArrayBuffer 方式读取
                        const reader2 = new FileReader();
                        reader2.onload = function(e2) {
                            try {
                                const buffer = e2.target.result;
                                const encoding = EncodingDetector.detectEncoding(buffer);
                                const text = EncodingDetector.decodeBuffer(buffer, encoding);
                                parseCSVContent(text, file.name, onParseData);
                            } catch (err2) {
                                alert('解析 CSV 失败: ' + err2.message);
                            }
                        };
                        reader2.readAsArrayBuffer(file);
                    }
                };
                reader.readAsText(file, 'UTF-8');
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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (panel.classList.contains('open')) closeSettings();
                const filterPopup = document.getElementById('filterPopup');
                if (filterPopup && filterPopup.style.display === 'flex') {
                    filterPopup.style.display = 'none';
                }
            }
        });
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

    // 恢复上次的数据
    const rawData = DataStore.loadRawData();
    if (rawData && rawData.length > 0) {
        DataStore.allColumns = Object.keys(rawData[0]);
        DataStore.allData = DataStore.preprocess(rawData);
        DataStore.loadPersisted();
        DataStore.applyFilters();
        Renderer.render();
        EventManager.rebindTableEvents();
        UIManager.renderSettingsPanel();
        document.getElementById('fileInfo').textContent = '📎 已恢复上次数据';
        document.getElementById('dataStatus').textContent = `✅ 共 ${rawData.length} 条数据`;
        document.getElementById('rowCount').textContent = `${rawData.length} 行`;
    } else {
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            tableBody.innerHTML =
                `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">💡 请点击 "上传文件" 按钮导入数据</td></tr>`;
        }
        document.getElementById('dataStatus').textContent = '📂 请上传数据文件';
        document.getElementById('rowCount').textContent = '';
        document.getElementById('totalInfo').textContent = '共 0 条';
        document.getElementById('totalPages').textContent = '1';
        document.getElementById('pageInput').value = '1';
        document.getElementById('prevPage').disabled = true;
        document.getElementById('nextPage').disabled = true;
        document.getElementById('pageSizeSelect').value = DataStore.pageSize;
    }

    console.log('📊 分组报表已启动 (支持 ZIP 压缩包 + 多编码)');
});
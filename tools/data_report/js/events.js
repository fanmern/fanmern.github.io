// ================================================================
// 5. 事件模块 (events.js)
// ================================================================
const EventManager = {
    // DOM 引用由外部注入
    tableHead: null,
    filterPopup: null,
    filterPopupTitle: null,
    filterPopupBody: null,
    filterClearBtn: null,
    filterApplyBtn: null,
    init(deps) {
        Object.assign(this, deps);
        this.bindGlobalEvents();
    },
    bindGlobalEvents() {
        // 排序
        document.addEventListener('click', (e) => {
            const sortIcon = e.target.closest('.sort-icon');
            if (sortIcon) {
                e.stopPropagation();
                const col = sortIcon.dataset.col;
                const data = DataStore;
                if (data.sortState.col === col) {
                    data.sortState.asc = !data.sortState.asc;
                } else {
                    data.sortState.col = col;
                    data.sortState.asc = true;
                }
                data.saveAll();
                Renderer.render();
                this.rebindTableEvents();
            }
        });
        // 筛选图标
        // 筛选图标点击（使用防抖）
        let filterDebounceTimer = null;
        document.addEventListener('click', (e) => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                e.stopPropagation();
                const col = filterIcon.dataset.col;
                if (filterDebounceTimer) {
                    clearTimeout(filterDebounceTimer);
                    filterDebounceTimer = null;
                }
                filterDebounceTimer = setTimeout(() => {
                    this.openFilterPopup(col, filterIcon);
                    filterDebounceTimer = null;
                }, 50);
            }
        });
        // 列宽调整
        document.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.col-resize-handle');
            if (handle) {
                e.preventDefault();
                this.startResize(handle);
            }
        });
        // 列拖拽 (thead th)
        document.addEventListener('dragstart', (e) => {
            const th = e.target.closest('th[draggable="true"]');
            if (th) {
                this.dragSrcIndex = Array.from(th.parentElement.children).indexOf(th);
                th.classList.add('th-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', this.dragSrcIndex);
            }
        });
        document.addEventListener('dragover', (e) => {
            const th = e.target.closest('th[draggable="true"]');
            if (th) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                th.classList.add('th-drag-over');
            }
        });
        document.addEventListener('drop', (e) => {
            const targetTh = e.target.closest('th[draggable="true"]');
            if (targetTh) {
                e.preventDefault();
                const targetIndex = Array.from(targetTh.parentElement.children).indexOf(targetTh);
                const srcIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(srcIndex) && srcIndex !== targetIndex) {
                    const cols = [...DataStore.shownColumns];
                    const [removed] = cols.splice(srcIndex, 1);
                    cols.splice(targetIndex, 0, removed);
                    DataStore.shownColumns = cols;
                    DataStore.saveAll();
                    Renderer.render();
                    this.rebindTableEvents();
                }
                document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
            }
        });
        document.addEventListener('dragend', (e) => {
            document.querySelectorAll('.th-dragging').forEach(el => el.classList.remove('th-dragging'));
            document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
        });
        // 分页事件
        document.getElementById('prevPage').addEventListener('click', () => {
            if (DataStore.currentPage > 1) {
                DataStore.currentPage--;
                Renderer.render();
                this.rebindTableEvents();
            }
        });
        document.getElementById('nextPage').addEventListener('click', () => {
            if (DataStore.currentPage < DataStore.totalPages) {
                DataStore.currentPage++;
                Renderer.render();
                this.rebindTableEvents();
            }
        });
        document.getElementById('pageInput').addEventListener('change', function () {
            let val = parseInt(this.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            const totalPages = DataStore.totalPages;
            if (val > totalPages) val = totalPages;
            if (val !== DataStore.currentPage) {
                DataStore.currentPage = val;
                Renderer.render();
                EventManager.rebindTableEvents();
            }
        });
        document.getElementById('pageSizeSelect').addEventListener('change', function () {
            DataStore.pageSize = parseInt(this.value, 10);
            Utils.saveData(CONFIG.PAGE_SIZE_KEY, String(DataStore.pageSize));
            DataStore.currentPage = 1;
            Renderer.render();
            EventManager.rebindTableEvents();
        });
    },
    // 重新绑定表格内部事件（因渲染会替换 DOM）
    rebindTableEvents() {
        // 由于使用了事件委托，大部分无需重新绑定
    },
    // ---- 列宽调整 ----
    startResize(handle) {
        const th = handle.closest('th');
        if (!th) return;
        const col = handle.dataset.col;
        const colIndex = Array.from(th.parentElement.children).indexOf(th);
        const currentWidth = th.offsetWidth;
        const startX = event.clientX;
        const onMove = (e) => {
            const delta = e.clientX - startX;
            let newWidth = currentWidth + delta;
            if (newWidth < 30) newWidth = 30;
            const thEl = document.querySelectorAll('th')[colIndex];
            if (thEl) thEl.style.width = newWidth + 'px';
            DataStore.columnWidths[col] = newWidth;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            DataStore.saveAll();
            handle.classList.remove('active');
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        handle.classList.add('active');
    },
    // ---- 筛选浮层 ----
    // events.js 中的 openFilterPopup 方法
    openFilterPopup(col, iconEl) {
        // 如果已存在浮层，先关闭
        if (this.filterPopup.style.display === 'flex') {
            this.filterPopup.style.display = 'none';
        }

        const data = DataStore;
        const type = Utils.guessColumnType(col, data.allData);
        const currentFilter = data.filters[col] || null;
        this.filterPopupTitle.textContent = `筛选: ${col}`;

        let bodyHtml = '';
        if (type === 'text') {
            const val = typeof currentFilter === 'string' ? currentFilter : '';
            bodyHtml = `<input type="text" id="filterTextInput" placeholder="输入关键词..." value="${Utils.escapeHtml(val)}">`;
        } else if (type === 'number') {
            const min = currentFilter && typeof currentFilter === 'object' ? currentFilter.min || '' : '';
            const max = currentFilter && typeof currentFilter === 'object' ? currentFilter.max || '' : '';
            bodyHtml = `<input type="number" id="filterMin" placeholder="最小值" value="${min}"><input type="number" id="filterMax" placeholder="最大值" value="${max}">`;
        } else if (type === 'date') {
            const start = currentFilter && typeof currentFilter === 'object' ? currentFilter.start || '' : '';
            const end = currentFilter && typeof currentFilter === 'object' ? currentFilter.end || '' : '';
            bodyHtml = `<input type="date" id="filterStart" placeholder="开始日期" value="${start}"><input type="date" id="filterEnd" placeholder="结束日期" value="${end}">`;
        }
        this.filterPopupBody.innerHTML = bodyHtml;

        const rect = iconEl.getBoundingClientRect();
        let left = rect.left,
            top = rect.bottom + 4;
        if (left + 280 > window.innerWidth) left = window.innerWidth - 280;
        if (top + 200 > window.innerHeight) top = rect.top - 200;
        this.filterPopup.style.left = left + 'px';
        this.filterPopup.style.top = top + 'px';
        this.filterPopup.style.display = 'flex';

        // 清除旧的事件监听（通过移除并重新添加）
        const newClearBtn = this.filterClearBtn.cloneNode(true);
        this.filterClearBtn.parentNode.replaceChild(newClearBtn, this.filterClearBtn);
        this.filterClearBtn = newClearBtn;

        const newApplyBtn = this.filterApplyBtn.cloneNode(true);
        this.filterApplyBtn.parentNode.replaceChild(newApplyBtn, this.filterApplyBtn);
        this.filterApplyBtn = newApplyBtn;

        this.filterClearBtn.onclick = () => {
            delete data.filters[col];
            data.saveAll();
            data.applyFilters();
            Renderer.render();
            EventManager.rebindTableEvents();
            this.filterPopup.style.display = 'none';
        };

        this.filterApplyBtn.onclick = () => {
            let newFilter = null;
            if (type === 'text') {
                const val = document.getElementById('filterTextInput').value.trim();
                if (val) newFilter = val;
            } else if (type === 'number') {
                const min = document.getElementById('filterMin').value.trim();
                const max = document.getElementById('filterMax').value.trim();
                if (min !== '' || max !== '') newFilter = { min, max };
            } else if (type === 'date') {
                const start = document.getElementById('filterStart').value.trim();
                const end = document.getElementById('filterEnd').value.trim();
                if (start !== '' || end !== '') newFilter = { start, end };
            }
            if (newFilter) data.filters[col] = newFilter;
            else delete data.filters[col];
            data.saveAll();
            data.applyFilters();
            Renderer.render();
            EventManager.rebindTableEvents();
            this.filterPopup.style.display = 'none';
        };

        // 点击外部关闭
        const closeHandler = (e) => {
            if (!this.filterPopup.contains(e.target) && e.target !== iconEl) {
                this.filterPopup.style.display = 'none';
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);

        const input = this.filterPopupBody.querySelector('input');
        if (input) {
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.filterApplyBtn.click(); });
            setTimeout(() => input.focus(), 50);
        }
    }
};

// ================================================================
// 4. 渲染模块 (render.js)
// ================================================================
const Renderer = {
    // DOM 引用由外部注入
    tableHead: null,
    tableBody: null,
    totalInfo: null,
    totalPagesSpan: null,
    pageInput: null,
    prevPageBtn: null,
    nextPageBtn: null,
    pageSizeSelect: null,
    dataStatus: null,
    rowCount: null,
    settingCount: null,
    settingsCountBadge: null,
    init(deps) {
        Object.assign(this, deps);
    },
    render() {
        const data = DataStore;
        const pageData = data.getPageData();
        const sortedData = data.sortData(pageData);
        const allDisp = Utils.getDisplayColumns(data.allColumns);
        let orderedCols = [...data.shownColumns];
        orderedCols = orderedCols.filter(c => allDisp.includes(c));
        const headerCols = orderedCols;
        // ---- 表头 ----
        let theadHtml = '<tr>';
        for (const col of headerCols) {
            const isNum = Utils.isNumericColumn(col);
            const sortDir = data.sortState.col === col ? (data.sortState.asc ? '▲' : '▼') : '';
            const sortCls = data.sortState.col === col ? 'active' : '';
            const width = data.columnWidths[col] ? `style="width:${data.columnWidths[col]}px;"` : '';
            const hasFilter = !!data.filters[col];
            const filterActive = hasFilter ? 'active' : '';
            theadHtml += `
                        <th data-col="${col}" draggable="true" ${width} class="${isNum ? 'num' : ''}">
                            <div class="th-inner">
                                <span class="col-label">${col}</span>
                                <span class="sort-icon" data-col="${col}">
                                    <span class="arrow ${sortCls}">${sortDir || '⇅'}</span>
                                </span>
                                <span class="filter-icon ${filterActive}" data-col="${col}" title="筛选">
                                    <svg viewBox="0 0 24 24"><polygon points="3 6 10 13 10 21 14 18 14 13 21 6 21 3 3 3 3 6" /></svg>
                                </span>
                            </div>
                            <div class="col-resize-handle" data-col="${col}"></div>
                        </th>
                    `;
        }
        theadHtml += '</tr>';
        this.tableHead.innerHTML = theadHtml;
        // ---- 表体 ----
        const groupCol = '计划名字';
        const colIndex = headerCols.indexOf(groupCol);
        const doMerge = colIndex !== -1 && (data.sortState.col === null || data.sortState.col === groupCol);
        let bodyHtml = '';
        if (sortedData.length === 0) {
            bodyHtml =
                `<tr><td colspan="${headerCols.length}" style="text-align:center;padding:30px;color:var(--text-muted);">暂无数据</td></tr>`;
        } else {
            // 分组
            let groups = [];
            if (doMerge) {
                let currentGroup = null;
                for (const row of sortedData) {
                    const val = row[groupCol] ?? '';
                    if (!currentGroup || currentGroup.key !== val) {
                        if (currentGroup) groups.push(currentGroup);
                        currentGroup = { key: val, rows: [row] };
                    } else {
                        currentGroup.rows.push(row);
                    }
                }
                if (currentGroup) groups.push(currentGroup);
            } else {
                groups = sortedData.map(row => ({ key: null, rows: [row] }));
            }
            const mergeColsSet = new Set(CONFIG.MERGE_COLS.filter(c => headerCols.includes(c)));
            const centerExclude = CONFIG.CENTER_EXCLUDE;
            for (let gIdx = 0; gIdx < groups.length; gIdx++) {
                const group = groups[gIdx];
                const rows = group.rows;
                const groupClass = (gIdx % 2 === 0) ? 'group-even' : 'group-odd';
                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r];
                    const isFirstInGroup = (r === 0);
                    bodyHtml += `<tr class="${groupClass}">`;
                    for (let c = 0; c < headerCols.length; c++) {
                        const col = headerCols[c];
                        if (doMerge && mergeColsSet.has(col) && !isFirstInGroup) {
                            continue;
                        }
                        let val = row[col] !== undefined ? row[col] : '';
                        if (val === '' || val === null || val === undefined) val = '';
                        const isNum = Utils.isNumericColumn(col);
                        let cls = isNum ? 'num' : '';
                        let wrapClass = '';
                        if (col === '计划名字' || col === '主体名称' || col === '日期') {
                            wrapClass = 'wrap';
                        }
                        // 居中：除指定列外，其他居中
                        if (!centerExclude.includes(col)) {
                            cls += ' center';
                        }
                        let displayVal = val;
                        if (Utils.isPercentageColumn(col) && typeof val === 'number') {
                            displayVal = Utils.formatPercent(val);
                        } else if (typeof val === 'number' && !isNum) {
                            displayVal = String(val);
                        } else if (typeof val !== 'string') {
                            displayVal = String(val);
                        }
                        let cellContent = Utils.escapeHtml(String(displayVal));
                        // ---- 链接处理 ----
                        // 1. 计划名字链接
                        // 在 render.js 的 render() 方法中，处理计划名字链接的部分
                        if (col === '计划名字') {
                            const planId = row['计划ID'] || '';
                            const dateRaw = row['_dateRaw'] || row['日期'] || '';
                            const sceneId = String(row['场景ID'] ?? row['原二级场景ID'] ?? '');
                            let link = '#';

                            // 使用工具函数解析日期范围
                            const dateRange = Utils.parseDateRange(dateRaw);
                            const start = dateRange.start;
                            const end = dateRange.end;

                            if (sceneId === '371') {
                                // 关键词推广：使用原始日期范围（包含结束日期）
                                link = Utils.buildPlanLink(planId, dateRaw);
                            } else if (sceneId === '372') {
                                // 人群推广：使用拆分后的开始和结束日期
                                if (start && end) {
                                    const params = new URLSearchParams({
                                        mx_bizCode: 'onebpDisplay',
                                        bizCode: 'onebpDisplay',
                                        tab: '',
                                        startTime: start,
                                        endTime: end,
                                        campaignId: planId,
                                        orderBy: 'desc'
                                    });
                                    link = `https://one.alimama.com/index.html#!/manage/display-detail?${params.toString()}`;
                                }
                            } else if (sceneId === '436') {
                                // 商品推广（场景436）
                                const subjectId = row['主体ID'] || '';
                                if (subjectId) {
                                    const params = new URLSearchParams({
                                        offset: '0',
                                        searchKey: 'itemId',
                                        searchValue: subjectId
                                    });
                                    link = `https://one.alimama.com/index.html#!/manage/onesite?${params.toString()}`;
                                }
                            }

                            if (link !== '#') {
                                cellContent = `<a href="${link}" target="_blank">${cellContent}</a>`;
                            }
                        }
                        // 2. 主体名称链接
                        if (col === '主体名称') {
                            const planId = row['计划ID'] || '';
                            const adgroupId = row['单元ID'] || '';
                            const dateRaw = row['_dateRaw'] || row['日期'] || '';
                            // 仅当 adgroupId 非空时才生成链接
                            if (adgroupId && planId) {
                                const link = Utils.buildAdgroupLink(planId, adgroupId, dateRaw);
                                if (link !== '#') {
                                    cellContent = `<a href="${link}" target="_blank">${cellContent}</a>`;
                                }
                            }
                            // 否则 cellContent 保持原样（无链接）
                        }
                        let extraAttr = '';
                        if (doMerge && mergeColsSet.has(col) && isFirstInGroup) {
                            extraAttr = ` rowspan="${rows.length}"`;
                            cellContent = `<span style="font-weight:500;">${cellContent}</span>`;
                        }
                        const tdClass = (doMerge && mergeColsSet.has(col) && isFirstInGroup) ? 'merged' : '';
                        bodyHtml +=
                            `<td class="${cls} ${wrapClass} ${tdClass}"${extraAttr}>${cellContent}</td>`;
                    }
                    bodyHtml += '</tr>';
                }
            }
        }
        this.tableBody.innerHTML = bodyHtml;
        // ---- 分页信息 ----
        const total = data.total;
        const totalPages = data.totalPages;
        this.totalInfo.textContent = `共 ${total} 条`;
        this.totalPagesSpan.textContent = totalPages;
        this.pageInput.value = data.currentPage;
        this.pageInput.max = totalPages;
        this.prevPageBtn.disabled = data.currentPage <= 1;
        this.nextPageBtn.disabled = data.currentPage >= totalPages;
        this.pageSizeSelect.value = data.pageSize;
        this.dataStatus.textContent = `✅ 共 ${total} 条 (原始 ${data.allData.length} 条)`;
        this.rowCount.textContent = `${total} 行`;
        // 更新设置计数
        const count = data.shownColumns.length;
        const totalCols = Utils.getDisplayColumns(data.allColumns).length;
        this.settingCount.textContent = count;
        this.settingsCountBadge.textContent = count + ' / ' + totalCols + ' 列';
    }
};

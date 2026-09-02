// ================================================================
// 2. 工具模块 (utils.js)
// ================================================================
const Utils = {
    getDisplayColumns(cols) {
        return cols.filter(c => !CONFIG.HIDDEN_COLS.has(c));
    },
    getDefaultShown(cols) {
        return this.getDisplayColumns(cols).filter(c => CONFIG.DEFAULT_SHOWN_COLS.has(c));
    },
    parseDateRange(dateStr) {
        if (!dateStr) return { start: null, end: null };
        const s = String(dateStr).trim();
        let start, end;
        if (s.includes('至')) {
            const parts = s.split('至');
            start = parts[0].trim();
            end = parts[1].trim();
        } else {
            start = s;
            end = s;
        }
        const fmt = (d) => {
            if (!d || d.length !== 8) return d;
            return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        };
        return { start: fmt(start), end: fmt(end) };
    },
    buildPlanLink(planId, dateStr) {
        if (!planId) return '#';
        const { start, end } = this.parseDateRange(dateStr);
        if (!start || !end) return '#';
        const params = new URLSearchParams({
            mx_bizCode: 'onebpSearch',
            bizCode: 'onebpSearch',
            startTime: start,
            endTime: end,
            campaignId: planId,
            orderField: 'charge',
            orderBy: 'desc',
            offset: '0'
        });
        return `https://one.alimama.com/index.html#!/manage/search-detail?${params.toString()}`;
    },
    buildAdgroupLink(planId, adgroupId, dateStr) {
        if (!planId || !adgroupId) return '#';
        const { start, end } = this.parseDateRange(dateStr);
        if (!start || !end) return '#';
        const params = new URLSearchParams({
            mx_bizCode: 'onebpSearch',
            bizCode: 'onebpSearch',
            campaignId: planId,
            tab: '',
            startTime: start,
            endTime: end,
            adgroupId: adgroupId
        });
        return `https://one.alimama.com/index.html#!/manage/search-detail?${params.toString()}`;
    },
    isPercentageColumn(col) {
        return CONFIG.PERCENTAGE_COLS.has(col);
    },
    formatPercent(value) {
        if (value === '' || value === null || value === undefined) return '';
        const num = parseFloat(value);
        if (isNaN(num)) return String(value);
        return (num * 100).toFixed(2) + '%';
    },
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    isNumericColumn(col) {
        const numKeywords = ['花费', '点击率', '平均点击花费', '千次展现花费', '总预售成交金额', '总预售成交笔数',
            '直接预售成交金额', '直接预售成交笔数', '间接预售成交金额', '间接预售成交笔数',
            '直接成交金额', '间接成交金额', '总成交金额', '总成交笔数', '直接成交笔数', '间接成交笔数',
            '点击转化率', '投入产出比', '含预售投产比', '总成交成本', '总购物车数', '直接购物车数',
            '间接购物车数', '加购率', '收藏宝贝数', '收藏店铺数', '店铺收藏成本', '总收藏加购数',
            '总收藏加购成本', '宝贝收藏加购数', '宝贝收藏加购成本', '总收藏数', '宝贝收藏成本',
            '宝贝收藏率', '加购成本', '拍下订单笔数', '拍下订单金额', '直接收藏宝贝数', '间接收藏宝贝数',
            '优惠券领取量', '购物金充值笔数', '购物金充值金额', '旺旺咨询量', '引导访问量', '引导访问人数',
            '引导访问潜客数', '引导访问潜客占比', '入会率', '入会量', '引导访问率', '深度访问量',
            '平均访问页面数', '成交新客数', '成交新客占比', '会员首购人数', '会员成交金额', '会员成交笔数',
            '成交人数', '人均成交笔数', '人均成交金额', '自然流量转化金额', '自然流量曝光量',
            '平台助推总成交', '平台助推直接成交', '平台助推点击', '宝贝优惠券抵扣金额',
            '宝贝优惠券撬动总成交', '宝贝优惠券撬动直接成交', '宝贝优惠券撬动点击',
            '平台补贴金额', '补贴引导成交金额', '发券补贴商品个数', '补贴引导成交人数'
        ];
        return numKeywords.includes(col);
    },
    // utils.js - 修改后的 guessColumnType
    guessColumnType(col, data) {
        // 日期列按文本处理，不再返回 'date' 类型
        let numCount = 0, totalCount = 0;
        for (let i = 0; i < Math.min(data.length, 20); i++) {
            const val = data[i]?.[col];
            if (val !== undefined && val !== null && val !== '') {
                totalCount++;
                if (!isNaN(parseFloat(val))) numCount++;
            }
        }
        if (totalCount > 0 && numCount / totalCount > 0.5) return 'number';
        return 'text';
    },
    // 本地存储辅助
    loadData(key) {
        try {
            const saved = localStorage.getItem(key);
            if (saved) return JSON.parse(saved);
        } catch (_) { }
        return null;
    },
    saveData(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { }
    }
};

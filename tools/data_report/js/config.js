// ================================================================
// 1. 配置模块 (config.js)
// ================================================================
const CONFIG = {
    RAW_DATA_KEY: 'data_tool_raw_data',
    HIDDEN_COLS: new Set(['原二级场景ID', '原二级场景名字', '计划ID', '主体ID', '主体类型']),
    DEFAULT_SHOWN_COLS: new Set(['场景名字', '计划名字', '主体名称', '花费', '投入产出比', '加购成本', '平均点击花费',
        '点击率'
    ]),
    STORAGE_KEY: 'data_tool_column_settings',
    COL_WIDTH_KEY: 'data_tool_col_widths',
    COL_ORDER_KEY: 'data_tool_col_order',
    FILTER_STATE_KEY: 'data_tool_filters',
    PAGE_SIZE_KEY: 'data_tool_page_size',
    SORT_STATE_KEY: 'data_tool_sort_state',
    PERCENTAGE_COLS: new Set([
        '点击率', '加购率', '宝贝收藏率', '点击转化率', '入会率', '引导访问潜客占比',
        '宝贝收藏率', '收藏率', '加购率', '点击转化率'
    ]),
    MERGE_COLS: ['计划名字', '场景名字'], // 需要合并的列（以计划名字为基准）
    CENTER_EXCLUDE: ['场景名字', '计划名字', '主体名称'] // 不居中的列
};

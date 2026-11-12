/*
 * 边界猎手 (SimplifyBoundary) SVIP 解锁 + 去广告
 * 域名：litebhapi.belugabh.com
 *
 * 去广告 / 弹窗：
 *   /center-bh-pro-biz-core/ad/selectData                 开屏、弹窗、浮窗、信息流卡片、横幅、文字广播
 *   /center-bh-pro-manage-core/ads/getAvailableQuestionnaire  问卷广告
 *   /center-bh-pro-biz-core/ad/sdKqhx                    购买 SVIP 促销横幅 / 次数用尽提示
 *   /center-bh-pro-biz-core/activity/selectPopNewPeopleList   新人付费弹窗
 *   /center-bh-pro-biz-core/activity/indexActivity       活动弹窗开关
 *   /center-bh-pro-user-core/dataUpdateRecord/todayPageNotice 今日通知弹窗
 *   /center-bh-pro-manage-core/goldenEntry/appList        "开通会员"入口
 *   /center-bh-pro-biz-core/wallet/getPortraitGoodsByUserLevel 商品定价(仅 UI)
 *
 * 次数 / 会员状态：
 *   /center-bh-pro-biz-core/map/bh/dsqRangeNum
 *   /center-bh-pro-poi-core/data/dataMapSearchNum
 *   /center-bh-pro-biz-core/svip/getUserVipMessage
 *   /center-bh-pro-biz-core/svip/getSVipPicture
 *   /center-bh-pro-biz-core/svip/personalCenterMy
 *   /personal_center/user_equity_status_list
 */

const SVIP_ICON = "https://qiniu.belugabh.com/icon_svip_card_new.png";
const EXPIRE_TIME = "2099-12-31 23:59:59";
const DAYS = "9999";
const BIG = 9999;

const url = $request.url;

// 统一输出：删掉 Content-Length / Content-Encoding，避免 body 改写后变长被截断
const finish = (obj) => {
    const raw = $response.headers;
    if (raw && Object.keys(raw).length) {
        const headers = Object.assign({}, raw);
        Object.keys(headers).forEach(k => {
            const lk = k.toLowerCase();
            if (lk === 'content-length' || lk === 'content-encoding') delete headers[k];
        });
        $done({ body: JSON.stringify(obj), headers: headers });
    } else {
        $done({ body: JSON.stringify(obj) });
    }
};

try {
    let body = JSON.parse($response.body);
    const data = body.data;

    // ============ 1. 去广告 / 弹窗 ============

    // 首页广告位（响应 data 为数组，每个元素含 13 个 ad* 字段）
    if (url.includes('/ad/selectData')) {
        body.data = [];
        console.log('[边界SVIP] 清空广告位 selectData');
        finish(body); return;
    }

    // 问卷广告
    if (url.includes('/ads/getAvailableQuestionnaire')) {
        body.data = {};
        console.log('[边界SVIP] 清空问卷广告');
        finish(body); return;
    }

    // 新人付费弹窗
    if (url.includes('/activity/selectPopNewPeopleList')) {
        if (data) { data.productList = []; data.exampleLink = ""; }
        finish(body); return;
    }

    // 活动弹窗开关保持关闭
    if (url.includes('/activity/indexActivity')) {
        if (data) data.activitySwitch = "0";
        finish(body); return;
    }

    // 今日通知弹窗
    if (url.includes('/todayPageNotice')) {
        if (data) data.content = "";
        finish(body); return;
    }

    // 首页金刚区里的"开通会员"入口
    if (url.includes('/goldenEntry/appList') && Array.isArray(data)) {
        body.data = data.filter(item => !/vip|svip|member/i.test(item.enterKey || ''));
        finish(body); return;
    }

    // 报告商品定价（仅影响展示，服务端支付不受影响）
    if (url.includes('/wallet/getPortraitGoodsByUserLevel') && data) {
        Object.keys(data).forEach(k => {
            const goods = data[k];
            if (goods && typeof goods === 'object') { goods.price = "0"; goods.oldPrice = "0"; }
        });
        finish(body); return;
    }

    // "购买 SVIP 送 N 次" 促销横幅 + 非会员次数用尽提示图
    if (url.includes('/ad/sdKqhx') && data) {
        data.vipInUseStatus = "5";
        data.remainingNum = BIG;
        data.areaText = "SVIP 会员权益";
        data.spanImg = "";
        data.spanImgJump = "0";
        finish(body); return;
    }

    // ============ 2. 次数 / 会员状态 ============

    // 商圈范围查询次数
    if (url.includes('/map/bh/dsqRangeNum') && data) {
        data.isMember = 1;
        data.surplusNum = BIG;
        data.vipNumText = "SVIP 不限次";
        data.vipNumTextHighlight = String(BIG);
        finish(body); return;
    }

    // 数据地图搜索次数
    if (url.includes('/data/dataMapSearchNum') && data) {
        data.isMember = "1";
        data.surplusNum = BIG;
        finish(body); return;
    }

    // 图标只改文案与图片，保留服务端原有的 code（客户端可能按 code 取本地资源）
    const markIcon = (icon) => {
        if (!Array.isArray(icon)) return;
        icon.forEach(it => {
            if (!it || typeof it !== 'object') return;
            it.name = "SVIP会员";
            it.url = SVIP_ICON;
            it.backImg = SVIP_ICON;
        });
    };

    // 会员信息
    if (url.includes('/svip/getUserVipMessage') && data) {
        data.days = DAYS;
        data.expireTime = EXPIRE_TIME;
        data.vipInUseStatus = "5";
        data.isEnterprise = 0;
        data.nonEnterpriseH5Url = "0";
        markIcon(data.icon);
        finish(body); return;
    }

    // 会员图片 / banner
    if (url.includes('/svip/getSVipPicture') && data) {
        data.expireTime = EXPIRE_TIME;
        data.vipInUseStatus = "5";
        markIcon(data.icon);
        finish(body); return;
    }

    // 个人中心
    if (url.includes('/svip/personalCenterMy') && data) {
        data.vipInUseStatus = "5";
        data.expireTime = EXPIRE_TIME;
        data.days = DAYS;
        data.rightsNum = BIG;
        if (data.svipInfo) { data.svipInfo.rightsNum = BIG; data.svipInfo.leftIcon = SVIP_ICON; }
        if (data.vipInfo)  { data.vipInfo.rightsNum = BIG;  data.vipInfo.leftIcon = SVIP_ICON; }
        markIcon(data.icon);   // 该接口 icon 实际是空字符串，markIcon 会安全跳过
        finish(body); return;
    }

    // 权益次数列表（字段均以抓包实际存在的为准，保持原类型）
    if (url.includes('/personal_center/user_equity_status_list') && data) {
        data.is_vip = true;
        data.vip_in_use_status = "5";
        data.vip_logo = SVIP_ICON;
        data.poi_open = true;

        const strFields = [
            "current_month_pdf_can_use_times", "current_month_poi_can_use_times",
            "eight_palaces_permissions_times", "role_15",
            "basic_report_limit_minutes_remaining", "basic_report_limit_seconds_remaining",
            "judge_crowd_portrait_discount", "ai_site_selection_recommend_times"
        ];
        strFields.forEach(k => { if (k in data) data[k] = "999999"; });

        const intFields = [
            "survey_export_times", "role_20", "crowd_portraits_remaining_times",
            "compare_pk_times", "survey_export_old_app_pay_times",
            "community_survey_times", "hotel_export_times"
        ];
        intFields.forEach(k => { if (k in data) data[k] = BIG; });

        finish(body); return;
    }

    // 其他接口原样返回
    finish(body);
} catch (e) {
    console.log('[边界SVIP] 解析失败，原样返回: ' + e);
    $done({});
}

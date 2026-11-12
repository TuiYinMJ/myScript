/*
 * 边界猎手 (SimplifyBoundary) SVIP 解锁
 * 匹配域名：litebhapi.belugabh.com
 * 修改接口：
 *   /center-bh-pro-biz-core/svip/getUserVipMessage
 *   /center-bh-pro-biz-core/svip/getSVipPicture
 *   /center-bh-pro-biz-core/svip/personalCenterMy
 *   /personal_center/user_equity_status_list
 */

try {
    let body = JSON.parse($response.body);
    const url = $request.url;

    // 统一的 SVIP 图标和名称
    const SVIP_ICON = "https://qiniu.belugabh.com/icon_svip_card_new.png";
    const SVIP_LOGO = "https://qiniu.belugabh.com/vip_icon/250514_SVIP_KAITONG.png"; // 如果不存在，可换成已有的 SVIP 图标
    const SVIP_NAME = "SVIP会员";
    const SVIP_CODE = "SVIP";
    const EXPIRE_TIME = "2099-12-31 23:59:59";
    const DAYS = "9999";

    // 1. getUserVipMessage
    if (url.includes('/center-bh-pro-biz-core/svip/getUserVipMessage')) {
        if (body.data) {
            body.data.days = DAYS;
            body.data.expireTime = EXPIRE_TIME;
            body.data.vipInUseStatus = "5";
            body.data.isEnterprise = 0;
            body.data.nonEnterpriseH5Url = "0";
            if (Array.isArray(body.data.icon)) {
                body.data.icon = [{
                    backImg: SVIP_ICON,
                    bizType: 0,
                    code: SVIP_CODE,
                    iconNo: "",
                    name: SVIP_NAME,
                    smallIcon: "",
                    url: SVIP_LOGO
                }];
            }
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // 2. getSVipPicture
    if (url.includes('/center-bh-pro-biz-core/svip/getSVipPicture')) {
        if (body.data) {
            body.data.expireTime = EXPIRE_TIME;
            body.data.vipInUseStatus = "5";
            if (Array.isArray(body.data.icon)) {
                body.data.icon = [{
                    backImg: SVIP_ICON,
                    bizType: 0,
                    code: SVIP_CODE,
                    iconNo: "",
                    name: SVIP_NAME,
                    smallIcon: "",
                    url: SVIP_LOGO
                }];
            }
            // banner 可以保留原样或替换，这里保留
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // 3. personalCenterMy
    if (url.includes('/center-bh-pro-biz-core/svip/personalCenterMy')) {
        if (body.data) {
            body.data.vipInUseStatus = "5";
            body.data.expireTime = EXPIRE_TIME;
            body.data.days = DAYS;
            // 增强 svipInfo / vipInfo 的权益数量
            if (body.data.svipInfo) {
                body.data.svipInfo.rightsNum = 999;
            }
            if (body.data.vipInfo) {
                body.data.vipInfo.rightsNum = 999;
            }
            // 把 vipInfo / svipInfo 的图标也换成 SVIP
            if (body.data.svipInfo) {
                body.data.svipInfo.leftIcon = SVIP_ICON;
            }
            if (body.data.vipInfo) {
                body.data.vipInfo.leftIcon = SVIP_ICON;
            }
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // 4. user_equity_status_list
    if (url.includes('/personal_center/user_equity_status_list')) {
        if (body.data) {
            body.data.is_vip = true;
            body.data.vip_in_use_status = "5";
            body.data.vip_logo = SVIP_LOGO;
            // 各项权益次数拉满
            body.data.current_month_pdf_can_use_times = "999";
            body.data.survey_export_times = 999;
            body.data.current_month_poi_can_use_times = "999";
            body.data.role_20 = 999;
            body.data.crowd_portraits_remaining_times = 999;
            body.data.compare_pk_times = 999;
            body.data.poi_open = true;
            body.data.survey_export_old_app_pay_times = 999;
            body.data.eight_palaces_permissions_times = "999";
            body.data.role_15 = "999";
            body.data.basic_report_limit_minutes_remaining = "999999";
            body.data.basic_report_limit_seconds_remaining = "999999";
            body.data.judge_crowd_portrait_discount = "999";
            body.data.ai_site_selection_recommend_times = "999";
            body.data.community_survey_times = 999;
            body.data.hotel_export_times = 999;
            // 如果有其他次数字段，也可以按需添加
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // 其他接口原样返回
    $done({ body: JSON.stringify(body) });
} catch (e) {
    // 出错时不做修改，避免影响正常使用
    $done({});
}
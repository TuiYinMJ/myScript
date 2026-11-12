/*
 * 玄易（app.ixybz.com）去广告 + 会员解锁
 *
 * 去广告：
 *   /app/v1/banner/get               首页 Banner 列表清空
 *   /app/v1/config/get/advposition   广告位配置置空
 *
 * 会员：
 *   /app/v1/user/info                member/pay 置 true，补齐会员等级与到期时间
 *   其他 JSON 接口                     递归兜底，把常见会员布尔/等级/到期字段改为会员状态
 */

let body;
let url = $request.url;
let ct = $response.headers["Content-Type"] || $response.headers["content-type"] || "";

if (!ct.includes("application/json")) {
    $done({});
} else {
    try {
        body = JSON.parse($response.body);
    } catch (e) {
        $done({});
    }

    // 一、去广告
    if (url.includes("/app/v1/banner/get")) {
        if (body && body.data) {
            if (Array.isArray(body.data)) body.data = [];
            else if (body.data.list) body.data.list = [];
        }
    }
    if (url.includes("/app/v1/config/get/advposition")) {
        if (body && body.data) {
            body.data = {};
        }
    }

    // 二、用户信息：精准改 VIP 字段
    if (url.includes("/app/v1/user/info") && body && body.data && typeof body.data === "object") {
        const d = body.data;
        d.member = true;
        d.pay = true;
        if (d.memberLevel === null || d.memberLevel === undefined || d.memberLevel === 0) {
            d.memberLevel = 1;
        }
        if (!d.memberLevelName) {
            d.memberLevelName = "年卡会员";
        }
        if (!d.expireTime || d.expireTime < "2099-01-01") {
            d.expireTime = "2099-12-31T23:59:59.000Z";
        }
    }

    // 三、通用兜底
    if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
        forceVip(body.data);
    }
    forceVip(body);

    $done({ body: JSON.stringify(body) });
}

function forceVip(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

    const boolKeys = [
        "member", "pay", "is_member", "isMember", "is_vip", "isVip", "vip",
        "is_svip", "isSvip", "is_pay", "isPay", "is_forever_vip", "isForeverVip"
    ];
    for (const k of boolKeys) {
        if (k in obj) obj[k] = true;
    }

    const numKeys = [
        "memberLevel", "member_level", "vipLevel", "vip_level",
        "memberType", "member_type", "vipType", "vip_type"
    ];
    for (const k of numKeys) {
        if (k in obj && (obj[k] === null || obj[k] === 0 || obj[k] === "0")) {
            obj[k] = 1;
        }
    }

    const nameKeys = ["memberLevelName", "member_level_name", "vipName", "vip_name"];
    for (const k of nameKeys) {
        if (k in obj && !obj[k]) obj[k] = "年卡会员";
    }

    const expireKeys = [
        "expireTime", "vip_expired_at", "vipExpiredAt", "vip_expire_time",
        "member_expired_at", "memberExpiredAt", "expired_at", "expiredAt"
    ];
    const farFuture = "2099-12-31T23:59:59.000Z";
    for (const k of expireKeys) {
        if (k in obj) obj[k] = farFuture;
    }

    for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (v && typeof v === "object" && !Array.isArray(v)) forceVip(v);
    }
}
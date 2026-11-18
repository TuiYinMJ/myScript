/*
 * Pingo 解锁：请求侧直接返回伪造响应
 *
 * 比 response 改写可靠得多：
 *  - 不发真实请求，不存在 304 / If-None-Match 拿不到 body 的问题
 *  - 不受服务端 gzip、ETag、CDN 缓存影响
 *  - Superwall SDK 每次冷启动都会拉 entitlements，直接给它一个 active 的结果
 *
 * 覆盖两条链路：
 *  1) i.pingo.ai/user/entitlement  -> {"isPro":true,...}
 *  2) subscriptions-api.superwall.com/.../entitlements -> customerInfo.entitlements[pro].isActive=true
 *
 * Superwall 解码模型要点（SDK 4.16 源码）：
 *  - EntitlementsResponse 只解码 customerInfo，顶层 entitlements 可选
 *  - subscriptionsApi 解码器：日期用毫秒时间戳；ProductStore 是 Int（1=stripe）
 *  - customerInfo.subscriptions 元素字段全部必填，所以这里直接给空数组最安全
 */

var url = ($request && $request.url) ? $request.url : "";
var BIG = 999999;
var EXPIRE_MS = 4102444800000; // 2100-01-01

function reply(obj) {
    $done({
        response: {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(obj)
        }
    });
}

if (/i\.pingo\.ai\/user\/entitlement/i.test(url)) {
    console.log("[PingoPro] 直接返回 isPro=true");
    reply({
        isPro: true,
        freeRemaining: { conversations: BIG, vocabPractice: BIG }
    });
} else if (/subscriptions-api\.superwall\.com\/subscriptions-api\/public\/v1\/users\/[^\/]+\/entitlements/i.test(url)) {
    console.log("[PingoPro] 直接返回 pro active");
    reply({
        entitlements: [{ identifier: "pro", type: "SERVICE_LEVEL" }],
        customerInfo: {
            subscriptions: [],
            nonSubscriptions: [],
            entitlements: [{
                identifier: "pro",
                type: "SERVICE_LEVEL",
                isActive: true,
                productIds: ["com.picoai.subscription.yearly"],
                latestProductId: "com.picoai.subscription.yearly",
                store: 1,
                startsAt: Date.now(),
                expiresAt: EXPIRE_MS,
                isLifetime: false,
                willRenew: true,
                state: "subscribed"
            }],
            isPlaceholder: false
        }
    });
} else if (/api\.superwall\.me\/api\/v1\/static_config/i.test(url)) {
    // static_config 不能直返（体积大且含产品/付费墙定义），只删条件头让服务器回 200，
    // 再由 pingo-vip.js 把 trigger 规则改成不匹配
    var headers = ($request && $request.headers) ? $request.headers : {};
    delete headers["If-None-Match"];
    delete headers["If-Modified-Since"];
    headers["Cache-Control"] = "no-cache";
    console.log("[PingoPro] static_config 去缓存");
    $done({ headers: headers });
} else {
    $done({});
}

/*
 * Pingo AI (i.pingo.ai) 解锁 Pro 会员
 *
 * 一共两条判定链，必须同时处理：
 *
 * A. Pingo 自有接口（UI 的 isPro 来源）
 *    GET https://i.pingo.ai/user/entitlement
 *    真实响应：{"isPro":false,"freeRemaining":{"conversations":0,"vocabPractice":1}}
 *    -> isPro 决定 App 内是否显示会员/免费额度
 *    -> 该接口带 ETag，客户端会发 If-None-Match 拿到 304，必须在请求侧
 *       删掉条件头（见 pingo-request.js），否则响应脚本拿不到 body
 *
 * B. Superwall 权益接口（付费墙触发器来源）
 *    GET https://subscriptions-api.superwall.com/.../users/{id}/entitlements
 *    付费墙规则全部是 size(device.activeEntitlements) == 0 才展示，
 *    所以要把 customerInfo.entitlements[].isActive 置为 true。
 *
 *    依据 Superwall iOS SDK 4.16 源码：
 *    - EntitlementsResponse 只解码 customerInfo，顶层 entitlements 和
 *      entitlementsToken 不参与判定
 *    - subscriptionsApi 解码器：date 只接受毫秒时间戳或
 *      "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX"；ProductStore 是 Int 枚举
 *      (0=appStore 1=stripe ...)
 *    - customerInfo.subscriptions 元素 SubscriptionTransaction 的
 *      transactionId/productId/purchaseDate/willRenew/isRevoked/
 *      isInGracePeriod/isInBillingRetryPeriod/isActive/store 全部必填，
 *      缺一个就会让整个 customerInfo 解码失败、响应被丢弃
 *
 *    因此绝对不动 subscriptions / nonSubscriptions，只改 entitlements。
 */

var TAG = "[PingoPro]";

var ONE_HUNDRED_YEARS_MS = 4102444800000; // 2100-01-01T00:00:00Z
var STORE_STRIPE = 1;                     // ProductStore.stripe
var BIG = 999999;

function finish(body) {
    var raw = $response.headers || {};
    var headers = {}, k;
    for (k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        var lk = k.toLowerCase();
        if (lk === "content-length" || lk === "content-encoding") continue;
        headers[k] = raw[k];
    }
    var text = JSON.stringify(body);
    if (Object.keys(headers).length) $done({ body: text, headers: headers });
    else $done({ body: text });
}

function buildPro(source) {
    var pids = source && Array.isArray(source.productIds) ? source.productIds : [];
    return {
        identifier: "pro",
        type: "SERVICE_LEVEL",
        isActive: true,
        productIds: pids,
        latestProductId: pids.length ? pids[0] : "com.picoai.subscription.yearly",
        store: STORE_STRIPE,
        startsAt: Date.now(),
        expiresAt: ONE_HUNDRED_YEARS_MS,
        isLifetime: false,
        willRenew: true,
        state: "subscribed"
    };
}

function rewritePingoEntitlement(body) {
    body.isPro = true;
    if (!body.freeRemaining || typeof body.freeRemaining !== "object") {
        body.freeRemaining = {};
    }
    body.freeRemaining.conversations = BIG;
    body.freeRemaining.vocabPractice = BIG;
    return body;
}

function rewriteSuperwall(body) {
    var ci = body.customerInfo;
    if (!ci || !Array.isArray(ci.entitlements)) return null;

    var found = false;
    var next = [];
    for (var i = 0; i < ci.entitlements.length; i++) {
        var e = ci.entitlements[i];
        if (e && typeof e === "object" && (e.identifier === "pro" || e.id === "pro")) {
            found = true;
            next.push(buildPro(e));
        } else {
            next.push(e);
        }
    }
    if (!found) next.push(buildPro(null));
    ci.entitlements = next;

    // SDK 不解析顶层字段，保持语义一致即可
    body.entitlements = [{ identifier: "pro", type: "SERVICE_LEVEL" }];
    return body;
}

try {
    var body = JSON.parse($response.body);
    var url = $request && $request.url ? $request.url : "";

    if (/api\.superwall\.me\/api\/v1\/static_config/i.test(url)) {
        // 兜底：所有 placement 的规则表达式置为 false，任何付费墙触发器都不匹配
        if (Array.isArray(body.trigger_options)) {
            for (var ti = 0; ti < body.trigger_options.length; ti++) {
                var tr = body.trigger_options[ti];
                if (!tr || !Array.isArray(tr.rules)) continue;
                for (var ri = 0; ri < tr.rules.length; ri++) {
                    var rule = tr.rules[ri];
                    if (!rule) continue;
                    rule.expression = "false";
                    rule.expression_cel = "false";
                }
            }
        }
        console.log(TAG + " static_config triggers -> false");
        finish(body);
    } else if (/i\.pingo\.ai\/user\/entitlement/i.test(url)) {
        body = rewritePingoEntitlement(body);
        console.log(TAG + " /user/entitlement isPro -> true");
    } else {
        body = rewriteSuperwall(body) || body;
        console.log(TAG + " superwall pro -> active");
    }

    finish(body);
} catch (err) {
    console.log(TAG + " 解析失败，原样返回: " + err);
    $done({});
}

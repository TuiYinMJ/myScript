/*
 * Pingo AI (i.pingo.ai) 解锁 Pro 会员 —— 单条 Response Script
 *
 * 写法对齐 hund / duolingo（已验证可用）：
 *   1) [Rewrite] 删 If-None-Match / If-Modified-Since，避免 304 拿不到 body
 *   2) 单条 Response Script，按 host+path 分派，覆盖全部 i.pingo.ai API
 *   3) 未知接口用高置信度字段兜底（isPro / is_pro / isVip ...）
 *   4) 响应加 X-Pingo-Patched: 1，抓包或日志一眼确认脚本是否执行
 *
 * 三条链路：
 *   A. i.pingo.ai/user/entitlement
 *      真实响应：{"isPro":false,"freeRemaining":{"conversations":0,"vocabPractice":1}}
 *      -> isPro=true，freeRemaining 数值拉满
 *
 *   B. subscriptions-api.superwall.com/.../users/{id}/entitlements
 *      Superwall SDK 4.16 源码：EntitlementsResponse 只解码 customerInfo；
 *      subscriptionsApi 解码器日期用毫秒时间戳、ProductStore 是 Int(1=stripe)；
 *      customerInfo.subscriptions 元素字段全部必填，所以保持空数组最安全。
 *      -> customerInfo.entitlements[pro].isActive=true
 *
 *   C. api.superwall.me/api/v1/static_config
 *      付费墙触发器规则全部是 size(device.activeEntitlements)==0；
 *      把 122 条 rule 的 expression / expression_cel 全改成 "false"，
 *      从源头让任何 placement 都不再弹付费墙。
 */

var TAG = "[PingoPro]";
var BIG = 999999;
var EXPIRE_MS = 4102444800000; // 2100-01-01
var STORE_STRIPE = 1;

function finish(body) {
    var raw = $response.headers || {};
    var headers = {}, k;
    for (k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        var lk = k.toLowerCase();
        if (lk === "content-length" || lk === "content-encoding") continue;
        headers[k] = raw[k];
    }
    headers["Cache-Control"] = "no-store";
    headers["X-Pingo-Patched"] = "1";
    $done({ body: JSON.stringify(body), headers: headers });
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
        expiresAt: EXPIRE_MS,
        isLifetime: false,
        willRenew: true,
        state: "subscribed"
    };
}

// 未知接口兜底：递归把所有会员标记改成 true，把所有 freeRemaining 数值拉满
function deepPro(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) deepPro(obj[i]);
        return;
    }
    for (var k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var v = obj[k];
        if (/^is_?(pro|vip|premium|subscribed|member)$/i.test(k)) {
            obj[k] = true;
        } else if (/^free_?remaining$/i.test(k) && v && typeof v === "object") {
            for (var fk in v) {
                if (Object.prototype.hasOwnProperty.call(v, fk) && typeof v[fk] === "number") {
                    v[fk] = BIG;
                }
            }
        } else if (v && typeof v === "object") {
            deepPro(v);
        }
    }
}

function rewriteSuperwall(body) {
    var ci = body.customerInfo;
    if (!ci || !Array.isArray(ci.entitlements)) return false;

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

    // SDK 不解析顶层字段，补上保持语义一致
    body.entitlements = [{ identifier: "pro", type: "SERVICE_LEVEL" }];
    return true;
}

function disablePaywallTriggers(body) {
    if (!Array.isArray(body.trigger_options)) return 0;
    var n = 0;
    for (var ti = 0; ti < body.trigger_options.length; ti++) {
        var tr = body.trigger_options[ti];
        if (!tr || !Array.isArray(tr.rules)) continue;
        for (var ri = 0; ri < tr.rules.length; ri++) {
            var rule = tr.rules[ri];
            if (!rule) continue;
            rule.expression = "false";
            rule.expression_cel = "false";
            n++;
        }
    }
    return n;
}

try {
    var url = ($request && $request.url) ? $request.url : "";
    var body = JSON.parse($response.body);

    if (/api\.superwall\.me\/api\/v1\/static_config/i.test(url)) {
        var count = disablePaywallTriggers(body);
        console.log(TAG + " static_config triggers -> false, rules=" + count);
        finish(body);
    } else if (/subscriptions-api\.superwall\.com\/subscriptions-api\/public\/v1\/users\/[^\/]+\/entitlements/i.test(url)) {
        rewriteSuperwall(body);
        console.log(TAG + " superwall pro -> active");
        finish(body);
    } else {
        // i.pingo.ai 全部 API：先做通用兜底，再针对 entitlement 精确补齐
        deepPro(body);
        if (/\/user\/entitlement/i.test(url)) {
            body.isPro = true;
            if (!body.freeRemaining || typeof body.freeRemaining !== "object") {
                body.freeRemaining = {};
            }
            body.freeRemaining.conversations = BIG;
            body.freeRemaining.vocabPractice = BIG;
            console.log(TAG + " /user/entitlement isPro -> true");
        } else {
            console.log(TAG + " " + url.split("?")[0] + " 通用会员字段兜底");
        }
        finish(body);
    }
} catch (err) {
    console.log(TAG + " 解析失败，原样返回: " + err);
    $done({});
}

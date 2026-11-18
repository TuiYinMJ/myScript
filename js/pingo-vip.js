/*
 * Pingo AI (i.pingo.ai) 解锁 Pro / SVIP 会员身份
 *
 * 判定链路（来自 ProxyPin 抓包 + Superwall SDK 规范）：
 *   GET https://subscriptions-api.superwall.com/subscriptions-api/public/v1/users/{userId}/entitlements
 *   -> 顶层 entitlements 数组决定 device.activeEntitlements（触发器规则：device.activeEntitlements.contains("pro")）
 *   -> customerInfo.entitlements[].isActive 决定付费墙是否展示
 *   -> entitlementsToken 是 Superwall 签发的 JWT，payload 中的 entitlements 也会随状态下发
 *
 * 原始响应（未订阅）：
 *   { "entitlements": [], "customerInfo": { "entitlements": [ { "identifier": "pro", "isActive": false, ... } ] } }
 *
 * 本脚本把上述三处全部改写为「pro 已激活」，使客户端认为用户拥有 pro 权益。
 */

var TAG = "[PingoPro]";

// 与 Superwall 官方响应格式一致：entitlements 为 {identifier, type} 对象数组
var ACTIVE_PRO = { identifier: "pro", type: "SERVICE_LEVEL" };

// ---------------------------------------------------------------------------
// 纯 JS base64url（loon 的 JS 引擎没有 Buffer / btoa，必须自己实现）
// ---------------------------------------------------------------------------
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function utf8ToBin(str) {
    return unescape(encodeURIComponent(str));
}
function binToUtf8(bin) {
    return decodeURIComponent(escape(bin));
}
function base64Encode(str) {
    var s = utf8ToBin(str), out = "", i, c1, c2, c3;
    for (i = 0; i < s.length; i += 3) {
        c1 = s.charCodeAt(i);
        c2 = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
        c3 = i + 2 < s.length ? s.charCodeAt(i + 2) : -1;
        out += B64.charAt(c1 >> 2);
        out += B64.charAt(((c1 & 3) << 4) | (c2 >= 0 ? (c2 >> 4) : 0));
        out += c2 >= 0 ? B64.charAt(((c2 & 15) << 2) | (c3 >= 0 ? (c3 >> 6) : 0)) : "=";
        out += c3 >= 0 ? B64.charAt(c3 & 63) : "=";
    }
    return out;
}
function base64Decode(str) {
    var s = String(str).replace(/=+$/, ""), out = "", i, c1, c2, c3, c4;
    for (i = 0; i < s.length; i += 4) {
        c1 = B64.indexOf(s.charAt(i));
        c2 = B64.indexOf(s.charAt(i + 1));
        c3 = i + 2 < s.length ? B64.indexOf(s.charAt(i + 2)) : -1;
        c4 = i + 3 < s.length ? B64.indexOf(s.charAt(i + 3)) : -1;
        out += String.fromCharCode((c1 << 2) | (c2 >> 4));
        if (c3 >= 0) out += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
        if (c4 >= 0) out += String.fromCharCode(((c3 & 3) << 6) | c4);
    }
    return out;
}
function b64urlEncode(str) {
    return base64Encode(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return binToUtf8(base64Decode(s));
}

// 重建 entitlementsToken：只改 payload 中的 entitlements，保留头部与签名
function activateToken(token) {
    try {
        if (typeof token !== "string" || token.split(".").length !== 3) return token;
        var parts = token.split(".");
        var payload = JSON.parse(b64urlDecode(parts[1]));
        payload.entitlements = [{ identifier: "pro", type: "SERVICE_LEVEL" }];
        parts[1] = b64urlEncode(JSON.stringify(payload));
        return parts.join(".");
    } catch (e) {
        console.log(TAG + " token 重建失败，保留原值: " + e);
        return token;
    }
}

// 删除会影响 body 改写的响应头（长度/编码），避免客户端按旧长度截断
function finish(body) {
    var raw = $response.headers || {};
    var headers = {}, k, lk;
    for (k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        lk = k.toLowerCase();
        if (lk === "content-length" || lk === "content-encoding") continue;
        headers[k] = raw[k];
    }
    var text = JSON.stringify(body);
    if (Object.keys(headers).length) $done({ body: text, headers: headers });
    else $done({ body: text });
}

// ---------------------------------------------------------------------------
try {
    var body = JSON.parse($response.body);

    // 1) 顶层 entitlements -> device.activeEntitlements（付费墙触发器读这里）
    body.entitlements = [ACTIVE_PRO];

    // 2) customerInfo.entitlements -> 把 pro 置为激活
    var ci = body.customerInfo || (body.customerInfo = {});
    var ents = ci.entitlements;
    if (!Array.isArray(ents) || ents.length === 0) {
        ents = [{
            identifier: "pro",
            type: "SERVICE_LEVEL",
            isActive: true,
            isLifetime: false,
            willRenew: true,
            productIds: []
        }];
    } else {
        for (var i = 0; i < ents.length; i++) {
            var e = ents[i];
            if (e && (e.identifier === "pro" || e.id === "pro" || i === 0)) {
                e.identifier = "pro";
                e.type = e.type || "SERVICE_LEVEL";
                e.isActive = true;
                e.willRenew = true;
                e.isLifetime = true;
            }
        }
    }
    ci.entitlements = ents;

    // 3) 构造一条已激活订阅记录，增强可信度（RevenueCat / Superwall 格式）
    if (!Array.isArray(ci.subscriptions) || ci.subscriptions.length === 0) {
        var now = new Date();
        var exp = new Date(now.getTime() + 100 * 365 * 24 * 3600 * 1000);
        ci.subscriptions = [{
            identifier: "com.picoai.subscription.yearly",
            productIdentifier: "com.picoai.subscription.yearly",
            isActive: true,
            isLifetime: true,
            willRenew: true,
            periodType: "NORMAL",
            store: "APP_STORE",
            latestPurchaseDate: now.toISOString(),
            originalPurchaseDate: now.toISOString(),
            expirationDate: exp.toISOString()
        }];
    }

    // 4) 重建签发的 token payload
    if (body.entitlementsToken) {
        body.entitlementsToken = activateToken(body.entitlementsToken);
    }

    console.log(TAG + " Pro 已激活");
    finish(body);
} catch (err) {
    console.log(TAG + " 解析失败，原样返回: " + err);
    $done({});
}

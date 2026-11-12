/*
 * 微信读书 去推广 + 付费章节标识伪装
 * 去广告配置依据 微信读书.har（10.2.3.94）抓包整理；
 * 付费章节规则参考公开脚本，HAR 中未包含阅读请求，实际效果需自行验证。
 *
 * 去广告 / 推广：
 *   i.weread.qq.com/feature      删除看广告领福利相关配置
 *   i.weread.qq.com/mobileSync   同上（configsets）
 *   涉及字段：get_vip_reward_ad、normal_reward_ad、player_unlock_track_ad_config、
 *            read_duration_exchange_reward_ad、reader_full_page_reward_ad
 *
 * 付费章节：
 *   i.weread.qq.com/book/chapterInfos   把 price 置 0、paid 置 0
 *
 * 说明：微信读书会员状态接口 /pay/memberCardSummary 带服务端 signature，
 *      且书籍内容权限由服务端校验，本脚本只能伪装客户端章节标记，不保证真正解锁。
 */

const REWARD_AD_KEYS = [
    "get_vip_reward_ad",
    "normal_reward_ad",
    "player_unlock_track_ad_config",
    "read_duration_exchange_reward_ad",
    "reader_full_page_reward_ad"
];

// 删除 Content-Length / Content-Encoding，避免改写后的 body 被截断
const finish = (body) => {
    const raw = $response.headers || {};
    const headers = {};
    let hasHeader = false;
    Object.keys(raw).forEach((k) => {
        const lk = k.toLowerCase();
        if (lk !== "content-length" && lk !== "content-encoding") {
            headers[k] = raw[k];
            hasHeader = true;
        }
    });
    if (hasHeader) {
        $done({ body: body, headers: headers });
    } else {
        $done({ body: body });
    }
};

(() => {
    try {
        const url = $request.url;
        const path = (url.replace(/^https?:\/\/[^\/]+/i, "").split("?")[0] || "").toLowerCase();

        // ============ 付费章节标记 ============
        if (path.indexOf("/book/chapterinfos") !== -1) {
            let body = $response.body || "";
            body = body
                .replace(/"price"\s*:\s*[0-9]+(?:\.[0-9]+)?/g, '"price":0')
                .replace(/"paid"\s*:\s*[1-9][0-9]*/g, '"paid":0');
            finish(body);
            return;
        }

        // ============ 看广告领福利入口 ============
        if (path.endsWith("/feature") || path.endsWith("/mobilesync")) {
            const body = JSON.parse($response.body);
            const config = body.configsets || body.feature;
            if (config) {
                REWARD_AD_KEYS.forEach((key) => {
                    delete config[key];
                });
                config.reward_ad_muted_by_default = 1;
            }
            finish(JSON.stringify(body));
            return;
        }

        $done({});
    } catch (e) {
        console.log("[微信读书] 处理失败: " + e);
        $done({});
    }
})();

/*
 * 美柚 去广告 + 会员标识伪装
 * 适用版本：9.13.0（依据 美柚.har 抓包整理）
 *
 * 去广告 / 弹窗：
 *   ad.seeyouyima.com/v1/getad                      信息流/开屏广告，返回空数组
 *   ad.seeyouyima.com/pregetad                      预加载广告，返回空数组
 *   ad.seeyouyima.com/ad/positions                  广告位配置，返回空数组
 *   mgo.seeyouyima.com/dialog/popplan               弹窗计划，清空 list
 *   mgo.seeyouyima.com/v1/splash_config             小组件开屏广告开关，全部置 0
 *   mgo.seeyouyima.com/v1/survey                    满意度问卷弹窗，清空 survey_list
 *   tequan.seeyouyima.com/api/ad/window/getWindowsExcludeHomePage  浮窗推广，返回空数组
 *   tequan.seeyouyima.com/api/ad/source/edgeList    边角广告，置 null
 *   sub.seeyouyima.com/api/v3/top_popups            订阅弹窗，置空对象
 *   users.seeyouyima.com/v2/wo                      “我的”页面推广位，过滤 is_ad=1
 *
 * 会员标识：
 *   users.seeyouyima.com/me                         isvip 置 1（客户端会员标识）
 *   sub.seeyouyima.com/v3/sub/my_vip                隐藏会员推销卡片，改为“已开通”
 *
 * 说明：真正需要服务端授权的权益（如经期分析、付费方案）无法仅靠改响应解锁。
 */

const BIG_VIP_TIME = "2099-12-31 23:59:59";

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

const finishJSON = (obj) => finish(JSON.stringify(obj));

(() => {
    try {
        const url = $request.url;
        const host = ((url.match(/^https?:\/\/([^\/]+)/i) || [])[1] || "").toLowerCase();
        const path = (url.replace(/^https?:\/\/[^\/]+/i, "").split("?")[0] || "").toLowerCase();

        // ============ 广告下发 ============
        if (host === "ad.seeyouyima.com") {
            if (path.endsWith("/v1/getad") || path.endsWith("/pregetad") || path.endsWith("/ad/positions")) {
                console.log("[美柚] 清空广告: " + path);
                finishJSON([]);
                return;
            }
            $done({});
            return;
        }

        // ============ 弹窗 / 开屏 ============
        if (host === "mgo.seeyouyima.com") {
            if (path === "/dialog/popplan") {
                const body = JSON.parse($response.body);
                body.data = body.data || {};
                body.data.list = [];
                finishJSON(body);
                return;
            }

            if (path === "/v1/splash_config") {
                const body = JSON.parse($response.body);
                if (body.data && Array.isArray(body.data.widget_list)) {
                    body.data.widget_list.forEach((w) => {
                        w.show_splash_ad = 0;
                    });
                }
                finishJSON(body);
                return;
            }

            if (path === "/v1/survey") {
                const body = JSON.parse($response.body);
                if (body.data) body.data.survey_list = [];
                finishJSON(body);
                return;
            }

            $done({});
            return;
        }

        // ============ 会员 / 订阅 ============
        if (host === "sub.seeyouyima.com") {
            if (path === "/api/v3/top_popups") {
                const body = JSON.parse($response.body);
                body.data = {};
                finishJSON(body);
                return;
            }

            if (path === "/v3/sub/my_vip") {
                const body = JSON.parse($response.body);
                const data = body.data;
                if (data) {
                    data.is_vip = 1;
                    data.isvip = 1;
                    data.vip_expire_time = BIG_VIP_TIME;
                    data.vip_subtitle = "SVIP会员 · " + BIG_VIP_TIME + " 到期";
                    data.btn_text = "已开通";
                    data.btn_tag = "";
                    data.marketing_list = [];
                    data.left_marketing_list = [];
                    data.right_marketing_list = [];
                    data.notification_bars = [];
                }
                finishJSON(body);
                return;
            }

            $done({});
            return;
        }

        // ============ 浮窗 / 边角推广 ============
        if (host === "tequan.seeyouyima.com") {
            if (path === "/api/ad/window/getwindowsexcludehomepage") {
                const body = JSON.parse($response.body);
                body.data = [];
                finishJSON(body);
                return;
            }

            if (path === "/api/ad/source/edgelist") {
                const body = JSON.parse($response.body);
                body.data = null;
                finishJSON(body);
                return;
            }

            $done({});
            return;
        }

        // ============ 用户信息 / 我的页面 ============
        if (host === "users.seeyouyima.com") {
            if (path === "/me") {
                const body = JSON.parse($response.body);
                body.isvip = 1;
                body.is_vip = 1;
                body.vip_expire_time = BIG_VIP_TIME;
                finishJSON(body);
                return;
            }

            if (path === "/v2/wo") {
                const body = JSON.parse($response.body);
                const groups = body.data && body.data.items;
                if (Array.isArray(groups)) {
                    let changed = false;
                    body.data.items = groups.map((list) => {
                        if (!Array.isArray(list)) return list;
                        const filtered = list.filter((it) => !(it && Number(it.is_ad) === 1));
                        if (filtered.length !== list.length) changed = true;
                        return filtered;
                    });
                    if (changed) {
                        finishJSON(body);
                        return;
                    }
                }
                $done({});
                return;
            }

            $done({});
            return;
        }

        $done({});
    } catch (e) {
        console.log("[美柚] 处理失败: " + e);
        $done({});
    }
})();

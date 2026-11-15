/*
 * 混沌大学 user.hundun.cn/get_user_info —— 会员 / 学籍改写
 *
 * 抓包结论（ProxyPin 18:17 / 18:33 两份 HAR）：
 *   1. 响应头是 Content-Type: text/html; charset=UTF-8，但 body 实际是 JSON
 *      —— 不能按 Content-Type 过滤，否则脚本会被直接跳过
 *   2. 响应带 Content-Encoding: gzip、Content-Length、Etag: W/"..."
 *      —— 用 $done({body}) 改完必须同步清理这些头，否则客户端拿明文去 gunzip 会解析失败
 *   3. data 里决定 UI 的字段远不止几个布尔位：ss_* 系列时间、tip/button 文案、
 *      剩余天数等都是 0 / 1970 / "开通学籍"，只改 12 个字段页面看起来仍是未开通
 *   4. 插件已用 URL 正则限定匹配范围，脚本里不再做 $request.url 二次判断，
 *      避免 Loon 传入的 URL 形态差异导致静默放行
 */

const FAR_DATE = "2099-12-31";
const FAR_DATETIME = "2099-12-31 23:59:59";
const FAR_TS = 4102416000; // 远期 Unix 时间戳
const FAR_DAYS = 9999;

const body = $response.body;

if (typeof body !== "string") {
  console.log("[hund] body 非字符串（" + typeof body + "），放弃改写");
  $done({});
} else if (body.charCodeAt(0) === 0x1f && body.charCodeAt(1) === 0x8b) {
  // gzip magic：Loon 没解压就把二进制塞进来了，JSON.parse 必然失败
  console.log("[hund] body 仍是 gzip 二进制，放弃改写");
  $done({});
} else {
  let obj;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    console.log("[hund] JSON.parse 失败: " + e + " / 开头=" + body.slice(0, 80));
    $done({});
  }

  if (!obj || !obj.data || typeof obj.data !== "object") {
    console.log("[hund] 响应无 data 对象，放弃改写");
    $done({});
  } else {
    const d = obj.data;

    // 一、身份 / 购买标记（只改响应里真实存在的字段，不凭空造字段）
    [
      "is_sxy19_user", "purchased_yxs", "purchased_yxs_tgroup", "purchased_sxy19",
      "purchased_wlxy", "is_yxs_old_vip", "is_buy_sxy", "is_dhy_user",
      "is_cxy18_user", "tmp_is_ever_member"
    ].forEach(function (k) {
      if (k in d) d[k] = 1;
    });

    // 二、到期时间：日期 / 日期时间 / 时间戳三套字段都要改
    ["sxy19_expire_date", "sxy_expire_date", "yxs_expire_date"].forEach(function (k) {
      if (k in d) d[k] = FAR_DATE;
    });
    [
      "ss_sxy_expire_time", "ss_sxy19_expire_time", "ss_yxs_expire_time",
      "ss_cxy18_expire_time", "ss_sxy_join_time", "ss_yxs_join_time",
      "ss_cxy18_join_time"
    ].forEach(function (k) {
      if (k in d) d[k] = FAR_DATETIME;
    });
    ["dhy_expire_time", "expire_time", "dhy_join_time"].forEach(function (k) {
      if (k in d) d[k] = FAR_TS;
    });
    if ("dhy_left_days" in d) d.dhy_left_days = FAR_DAYS;
    if ("join_time" in d) d.join_time = FAR_TS;

    // 三、UI 文案：不改这些，页面仍会显示「开通学籍 / 点击入社」
    if ("yxs_tip_wording" in d) d.yxs_tip_wording = "已加入混沌研习社";
    if ("yxs_tip_button" in d) d.yxs_tip_button = "查看会员权益";
    if ("enroll_wording" in d) d.enroll_wording = "学籍有效";
    if ("expire_time_display" in d) d.expire_time_display = "会员有效至 " + FAR_DATE;
    if ("dhy_expire_time_display" in d) d.dhy_expire_time_display = "会员有效至 " + FAR_DATE;
    if ("super_expire_time_display" in d) d.super_expire_time_display = "会员有效至 " + FAR_DATE;
    if ("online_expire_time_display" in d) d.online_expire_time_display = "会员有效至 " + FAR_DATE;

    // 四、清理响应头：Loon 给出的是解压后的字符串，必须去掉压缩/长度/缓存声明
    const headers = {};
    Object.keys($response.headers || {}).forEach(function (k) {
      const lk = k.toLowerCase();
      if (["content-encoding", "content-length", "etag", "transfer-encoding", "content-type"].indexOf(lk) === -1) {
        headers[k] = $response.headers[k];
      }
    });
    headers["Content-Type"] = "application/json; charset=UTF-8";
    headers["Cache-Control"] = "no-store";

    console.log("[hund] 改写完成: purchased_yxs=" + d.purchased_yxs +
      ", is_dhy_user=" + d.is_dhy_user + ", sxy19_expire_date=" + d.sxy19_expire_date);
    $done({ body: JSON.stringify(obj), headers: headers });
  }
}

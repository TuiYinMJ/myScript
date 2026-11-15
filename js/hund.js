/*
 * 混沌大学 —— 会员改写统一脚本（单条 Loon Response Script，按 host + path 分派）
 *
 * 抓包依据：ProxyPin 18:17 / 18:33 / 18:57 / 19:00 四份 HAR
 *
 * 为什么要分派：
 *   - "开通在线会员" 的文案来自 user.hundun.cn/dhy/index 的 data.dhy_expire_desc，
 *     不是 get_user_info。只改 get_user_info，会员页永远显示「尚未开通在线会员」。
 *   - 会员状态散落在 user / capi / tools 三个域的多个接口，capi.hundun.cn 尤其容易漏掉。
 *   - Loon 3.5.1(983)+ 的 Response Script 是 first-match，一个请求只执行一条，
 *     所以插件里只留一条规则，由本脚本按 URL 精确分派。
 *
 * 设计取舍（最稳妥）：
 *   - 字段白名单 + 只改响应里已存在的键，不凭空造字段、不做暴力递归兜底，
 *     避免把前端改崩（Duolingo 那次「发明改写」的教训）。
 *   - 任何异常都打日志再原样放行，绝不静默吞掉。
 *   - 只有确实改了字段才替换响应头，避免误伤静态资源 / 大文件。
 *
 * 已知边界：
 *   - 正课播放地址由服务端签发带 auth_key 的 VOD URL，抓包里看不到下发接口。
 *     改客户端 JSON 只能改 UI 与客户端门控，无法保证解锁正课播放。
 */

const FAR_DATE = "2099-12-31";
const FAR_DATETIME = "2099-12-31 23:59:59";
const FAR_ISO = "2099-12-31T23:59:59.000Z";
const FAR_TS = 4102416000;
const FAR_DAYS = 9999;

function log(msg) {
  console.log("[hund] " + msg);
}

function isObj(o) {
  return o !== null && typeof o === "object" && !Array.isArray(o);
}

function setIf(o, key, value) {
  if (!isObj(o) || !(key in o)) return 0;
  o[key] = value;
  return 1;
}

function setAll(o, keys, value) {
  let n = 0;
  if (!isObj(o)) return n;
  keys.forEach(function (k) { n += setIf(o, k, value); });
  return n;
}

function parseUrl(u) {
  const m = String(u || "").match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/i);
  return {
    host: m ? m[1].toLowerCase() : "",
    path: m ? (m[2] || "/") : ""
  };
}

function cleanHeaders(original) {
  const h = {};
  const drop = ["content-encoding", "content-length", "etag", "transfer-encoding", "content-type", "cache-control"];
  Object.keys(original || {}).forEach(function (k) {
    if (drop.indexOf(k.toLowerCase()) === -1) h[k] = original[k];
  });
  h["Content-Type"] = "application/json; charset=UTF-8";
  h["Cache-Control"] = "no-store, no-cache, must-revalidate";
  return h;
}

/* ---------- 1. 主用户对象：学籍 / 在线会员 ---------- */
function patchUserInfo(d) {
  let n = 0;
  n += setAll(d, [
    "is_sxy19_user", "purchased_yxs", "purchased_yxs_tgroup", "purchased_sxy19",
    "purchased_wlxy", "is_yxs_old_vip", "is_buy_sxy", "is_dhy_user",
    "is_cxy18_user", "tmp_is_ever_member"
  ], 1);
  n += setAll(d, ["sxy19_expire_date", "sxy_expire_date", "yxs_expire_date"], FAR_DATE);
  n += setAll(d, [
    "ss_sxy_expire_time", "ss_sxy19_expire_time", "ss_yxs_expire_time",
    "ss_cxy18_expire_time", "ss_sxy_join_time", "ss_yxs_join_time", "ss_cxy18_join_time"
  ], FAR_DATETIME);
  n += setAll(d, ["dhy_expire_time", "expire_time", "dhy_join_time", "join_time"], FAR_TS);
  n += setIf(d, "dhy_left_days", FAR_DAYS);
  n += setIf(d, "yxs_tip_wording", "已加入混沌研习社");
  n += setIf(d, "yxs_tip_button", "查看会员权益");
  n += setIf(d, "enroll_wording", "学籍有效");
  n += setAll(d, [
    "expire_time_display", "dhy_expire_time_display",
    "super_expire_time_display", "online_expire_time_display"
  ], "会员有效至 " + FAR_DATE);
  return n;
}

/* ---------- 2. 在线会员购买页：「尚未开通在线会员」就在这里 ---------- */
function patchDhyIndex(d) {
  let n = 0;
  n += setIf(d, "dhy_expire_desc", "在线会员有效至 " + FAR_DATE);
  n += setIf(d, "special_user_type", 1);
  return n;
}

/* ---------- 3. capi 升级配置 ---------- */
function patchUpConfig(d) {
  let n = 0;
  n += setIf(d, "normal_member_days", FAR_DAYS);
  // can_upgrade 保持原值：改成 true 反而会冒出「升级」按钮
  return n;
}

/* ---------- 4. 活动 / 权益天数 ---------- */
function patchSaleDetail(d) {
  let n = 0;
  n += setIf(d, "new_user_dhy_days", FAR_DAYS);
  n += setIf(d, "course_right_days", FAR_DAYS);
  n += setIf(d, "first_join_dhy_msg", "会员有效至 " + FAR_DATE);
  n += setIf(d, "renew_join_dhy_msg", "会员有效至 " + FAR_DATE);
  return n;
}

/* ---------- 5. AI 助手 hundun-agent 的独立会员体系 ---------- */
function patchAgent(obj) {
  let n = 0;
  const m = isObj(obj) ? obj.membership : null;
  if (isObj(m)) {
    n += setIf(m, "isMember", true);
    n += setIf(m, "canUseSkill", true);
    n += setIf(m, "statusCode", "MEMBER");
    n += setIf(m, "statusDesc", "会员有效至 " + FAR_DATE);
    n += setIf(m, "memberCheckDesc", "会员有效");
    n += setIf(m, "expiresAt", FAR_ISO);
    n += setIf(m, "remainingDays", FAR_DAYS);
  }
  n += setIf(obj, "tier", "member");
  return n;
}

function patchAgentMe(obj) {
  let n = 0;
  n += setIf(obj, "authenticated", true);
  if (isObj(obj.user)) n += setIf(obj.user, "courseLearningReady", true);
  return n;
}

/* ---------- 主流程 ---------- */
function main() {
  const loc = parseUrl($request && $request.url);
  const raw = $response.body;

  if (typeof raw !== "string") {
    log("body 非字符串（" + typeof raw + "），跳过 " + loc.host + loc.path);
    $done({});
    return;
  }
  // gzip magic：Loon 未解压就塞二进制进来，JSON.parse 必然失败
  if (raw.charCodeAt(0) === 0x1f && raw.charCodeAt(1) === 0x8b) {
    log("body 仍是 gzip 二进制，跳过 " + loc.host + loc.path);
    $done({});
    return;
  }

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    log("JSON.parse 失败: " + e + " / 开头=" + raw.slice(0, 60));
    $done({});
    return;
  }

  const data = isObj(obj) ? obj.data : null;
  const key = loc.host + loc.path;
  let n = 0;

  switch (key) {
    case "user.hundun.cn/get_user_info":
      n = patchUserInfo(data);
      break;
    case "user.hundun.cn/dhy/index":
      n = patchDhyIndex(data);
      break;
    case "capi.hundun.cn/dhy/get_up_config_info":
      n = patchUpConfig(data);
      break;
    case "user.hundun.cn/activity/sale/detail":
      n = patchSaleDetail(data);
      break;
    case "tools.hundun.cn/h5Bin/hundun-agent/api/auth/membership/refresh":
      n = patchAgent(obj);
      break;
    case "tools.hundun.cn/h5Bin/hundun-agent/api/auth/me":
    case "tools.hundun.cn/h5Bin/hundun-agent/api/auth/app":
      n = patchAgentMe(obj);
      break;
    default:
      // index_config / schedule/list / reddot 等没有会员字段，保持原样
      log("接口无需改写，保持原样 " + key);
      $done({});
      return;
  }

  if (n === 0) {
    log("无匹配字段，保持原样 " + key);
    $done({});
    return;
  }

  log("改写完成 " + key + "，共 " + n + " 个字段");
  $done({ body: JSON.stringify(obj), headers: cleanHeaders($response.headers) });
}

main();

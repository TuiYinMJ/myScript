/*
 * 混沌大学 —— 会员改写统一脚本（单条 Loon Response Script）
 *
 * 抓包依据：ProxyPin 18:17 / 18:33 / 18:57 / 19:00 四份 HAR
 *
 * 三层策略（稳妥优先）：
 *   1) 已知接口 -> 完整字段表，改得最全
 *   2) 课程列表 -> 权限字段表（has_right 等）
 *   3) 未知接口 -> 高置信度白名单兜底，覆盖点进播放页后新出现的接口
 *
 * 安全约束：
 *   - 只改响应里「已存在」的键，绝不凭空造字段
 *   - 目标值与原值类型不一致时跳过，避免把状态字符串改成数字
 *   - 兜底表不含时间戳 / 文案 / 枚举（活动结束时间、state_control 等误伤风险高）
 *   - 任何异常都打日志再原样放行，绝不静默吞掉
 *
 * 诊断：改写成功后响应头带 X-Hund-Patched: 1 与 Cache-Control: no-store，
 *       Loon 日志会打印命中的字段名。抓包或日志看到这两样即可确认脚本执行过。
 *
 * 硬边界：正课播放地址是服务端签发的整片 VOD URL（auth_key 覆盖完整 244MB mp4，
 *        CDN 对任意 Range 都返回 206），试看截断发生在客户端。改客户端 JSON 能改 UI
 *        与客户端门控；若播放页另走服务端二次鉴权，脚本层面到此为止。
 */

const FAR_DATE = "2099-12-31";
const FAR_DATETIME = "2099-12-31 23:59:59";
const FAR_ISO = "2099-12-31T23:59:59.000Z";
const FAR_TS = 4102416000;
const FAR_DAYS = 9999;

// 保守模式无效时可改成 true：额外改写课程枚举字段（state_control / free_trial）。
// 这些字段的「会员态」取值在抓包里没有样本，属于实验项，默认关闭。
const AGGRESSIVE = false;

function log(msg) {
  console.log("[hund] " + msg);
}

function isObj(o) {
  return o !== null && typeof o === "object" && !Array.isArray(o);
}

/* ---------- 字段表：键 -> 目标值 ---------- */

const USER_MAP = {
  // 身份开关
  is_sxy19_user: 1, purchased_yxs: 1, purchased_yxs_tgroup: 1,
  purchased_sxy19: 1, purchased_wlxy: 1, is_yxs_old_vip: 1,
  is_buy_sxy: 1, is_dhy_user: 1, is_cxy18_user: 1,
  // 日期
  sxy19_expire_date: FAR_DATE, sxy_expire_date: FAR_DATE, yxs_expire_date: FAR_DATE,
  // 服务端时间串
  ss_sxy_expire_time: FAR_DATETIME, ss_sxy19_expire_time: FAR_DATETIME,
  ss_yxs_expire_time: FAR_DATETIME, ss_cxy18_expire_time: FAR_DATETIME,
  ss_sxy_join_time: FAR_DATETIME, ss_yxs_join_time: FAR_DATETIME,
  ss_cxy18_join_time: FAR_DATETIME,
  // 时间戳
  dhy_expire_time: FAR_TS, expire_time: FAR_TS,
  dhy_join_time: FAR_TS, join_time: FAR_TS,
  dhy_left_days: FAR_DAYS,
  // UI 文案
  yxs_tip_wording: "已加入混沌研习社",
  yxs_tip_button: "查看会员权益",
  enroll_wording: "学籍有效",
  expire_time_display: "会员有效至 " + FAR_DATE,
  dhy_expire_time_display: "在线会员有效至 " + FAR_DATE,
  super_expire_time_display: "会员有效至 " + FAR_DATE,
  online_expire_time_display: "会员有效至 " + FAR_DATE
};

const DHY_MAP = {
  dhy_expire_desc: "在线会员有效至 " + FAR_DATE,
  special_user_type: 1
};

const UPCONFIG_MAP = {
  normal_member_days: FAR_DAYS
  // can_upgrade 保持原值：改成 true 反而会冒出「升级」按钮
};

const SALE_MAP = {
  new_user_dhy_days: FAR_DAYS,
  course_right_days: FAR_DAYS,
  first_join_dhy_msg: "会员有效至 " + FAR_DATE,
  renew_join_dhy_msg: "会员有效至 " + FAR_DATE
};

const AGENT_MAP = {
  isMember: true,
  canUseSkill: true,
  statusCode: "MEMBER",
  statusDesc: "会员有效至 " + FAR_DATE,
  memberCheckDesc: "会员有效",
  expiresAt: FAR_ISO,
  remainingDays: FAR_DAYS,
  tier: "member",
  authenticated: true,
  courseLearningReady: true
};

const SCHEDULE_MAP = { has_right: 1 };
if (AGGRESSIVE) {
  SCHEDULE_MAP.state_control = 1;
  SCHEDULE_MAP.free_trial = 0;
}

// 兜底只收「语义绝对明确」的标量字段；不含时间戳、文案、枚举
const FALLBACK_MAP = {
  has_right: 1, has_permission: 1, has_auth: 1, has_bought: 1,
  can_play: 1, can_watch: 1, can_view: 1, can_study: 1, can_learn: 1,
  allow_play: 1, is_playable: 1,
  is_buy: 1, is_purchased: 1, is_paid: 1, is_authorized: 1,
  is_vip: 1, is_dhy_user: 1, is_member: 1,
  need_buy: 0, need_pay: 0, need_vip: 0,
  is_locked: 0, locked: 0, is_trial: 0,
  dhy_left_days: FAR_DAYS, normal_member_days: FAR_DAYS,
  course_right_days: FAR_DAYS, new_user_dhy_days: FAR_DAYS,
  remaining_days: FAR_DAYS, left_days: FAR_DAYS, vip_left_days: FAR_DAYS
};

/* ---------- 递归改写（只改已存在、类型一致的标量键） ---------- */
function patchTree(node, mapping, stat, depth) {
  if (depth > 12 || node === null) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) patchTree(node[i], mapping, stat, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  Object.keys(node).forEach(function (k) {
    const cur = node[k];
    const container = cur !== null && typeof cur === "object";
    if (!container && Object.prototype.hasOwnProperty.call(mapping, k)) {
      const target = mapping[k];
      if (typeof cur === typeof target && cur !== target) {
        node[k] = target;
        stat.n++;
        if (stat.keys.indexOf(k) === -1) stat.keys.push(k);
      }
    }
    if (container) patchTree(cur, mapping, stat, depth + 1);
  });
}

function parseUrl(u) {
  const m = String(u || "").match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/i);
  return { host: m ? m[1].toLowerCase() : "", path: m ? (m[2] || "/") : "" };
}

function cleanHeaders(original) {
  const h = {};
  const drop = ["content-encoding", "content-length", "etag", "transfer-encoding", "cache-control"];
  Object.keys(original || {}).forEach(function (k) {
    if (drop.indexOf(k.toLowerCase()) === -1) h[k] = original[k];
  });
  // 保留服务端原 Content-Type（这批接口返回 text/html 却是 JSON，改它只会引入额外差异）
  h["Cache-Control"] = "no-store, no-cache, must-revalidate";
  h["Pragma"] = "no-cache";
  h["X-Hund-Patched"] = "1";
  return h;
}

function pickMapping(key) {
  switch (key) {
    case "user.hundun.cn/get_user_info":
      return [USER_MAP, "用户信息"];
    case "user.hundun.cn/dhy/index":
      return [DHY_MAP, "会员购买页"];
    case "capi.hundun.cn/dhy/get_up_config_info":
      return [UPCONFIG_MAP, "升级配置"];
    case "user.hundun.cn/activity/sale/detail":
      return [SALE_MAP, "活动详情"];
    case "course.hundun.cn/online/schedule/list":
      return [SCHEDULE_MAP, "课程列表权限"];
    default:
      if (key.indexOf("tools.hundun.cn/h5Bin/hundun-agent/api/auth/") === 0) {
        return [AGENT_MAP, "AI助手会员"];
      }
      return [FALLBACK_MAP, "通用兜底"];
  }
}

function main() {
  const loc = parseUrl($request && $request.url);
  const key = loc.host + loc.path;
  const raw = $response && $response.body;

  if (typeof raw !== "string" || raw.length === 0) {
    log("跳过：body 为空或非字符串 " + key);
    $done({});
    return;
  }
  const c0 = raw.charCodeAt(0);
  if (c0 === 0x1f && raw.charCodeAt(1) === 0x8b) {
    log("跳过：body 仍是 gzip 二进制 " + key);
    $done({});
    return;
  }
  if (c0 !== 0x7b && c0 !== 0x5b) {
    log("跳过：非 JSON 内容（HTML/静态资源） " + key);
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

  const picked = pickMapping(key);
  const stat = { n: 0, keys: [] };
  try {
    patchTree(obj, picked[0], stat, 0);
  } catch (e) {
    log("改写异常，原样放行: " + e + " / " + key);
    $done({});
    return;
  }

  if (stat.n === 0) {
    log("无需改写 [" + picked[1] + "] " + key);
    $done({});
    return;
  }

  log("改写完成 [" + picked[1] + "] " + key + " 共 " + stat.n + " 处 / " + stat.keys.join(","));
  $done({ body: JSON.stringify(obj), headers: cleanHeaders($response.headers) });
}

try {
  main();
} catch (e) {
  log("主流程异常，原样放行: " + e);
  $done({});
}

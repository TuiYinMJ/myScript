/*
 * 混沌大学 —— 会员改写统一脚本（单条 Loon Response Script）
 *
 * 依据：ProxyPin 18:17 / 18:33 / 18:57 / 19:00 四份 HAR
 *       + H5 前端 bundle（yxs-pic.oss-cn-beijing.aliyuncs.com）
 *         /dhy/index.3d3d7d22.js              会员购买页
 *         /online_college/index.9bfab3ca.js   课程 tab
 *         /online_college/course_detail.c3182c1b.js  课程详情页
 *
 * === 本轮（19:46）从前端源码里挖到的新根因 ===
 * 1) 课程详情页底部「开通会员 学700+好课」横条的显示条件：
 *      showBottomBtn = computed(() => packageInfo.boutique.is_dhy !== 1 && !isMiniProgram())
 *    即由 course.hundun.cn/boutique/get_package_detail 返回的 boutique.is_dhy 决定，
 *    不是用户信息接口。该接口在现有抓包里没出现（点进详情页才请求），
 *    之前脚本的兜底表也不含 is_dhy —— 所以 has_right 已改成 1、视频能看，横条还在。
 * 2) 课程对象里每门课都带 sku_mode（抓包里是 "yxs" 与 "cxxy"），
 *    跳转链 yanxishe://course/replay?...&sku_mode=yxs 把这个 mode 传给原生播放器。
 *    原生层很可能用「课程 sku_mode 是否出现在 user_info.sku_list 里」来判会员，
 *    而上一版只补了 {sku_mode:"dhy"}，因此播放时仍提示「开通会员继续观看」。
 *    前端 bundle 明确检查的模式：dhy / wlxy / ofsxy（sendSa 埋点用 is_dhy/is_wlxy/is_ofsxy），
 *    抓包里课程实际使用的模式：yxs / cxxy。这里全部补齐。
 * 3) H5 判会员只看：isSkuMode(userInfo.sku_list, "dhy")，即 list.filter(x => x.sku_mode === "dhy").length > 0。
 *
 * === 本轮修掉的暗坑 ===
 * - join_time / dhy_join_time / ss_*_join_time 之前被设成 2099（未来），
 *   「入会时间晚于当前时间」逻辑倒置；改成过去时间，与 2099 到期时间构成有效区间。
 * - super_expire_time_display / online_expire_time_display 原本是空串（其它产品档位的到期文案），
 *   first_join_dhy_msg / renew_join_dhy_msg 原本也是空串；上一版把它们填满，
 *   前端常用 if(str) 控制横幅显隐，可能冒出多余 UI。现在一律保持原样。
 * - special_user_type 前端只判断 2 == special_user_type，改成 1 是无效改动，已移除。
 * - 神策埋点 sensor.hundun.cn/sa.gif 上报 is_dhy/is_wlxy/is_ofsxy，
 *   这三个值由 sku_list 计算而来；补齐 sku_list 后埋点画像也会同步变正确。
 *   埋点响应只有 1x1 GIF / 12 字节 ACK，不返回任何配置，无需拦截、也不应拦截。
 * - api/auth/me 有一次返回 401，只改 body 不改状态码前端仍会判未登录，这里一并改成 200。
 * - OPTIONS 预检（HAR 里 11 条）现在静默放行，不再刷日志。
 *
 * 三层策略：1) 已知接口完整字段表  2) 课程列表权限表  3) 未知接口高置信度白名单兜底
 * 安全约束：除 sku_list 补充元素外，只改响应里已存在、类型一致的标量键；
 *           不碰时间戳枚举 / URL / 商品数据；异常一律打日志再原样放行。
 *
 * 诊断：改写成功的响应带 X-Hund-Patched: 1、X-Hund-Sku: dhy,yxs,...、Cache-Control: no-store；
 *       Loon 日志打印命中的字段名。抓包或日志看到这些即可确认脚本确实执行过。
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

/* 入会时间必须是过去：与 2099 到期时间构成「已生效且未过期」的合法区间 */
const PAST_TS = 1704067200;                 // 2024-01-01 00:00:00 UTC
const PAST_DATETIME = "2024-01-01 08:00:00";
const PAST_DATE = "2024/01/01";

/* 会员 SKU 模式：dhy/wlxy/ofsxy 来自前端 bundle，yxs/cxxy 来自抓包里的课程 sku_mode */
const SKU_MODES = ["dhy", "yxs", "cxxy", "wlxy", "ofsxy"];
const PATCH_SKU_LIST = true;

/* hundun-agent 的 api/auth/me 有 401，改 body 的同时把状态码改成 200 */
const FIX_AUTH_STATUS = true;

/* 仍看不了正课时再试：会动 state_control / free_trial 这类枚举，可能破坏已通的拖动 */
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
  // 到期日期
  sxy19_expire_date: FAR_DATE, sxy_expire_date: FAR_DATE, yxs_expire_date: FAR_DATE,
  // 服务端时间串：到期取未来，入会取过去
  ss_sxy_expire_time: FAR_DATETIME, ss_sxy19_expire_time: FAR_DATETIME,
  ss_yxs_expire_time: FAR_DATETIME, ss_cxy18_expire_time: FAR_DATETIME,
  ss_sxy_join_time: PAST_DATETIME, ss_yxs_join_time: PAST_DATETIME,
  ss_cxy18_join_time: PAST_DATETIME,
  cxy18_join_time: PAST_DATE,
  // 时间戳
  dhy_expire_time: FAR_TS, expire_time: FAR_TS,
  dhy_join_time: PAST_TS, join_time: PAST_TS,
  dhy_left_days: FAR_DAYS,
  // UI 文案（只改 HAR 里原本就有内容的字段）
  yxs_tip_wording: "已加入混沌研习社",
  yxs_tip_button: "查看会员权益",
  enroll_wording: "学籍有效",
  expire_time_display: "会员有效至 " + FAR_DATE,
  dhy_expire_time_display: "在线会员有效至 " + FAR_DATE
};

const DHY_MAP = {
  dhy_expire_desc: "在线会员有效至 " + FAR_DATE
  // special_user_type 前端只在 ==2 时显示地址图标，改它没有任何收益，保持原值 0
};

const UPCONFIG_MAP = {
  normal_member_days: FAR_DAYS
  // can_upgrade 保持 false：改成 true 会冒出「升级」按钮
};

const SALE_MAP = {
  new_user_dhy_days: FAR_DAYS,
  course_right_days: FAR_DAYS
  // first_join_dhy_msg / renew_join_dhy_msg 原本是空串，保持原样避免多出弹窗
};

/* membership/refresh：会员对象，改全字段 */
const AGENT_MEMBERSHIP_MAP = {
  isMember: true,
  canUseSkill: true,
  statusCode: "MEMBER",
  statusDesc: "会员有效至 " + FAR_DATE,
  memberCheckDesc: "会员有效",
  memberCheckTitle: "会员有效",
  expiresAt: FAR_ISO,
  remainingDays: FAR_DAYS,
  tier: "member",
  authenticated: true,
  courseLearningReady: true
};

/* auth/me 与 auth/app：user.expiresAt 是登录会话到期时间，不是会员到期，
   绝不能递归改成 2099，否则会话校验逻辑会被带偏。这里只改登录态。 */
const AGENT_AUTH_MAP = {
  authenticated: true,
  courseLearningReady: true
};

const SCHEDULE_MAP = { has_right: 1 };
if (AGGRESSIVE) {
  SCHEDULE_MAP.state_control = 1;
  SCHEDULE_MAP.free_trial = 0;
  SCHEDULE_MAP.has_bought = 1;
}

/* 兜底表：语义绝对明确的标量字段；不含时间戳、文案、枚举、URL */
const FALLBACK_MAP = {
  // 课程详情页「开通会员 学700+好课」横条由 boutique.is_dhy 控制
  is_dhy: 1, is_dhy_user: 1, is_yxs: 1, is_wlxy: 1, is_ofsxy: 1,
  has_right: 1, has_permission: 1, has_auth: 1, has_bought: 1,
  can_play: 1, can_watch: 1, can_view: 1, can_study: 1, can_learn: 1,
  allow_play: 1, is_playable: 1,
  is_buy: 1, is_purchased: 1, is_paid: 1, is_authorized: 1,
  is_vip: 1, is_member: 1,
  need_buy: 0, need_pay: 0, need_vip: 0,
  is_locked: 0, locked: 0, is_trial: 0,
  dhy_left_days: FAR_DAYS, normal_member_days: FAR_DAYS,
  course_right_days: FAR_DAYS, new_user_dhy_days: FAR_DAYS,
  remaining_days: FAR_DAYS, left_days: FAR_DAYS, vip_left_days: FAR_DAYS
};

/* 精确文案替换：只整串命中才改，避免误伤商品标题 / 分享文案 / 购买记录 */
const TEXT_MAP = {
  "尚未开通在线会员": "在线会员有效至 " + FAR_DATE,
  "开通会员，畅学500+好课": "在线会员有效至 " + FAR_DATE,
  "开通会员,畅学500+好课": "在线会员有效至 " + FAR_DATE,
  "欢迎加入混沌": "在线会员有效至 " + FAR_DATE,
  "尚未加入\n混沌研习社": "已加入混沌研习社",
  "点击入社": "查看会员权益",
  "开通学籍": "学籍有效",
  "当前账号无会员权限": "会员有效",
  "当前账号无会员权限，暂不可使用 Skill": "会员有效",
  "非会员": "会员",
  "未开通": "已开通"
};

/* ---------- 递归改写 ---------- */
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
      // null 允许被替换成标量（agent 的 remainingDays 是 null）
      const typeOk = (cur === null && typeof target !== "object") || typeof cur === typeof target;
      if (typeOk && cur !== target) {
        node[k] = target;
        stat.n++;
        if (stat.keys.indexOf(k) === -1) stat.keys.push(k);
      }
    } else if (!container && typeof cur === "string" &&
               Object.prototype.hasOwnProperty.call(TEXT_MAP, cur)) {
      const txt = TEXT_MAP[cur];
      if (cur !== txt) {
        node[k] = txt;
        stat.n++;
        if (stat.keys.indexOf("文案:" + cur) === -1) stat.keys.push("文案:" + cur);
      }
    }
    if (container) patchTree(cur, mapping, stat, depth + 1);
  });
}

/* ---------- 给任何已存在的 sku_list 补齐全部模式 ---------- */
function ensureSkuModes(node, stat, depth) {
  if (depth > 10 || node === null) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) ensureSkuModes(node[i], stat, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  if (Array.isArray(node.sku_list)) {
    const present = {};
    node.sku_list.forEach(function (x) {
      if (isObj(x) && typeof x.sku_mode === "string") present[x.sku_mode] = true;
    });
    const added = [];
    SKU_MODES.forEach(function (m) {
      if (!present[m]) {
        node.sku_list.push({ sku_mode: m });
        added.push(m);
        stat.n++;
      }
    });
    if (added.length) {
      const tag = "sku_list+[" + added.join(",") + "]";
      if (stat.keys.indexOf(tag) === -1) stat.keys.push(tag);
    }
  }
  Object.keys(node).forEach(function (k) {
    const v = node[k];
    if (v !== null && typeof v === "object") ensureSkuModes(v, stat, depth + 1);
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
  // Loon 在 body 改动后会自动重算 Content-Length / Content-Encoding；这里显式清掉更稳妥
  h["Cache-Control"] = "no-store, no-cache, must-revalidate";
  h["Pragma"] = "no-cache";
  h["X-Hund-Patched"] = "1";
  h["X-Hund-Sku"] = SKU_MODES.join(",");
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
      if (key === "tools.hundun.cn/h5Bin/hundun-agent/api/auth/membership/refresh") {
        return [AGENT_MEMBERSHIP_MAP, "AI助手会员"];
      }
      if (key.indexOf("tools.hundun.cn/h5Bin/hundun-agent/api/auth/") === 0) {
        return [AGENT_AUTH_MAP, "AI助手登录态"];
      }
      return [FALLBACK_MAP, "通用兜底"];
  }
}

function main() {
  // CORS 预检、204 空响应：静默放行，避免日志噪音
  if ($request && $request.method === "OPTIONS") {
    $done({});
    return;
  }

  const loc = parseUrl($request && $request.url);
  const key = loc.host + loc.path;
  const raw = $response && $response.body;

  const isAgentAuth = key.indexOf("tools.hundun.cn/h5Bin/hundun-agent/api/auth/") === 0;
  const fixStatus = FIX_AUTH_STATUS && isAgentAuth && $response && $response.status === 401;

  if (typeof raw !== "string" || raw.length === 0) {
    if (fixStatus) {
      log("修正状态码 401->200 " + key);
      $done({ status: 200, headers: cleanHeaders($response.headers) });
      return;
    }
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
    log("跳过：非 JSON 内容 " + key);
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

  // CORS 预检空壳 {"error_no":0,"error_msg":""}
  if (isObj(obj) && obj.error_no === 0 && typeof obj.error_msg === "string" &&
      !obj.data && Object.keys(obj).length === 2) {
    $done({});
    return;
  }

  const picked = pickMapping(key);
  const stat = { n: 0, keys: [] };
  try {
    patchTree(obj, picked[0], stat, 0);
    if (PATCH_SKU_LIST) ensureSkuModes(obj, stat, 0);
  } catch (e) {
    log("改写异常，原样放行: " + e + " / " + key);
    $done({});
    return;
  }

  if (stat.n === 0 && !fixStatus) {
    log("无需改写 [" + picked[1] + "] " + key);
    $done({});
    return;
  }

  log("改写完成 [" + picked[1] + "] " + key + " 共 " + stat.n + " 处 / " + stat.keys.join(",") +
      (fixStatus ? " / 401->200" : ""));
  const out = { body: JSON.stringify(obj), headers: cleanHeaders($response.headers) };
  if (fixStatus) out.status = 200;
  $done(out);
}

try {
  main();
} catch (e) {
  log("主流程异常，原样放行: " + e);
  $done({});
}

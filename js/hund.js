const targetHost = "user.hundun.cn";
const targetPath = "/get_user_info";

if ($request.url.indexOf(targetHost) === -1 || $request.url.indexOf(targetPath) === -1) {
  $done({});
} else {
  try {
    let obj = JSON.parse($response.body);

    if (obj && obj.data) {
      const d = obj.data;

      // 学籍 / 会员身份
      d.is_sxy19_user = 1;
      d.purchased_yxs = 1;
      d.purchased_yxs_tgroup = 1;
      d.purchased_sxy19 = 1;
      d.is_yxs_old_vip = 1;
      d.tmp_is_ever_member = 1;

      // 有效期：拉到远期
      d.sxy19_expire_date = "2099-12-31";
      d.sxy_expire_date = "2099-12-31";
      d.yxs_expire_date = "2099-12-31";
      d.dhy_expire_time = 4102416000;          // 2100-01-01 时间戳兜底
      d.dhy_expire_time_display = "2099-12-31";

      // 展示文案，避免 UI 回退
      d.yxs_tip_wording = "已加入混沌研习社";
      d.expire_time_display = "会员有效";
      d.sxy_expire_date = "2099-12-31";
    }

    $done({ body: JSON.stringify(obj) });
  } catch (e) {
    $done({});
  }
}
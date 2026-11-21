/*
 * Nex Terminal (com.icons6.nexTerm) 会员解锁
 *
 * 依据 ProxyPin11-21_17_22_53.har：
 *   应用唯一的付费相关请求是
 *     POST https://nex.icons6.top/updateUser
 *   Content-Type: multipart/form-data; boundary=alamofire.boundary.xxxx
 *   Authorization: nex-terminalwillbebest!@#
 *   字段：
 *     hostCount     = 1
 *     uuid          = 1FF62384-01BE-4B12-90FE-63F2B9B214A4
 *     isPaid        = 0        <- 付费标记，核心
 *     purchaseDate  = ""       <- 购买日期，未付费时为空
 *     productId     = ""       <- 购买的产品 ID，未付费时为空
 *     appVersion    = 3.1.0
 *   响应固定为 {"code":200,"msg":"success","data":""}，没有任何下发字段。
 *
 * 因此唯一可改的杠杆是「请求侧上报」：
 *   isPaid 0 -> 1，并补一个合法的 purchaseDate / productId，
 *   让服务端把该设备 (uuid) 记为已付费。
 *
 * 注意：若 App 的功能解锁完全依赖本地 StoreKit 收据判断，
 *       改上报未必生效；此时需要抓到 App 启动/进入会员页时的
 *       「查询」接口再补规则。本脚本不影响本地收据，纯改网络上报。
 */

var TAG = "[NexTerm]";
var url = ($request && $request.url) ? $request.url : "";

function setField(body, name, value) {
    // 匹配 multipart 里 name="xxx"\r\n\r\n原值\r\n，只替换值，保留 boundary 与结构
    var re = new RegExp("(name=\\\"" + name + "\\\"\\r\\n\\r\\n)([^\\r]*)");
    if (re.test(body)) {
        return body.replace(re, function (m, head) {
            return head + value;
        });
    }
    // 字段不存在则跳过（不擅自插入，避免破坏 multipart 结构）
    return body;
}

if (/nex\.icons6\.top\/updateUser/i.test(url)) {
    try {
        var body = $request.body;
        if (typeof body !== "string") {
            console.log(TAG + " body 非字符串，跳过");
            $done({});
        } else {
            var original = body;
            body = setField(body, "isPaid", "1");
            body = setField(body, "purchaseDate", "2024-01-01T00:00:00Z");
            body = setField(body, "productId", "com.icons6.nexTerm.pro");

            if (body === original) {
                console.log(TAG + " 未匹配到付费字段，原样放行");
                $done({});
            } else {
                console.log(TAG + " isPaid -> 1, productId 已填充");
                // 保留原 headers（含 Content-Type 的 boundary），只改 body
                $done({ body: body });
            }
        }
    } catch (e) {
        console.log(TAG + " 改写失败，原样放行: " + e);
        $done({});
    }
} else {
    $done({});
}

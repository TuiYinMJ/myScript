// 删除协商缓存头并禁用缓存，避免 304 导致响应脚本拿不到完整 body
let headers = $request.headers;
delete headers["If-None-Match"];
delete headers["If-Modified-Since"];
headers["Cache-Control"] = "no-cache";

$done({ headers });
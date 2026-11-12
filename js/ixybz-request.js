let headers = $request.headers;
delete headers["If-None-Match"];
delete headers["If-Modified-Since"];
headers["Cache-Control"] = "no-cache";

$done({ headers });
import {createServer} from "node:http";
import {createReadStream} from "node:fs";
import {readdir, readFile, stat} from "node:fs/promises";
import {execFile} from "node:child_process";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {dataRoot, scanFolder, validId} from "./scan.mjs";
import {upgradeGeography} from "./places.mjs";
import {makeFootprint} from "../web/footprint-model.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const project = path.dirname(here);
const run = promisify(execFile);
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",".ico":"image/x-icon",".jpg":"image/jpeg",".webp":"image/webp"};
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const localAssets = new Set(["scan.html","scan.css","scan.js","scan-client.js"]);
const prototypeAssets = new Set(["index.html","picker.css","picker.js","prototype.css","prototype.js","direct.js","wizard.js","workspace.js"]);
let scanning = null;
let choosing = false;
const recentJobs = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, data) {
  res.writeHead(status, {"Content-Type":types[".json"]});
  res.end(JSON.stringify(data));
}

async function serve(res, file) {
  const entry = await stat(file).catch(() => null);
  if (!entry?.isFile()) throw new HttpError(404, "找不到请求的内容。");
  res.writeHead(200, {"Content-Type":types[path.extname(file)] || "application/octet-stream", "Content-Length":entry.size});
  const stream = createReadStream(file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

async function readBody(req) {
  let payload = "";
  for await (const chunk of req) {
    payload += chunk;
    if (payload.length > 16384) throw new HttpError(413, "目录路径太长。");
  }
  try { return JSON.parse(payload); }
  catch { throw new HttpError(400, "无法读取所选目录。"); }
}

async function selectFolder() {
  if (process.platform !== "darwin") return {manual:true};
  if (choosing) throw new HttpError(409, "目录选择窗口已打开。");
  choosing = true;
  try {
    const {stdout} = await run("/usr/bin/osascript", ["-e",
      'POSIX path of (choose folder with prompt "选择要扫描的照片目录")'], {timeout:300000});
    return {path:stdout.replace(/\r?\n$/, "")};
  } catch (error) {
    if (String(error.stderr).includes("(-128)")) return {cancelled:true};
    return {manual:true};
  } finally {
    choosing = false;
  }
}

async function libraries() {
  const entries = await readdir(dataRoot, {withFileTypes:true}).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const indexes = await Promise.all(entries.filter(entry => entry.isDirectory() && validId(entry.name)).map(async entry => {
    try {
      return JSON.parse(await readFile(path.join(dataRoot,entry.name,"summary.json"), "utf8"));
    } catch {
      return null;
    }
  }));
  return indexes.filter(Boolean).sort((a,b) => b.finishedAt.localeCompare(a.finishedAt));
}

function launch(folder) {
  if (scanning) throw new HttpError(409, "另一个目录正在扫描，请等它完成或取消。");
  if (typeof folder !== "string" || !folder.trim()) throw new HttpError(400, "请先选择照片目录。");
  if (folder.includes("\0")) throw new HttpError(400, "目录路径无效。");
  const id = randomUUID();
  const controller = new AbortController();
  const job = {id,phase:"discovering"};
  scanning = {id,controller};
  recentJobs.set(id,job);
  if (recentJobs.size > 32) recentJobs.delete(recentJobs.keys().next().value);
  scanFolder(folder, {id,signal:controller.signal,onProgress:progress=>Object.assign(job,progress)})
    .then(summary => Object.assign(job,summary,{phase:"done"}))
    .catch(error => Object.assign(job,{phase:controller.signal.aborted ? "cancelled" : "failed", error:
      error.code ? "扫描遇到文件系统错误，请检查权限和磁盘空间。" : error.message}))
    .finally(() => { scanning = null; });
  return job;
}

async function handle(req, res, authority, prototypes) {
  const origin = "http://" + authority;
  if (req.headers.host !== authority) throw new HttpError(403,"请使用启动工具时显示的本地地址。");
  const {pathname} = new URL(req.url,origin);
  const method = req.method;
  if (method === "POST") {
    if (req.headers.origin !== origin || req.headers["x-photo-atlas"] !== "local") throw new HttpError(403,"请在本地工具页面发起此操作。");
    if (pathname === "/api/folder") return json(res,200,await selectFolder());
    if (pathname === "/api/scans") return json(res,202,launch((await readBody(req))?.folder));
    const cancel = /^\/api\/scans\/([^/]+)\/cancel$/.exec(pathname);
    if (cancel && scanning?.id === cancel[1]) {
      scanning.controller.abort();
      return json(res,202,{cancelled:true});
    }
    throw new HttpError(404,"找不到当前操作。");
  }
  if (method !== "GET") throw new HttpError(405,"此操作不可用。");
  if (pathname === "/api/libraries") return json(res,200,await libraries());
  if (pathname === "/api/scans/active") return json(res,200,scanning ? recentJobs.get(scanning.id) : null);
  const scan = /^\/api\/scans\/([^/]+)$/.exec(pathname);
  if (scan && recentJobs.has(scan[1])) return json(res,200,recentJobs.get(scan[1]));
  const file = /^\/api\/libraries\/([0-9a-f-]+)\/(index\.json|footprint\.json|thumbs\/[0-9a-f]{24}\.jpg)$/.exec(pathname);
  if (file && validId(file[1])) {
    const aggregate = file[2] === "footprint.json";
    const target = path.join(dataRoot,file[1],aggregate ? "index.json" : file[2]);
    if (!aggregate && file[2] !== "index.json") return serve(res,target);
    const data = await readFile(target,"utf8").catch(error => {
      if (error.code === "ENOENT") throw new HttpError(404,"找不到这份扫描报告。");
      throw error;
    });
    const index = await upgradeGeography(JSON.parse(data));
    return json(res,200,aggregate ? makeFootprint(index) : index);
  }
  if (pathname === "/scan" || pathname === "/scan/") return serve(res,path.join(here,"scan.html"));
  const local = pathname.slice(1);
  if (localAssets.has(local)) return serve(res,path.join(here,local));
  if (prototypes && pathname.startsWith("/prototypes/scan/")) {
    const asset = pathname.slice("/prototypes/scan/".length) || "index.html";
    if (prototypeAssets.has(asset)) return serve(res,path.join(project,"prototypes","scan",asset));
    throw new HttpError(404,"找不到这个原型。");
  }
  if (prototypes && pathname === "/prototypes/scan") {
    res.writeHead(302,{Location:"/prototypes/scan/"});
    return res.end();
  }
  // Only built assets are served here, so scan indexes and source photos cannot be reached by a file path.
  if (pathname === "/" || /^\/(?:annual\/)?[\w.-]+$/.test(pathname)) {
    const asset = pathname === "/" ? "index.html" : pathname.slice(1);
    if (asset !== "." && asset !== "..") return serve(res,path.join(project,"dist",asset));
  }
  throw new HttpError(404,"找不到请求的内容。");
}

export async function startServer(port,{prototypes=false}={}) {
  let authority;
  const server = createServer((req,res) => {
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Referrer-Policy","no-referrer");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Cross-Origin-Resource-Policy","same-origin");
    res.setHeader("X-Photo-Atlas-Local","1");
    res.setHeader("Cache-Control",req.url?.includes("/thumbs/") ? "private, max-age=86400" : "no-store");
    handle(req,res,authority,prototypes).catch(error => {
      if (res.headersSent) return res.destroy();
      if (!error.status) console.error(error);
      json(res,error.status || 500,{error:error.status ? error.message : "工具遇到错误，请检查终端日志。"});
    });
  });
  await new Promise((resolve,reject) => {
    server.once("error",reject);
    server.listen(port,"127.0.0.1",resolve);
  });
  authority = "127.0.0.1:" + server.address().port;
  return {server,url:"http://" + authority};
}

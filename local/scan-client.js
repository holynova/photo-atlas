import {esc} from "/model.js";

export {esc};
export const number = value => new Intl.NumberFormat("zh-CN").format(value);
export const reportLink = id => "/footprint.html?scan=" + encodeURIComponent(id);
const idle = {phase:"idle"};
const unfinished = new Set(["discovering","scanning"]);
export const running = job => unfinished.has(job.phase);

async function request(url, method = "GET", body) {
  const response = await fetch(url, {method,
    headers:method === "POST" ? {"Content-Type":"application/json","X-Photo-Atlas":"local"} : {},
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请重试。");
  return data;
}

class ScanSession extends EventTarget {
  folder = "";
  job = idle;
  libraries = [];
  message = "";
  busy = false;
  timer;

  changed() { this.dispatchEvent(new Event("change")); }

  async load() {
    try {
      const [libraries,job] = await Promise.all([request("/api/libraries"),request("/api/scans/active")]);
      this.libraries = libraries;
      if (job && this.job === idle) {
        this.job = job;
        this.watch(job.id);
      }
    } catch (error) {
      this.message = error.message;
    }
    this.changed();
  }

  async choose() {
    this.busy = true;
    this.message = "";
    this.changed();
    try {
      const result = await request("/api/folder","POST");
      if (result.path) this.folder = result.path;
      if (result.manual) this.message = "可在下方粘贴照片目录的完整路径。";
      return Boolean(result.path);
    } catch (error) {
      this.message = error.message;
      return false;
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  async start() {
    if (running(this.job) || this.busy) return;
    if (!this.folder.trim()) {
      this.message = "请选择目录或填写本地目录路径。";
      this.changed();
      return;
    }
    this.busy = true;
    this.message = "";
    this.changed();
    try {
      this.job = await request("/api/scans","POST",{folder:this.folder});
      this.watch(this.job.id);
    } catch (error) {
      this.message = error.message;
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  watch(id) {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        this.job = await request("/api/scans/" + id);
        this.changed();
        if (running(this.job)) this.watch(id);
        if (this.job.phase === "done") await this.load();
      } catch (error) {
        this.message = error.message;
        this.job = {phase:"failed",error:"无法连接本地扫描工具。"};
        this.changed();
      }
    },420);
  }

  async cancel() {
    try { await request("/api/scans/" + this.job.id + "/cancel","POST"); }
    catch (error) { this.message = error.message; this.changed(); }
  }

  reset() {
    this.job = idle;
    this.message = "";
    this.changed();
  }
}

export const session = new ScanSession();

export function folderField({label="照片目录", button="选择目录"} = {}) {
  const disabled = session.busy || running(session.job);
  return '<label for="folder">' + esc(label) + '</label><div class="folder-field">' +
    '<input id="folder" type="text" value="' + esc(session.folder) + '" placeholder="/Users/你的名字/Pictures" autocomplete="off" spellcheck="false"' + (disabled ? " disabled" : "") + '>' +
    '<button type="button" class="secondary" data-action="pick"' + (disabled ? " disabled" : "") + '>' + esc(button) + '</button></div>';
}

export function scanStats(totals) {
  return '<dl class="scan-stats">' + [
    ["读取成功",totals.photos],["有拍摄日期",totals.dated],["已归属地区",totals.located],["读取失败",totals.failed]
  ].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+number(value)+'</dd></div>').join("") + '</dl>';
}

export function scanStatus(job) {
  if (job.phase === "idle") return "";
  if (job.phase === "failed") return '<p class="state-note" role="alert">' + esc(job.error) + '</p>';
  if (job.phase === "cancelled") return '<p class="state-note" role="status">扫描已取消，可以重新选择目录。</p>';
  if (job.phase === "done") return '<section class="result" aria-label="扫描结果"><h2>扫描完成</h2>' +
    scanStats(job.totals) + '<div class="result-links"><a class="primary" href="' + reportLink(job.id) +
    '">查看结果 <span aria-hidden="true">↗</span></a></div></section>';

  const totals = job.totals;
  return '<section class="result" aria-label="扫描进度"><div class="progress-head"><strong role="status">' +
    (totals ? "正在读取照片" : "正在查找照片") + '</strong>' +
    (totals ? '<span>'+number(totals.processed)+' / '+number(totals.found)+'</span>' : '') + '</div>'+
    '<progress aria-label="扫描进度"' + (totals ? ' max="'+totals.found+'" value="'+totals.processed+'"' : '') + '></progress>' +
    '<button class="text-button" type="button" data-action="cancel">取消扫描</button></section>';
}

export function libraryList(libraries, empty = "还没有生成的报告。") {
  if (!libraries.length) return '<p class="muted">'+esc(empty)+'</p>';
  return '<ul class="library-list">' + libraries.map(item=>'<li><a href="'+reportLink(item.id)+'"><span><strong>'+
    esc(item.source)+'</strong><small>'+number(item.totals.photos)+' 张 · '+esc(item.finishedAt.slice(0,10))+
    '</small></span><span aria-hidden="true">↗</span></a></li>').join("")+'</ul>';
}

export function bindSurface(surface,{onAction,render} = {}) {
  surface.addEventListener("input",event=>{
    if (event.target.id === "folder") session.folder = event.target.value;
  });
  surface.addEventListener("submit",event=>{
    event.preventDefault();
    if (!onAction?.("submit")) session.start();
  });
  surface.addEventListener("click",async event=>{
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (onAction?.(action)) return;
    if (action === "pick") await session.choose();
    if (action === "start") await session.start();
    if (action === "cancel") await session.cancel();
    if (action === "reset") session.reset();
  });
  session.addEventListener("change",()=>{
    const current = document.activeElement;
    const inputActive = surface.contains(current) && current.id === "folder";
    const action = surface.contains(current) ? current.dataset.action : null;
    const selection = inputActive ? [current.selectionStart,current.selectionEnd] : null;
    render?.();
    if (inputActive) {
      const field = surface.querySelector("#folder");
      field?.focus();
      if (field && selection) field.setSelectionRange(...selection);
    } else if (action) {
      const next = [...surface.querySelectorAll("[data-action]")].find(element=>element.dataset.action===action && !element.disabled);
      (next || surface.querySelector("h1"))?.focus({preventScroll:true});
    }
  });
  session.load();
}

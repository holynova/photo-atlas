import {day, month, dateLabel, esc, basename, group, places, journeys, journeyTitle, drawMap, makeReport} from "./model.js";
import {historyStats, historyMarkup, visitMarkup} from "./history.js";

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const dialog = $("#drawer");
const names = {map:"足迹图鉴", journal:"旅行年鉴", timeline:"时间工作台"};
const s = {design:"map", data:null, world:[], from:"", to:"", year:"", cursor:null, mode:"period", unknown:true,
  selected:null, timer:null, camera:{zoom:1, center:null}, drawer:null, points:[], records:[], base:[],
  journeyLimit:40, photoContext:null, scope:"domestic", domesticRegions:[], historyCity:null};
const number = (value) => new Intl.NumberFormat("zh-CN").format(value);
const button = (action, label, value = "", classes = "") =>
  '<button type="button" class="' + classes + '" data-action="' + action + '" data-value="' + esc(value) + '">' + label + '</button>';
const allPhotos = () => s.data.photos.filter((p) => p.status === "done" && !p.excluded);
const activePhotos = () => s.scope === "domestic" ? allPhotos().filter((p) => s.data.cities[p.city]?.domestic) : allPhotos();
const regions = () => [...s.domesticRegions,...s.data.regions];
const pointsOf = (photos) => places(photos, s.data.cities);
const selected = () => s.points.find((p) => p.id === s.selected);

async function loadAsset(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("演示资源读取失败");
  return response.json();
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $("#toast").hidden = true; }, 3600);
}
function ranged(photos) {
  return photos.filter((p) => {
    const date = day(p);
    return date ? (!s.from || date >= s.from) && (!s.to || date <= s.to) : s.unknown && !s.from && !s.to;
  });
}
function sliced(photos) {
  const range = ranged(photos);
  return s.cursor ? range.filter((p) => s.mode === "cumulative" ? month(p) && month(p) <= s.cursor : month(p) === s.cursor) : range;
}
const months = () => [...new Set(ranged(activePhotos()).map(month).filter(Boolean))].sort();

function sectionHead(title, key, label, end = "") {
  return '<header class="section-head"><div><p class="section-meta">' + label + '</p><h2 id="' + key + '-title">' +
    title + '</h2></div>' + end + '</header>';
}
const mapSection = '<section class="panel map-panel" aria-labelledby="map-title">' +
  sectionHead("足迹地图","map","地理分布",'<span id="map-count" class="pill"></span>') +
  '<div class="map-frame" id="map-frame"><canvas id="atlas-map" aria-label="按行政区着色的足迹地图"></canvas><div class="map-labels" id="map-labels" aria-hidden="true"></div><div class="map-controls">' +
  button("zoom-in","+","","map-key") + button("zoom-out","−","","map-key") + button("fit","全览","","map-key") +
  '</div><span class="map-credit">边界 · Natural Earth</span></div><div class="map-foot"><span><i></i>有记录</span><span><i></i>无记录</span><span id="map-hint"></span></div></section>';
const timeSection = '<section class="panel time-panel" aria-labelledby="time-title">' +
  sectionHead("时间回放","time","日期浏览",'<output id="time-label" for="month-range"></output>') +
  '<div class="time-controls"><button id="play" class="accent" type="button" data-action="play">播放</button><div class="time-track"><div class="bars" id="bars" aria-hidden="true"></div>' +
  '<input id="month-range" type="range" min="0" value="0" aria-label="按月回放"><div class="time-ends" id="time-ends"></div></div></div>' +
  '<div class="time-modes"><button data-action="mode" data-value="period">单月</button><button data-action="mode" data-value="cumulative">累计</button><button data-action="clear-time">清除回放</button><button data-action="photos">查看记录</button></div></section>';
const journeySection = '<section class="panel journal-panel" aria-labelledby="journey-title">' +
  sectionHead("行程年鉴","journey","照片记录",'<span id="journey-count" class="pill"></span>') +
  '<div class="journeys" id="journeys"></div></section>';
const citySection = '<section class="panel city-panel" aria-labelledby="city-title">' +
  sectionHead("记录区划","city","地点索引",'<button id="selected-clear" type="button" data-action="clear-city" class="quiet" hidden>取消选中</button>') +
  '<div id="cities"></div></section>';

let observer, miniObserver;
let projection;
function layout() {
  observer?.disconnect();
  const descriptions = {map:"从地图查看记录留下的地理记录。",journal:"按时间翻阅照片中留下的城市与行程。",timeline:"交叉查看时间范围、地点与示例记录。"};
  const header = '<section class="masthead"><div class="mast-copy"><p class="section-meta" id="range-note"></p><h1>' +
    names[s.design] + '</h1><p>' + descriptions[s.design] + '</p></div><div id="stats" class="stats"></div></section>';
  const filters = '<section class="filter-bar" aria-label="报告筛选"><label>范围<select id="scope" aria-label="地理范围"><option value="domestic">国内</option><option value="world">全球</option></select></label>' +
    '<label>年份<select id="years" aria-label="筛选年份"></select></label>' +
    '<label>起始<input id="from" type="date" value="' + esc(s.from) + '"></label><label>截止<input id="to" type="date" value="' +
    esc(s.to) + '"></label><label class="checkbox"><input type="checkbox" id="unknown" ' + (s.unknown ? "checked" : "") +
    '> 含日期未知</label><button class="quiet" data-action="clear-filter">重置筛选</button><div class="filter-actions">' +
    '<button class="quiet" data-action="history">多年轨迹 ↓</button><button class="outline" data-action="export">导出报告</button></div></section>';
  const layouts = {
    map:'<div class="map-grid"><div class="map-main">' + mapSection + timeSection + '</div><aside class="map-side">' + citySection + journeySection + '</aside></div>',
    journal:'<div class="editorial"><aside class="editorial-rail">' + timeSection +
      '<nav class="panel year-index" id="year-index" aria-label="年鉴年份索引"></nav>' + citySection +
      '</aside><div class="editorial-main">' + mapSection + journeySection + '</div></div>',
    timeline:'<div class="work-grid">' + timeSection + mapSection + citySection + journeySection + '</div>'
  };
  app.innerHTML = header + filters + layouts[s.design] +
    '<section class="panel history-panel" id="history-panel" aria-labelledby="history-title">' +
    sectionHead("多年轨迹","history","按年回看") + '<div id="history-content"></div></section>' +
    '<footer class="page-foot">虚构演示数据 · 行程以相邻记录分组 · 底图来自 Natural Earth</footer>';
  $("#scope").value=s.scope;
  app.removeAttribute("aria-busy");
  observer = new ResizeObserver(renderMap);
  observer.observe($("#map-frame"));
  mapDrag();
  update();
}
function setDesign() {
  const hash = location.hash.slice(1);
  const previous = s.design;
  s.design = Object.hasOwn(names,hash) ? hash : "map";
  document.body.dataset.design = s.design;
  for (const link of document.querySelectorAll("[data-design-link]")) {
    if (link.dataset.designLink === s.design) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  }
  if (s.data) layout();
  if (previous !== s.design) window.scrollTo(0,0);
}
function evidence(photo) {
  return button("photo",'<span>' + esc(basename(photo.path)) + '</span><small>' +
    esc(dateLabel(day(photo))) + '</small>',photo.id,"evidence");
}
function cityList() {
  const point = selected();
  let content = "";
  if (point) {
    const dates = point.items.map(day).filter(Boolean).sort();
      content += '<div class="city-detail"><strong>' + esc(point.name) + '</strong><p>' +
      (dates.length ? dateLabel(dates[0]) + (dates[0] === dates.at(-1) ? "" : " – " + dateLabel(dates.at(-1))) : "日期未知") +
      '</p><p>演示记录 ' + point.items.length +
      ' 张</p><details><summary>查看示例记录（' + point.items.length + ' 张）</summary><div class="evidence-list">' +
      point.items.slice(0,20).map(evidence).join("") + '</div>' +
      (point.items.length > 20 ? button("place-photos","查看全部记录",point.id,"quiet") : "") + '</details></div>';
  }
  const rows = s.points.map((p) => button("city",'<span><i></i>' +
    esc(p.name) + '</span><b>' + p.items.length + '</b>',
    p.id,"city-row" + (p.id === s.selected ? " selected" : ""))).join("");
  return content + (rows ? '<div class="city-list">' + rows + '</div>' :
    '<p class="empty">当前范围没有匹配到行政区的照片。</p>');
}
function journalList() {
  if (!s.records.length) return '<p class="empty">当前范围没有同时具备时间和地点的记录。</p>';
  let year = "";
  return s.records.slice(0,s.journeyLimit).map((record) => {
    const nextYear = record.start.slice(0,4);
    const heading = nextYear === year ? "" : '<h3 class="journal-year" id="journal-' + nextYear + '">' + nextYear + ' <small>年</small></h3>';
    year = nextYear;
    const stamp = dateLabel(record.start) + (record.start === record.end ? "" : " – " + dateLabel(record.end));
    const mini = s.design === "journal" ? '<canvas class="mini-map" data-journey="' + record.id + '" aria-label="行程小地图"></canvas>' : "";
    return heading + '<article class="journey"><div class="journey-summary"><div><time>' + stamp + '</time><h4>' +
      esc(journeyTitle(record,s.data.cities)) + '</h4><p>' + record.items.length + ' 张照片</p></div>' + mini +
      '</div><div class="journey-actions">' + button("journey","定位地图 ↗",record.id,"quiet") +
      '<details><summary>示例记录</summary><div class="evidence-list">' + record.items.slice(0,20).map(evidence).join("") + '</div>' +
      (record.items.length > 20 ? button("journey-photos","查看全部记录",record.id,"quiet") : "") + '</details></div></article>';
  }).join("") + (s.records.length > s.journeyLimit ?
    '<div class="journal-more">' + button("more-journeys","显示更多行程","","outline") + '</div>' : "");
}
function renderTime(photos) {
  const keys = months();
  const index = keys.indexOf(s.cursor);
  const slider = $("#month-range");
  slider.max = String(keys.length);
  slider.value = String(index + 1);
  slider.disabled = !keys.length;
  $("#play").disabled = !keys.length;
  $("#play").textContent = s.timer ? "暂停" : "播放";
  $("#time-label").textContent = s.cursor ? dateLabel(s.cursor) : "全部时段";
  slider.setAttribute("aria-valuetext",$("#time-label").textContent);
  const monthly = group(ranged(photos),month);
  const largest = Math.max(1,...[...monthly.values()].map((items) => items.length));
  $("#bars").style.setProperty("--bar-gap", Math.min(2, 36 / Math.max(1,keys.length)) + "%");
  $("#bars").innerHTML = keys.map((key) => '<i title="' + key + '" class="' +
    (s.cursor && (s.mode === "period" ? key === s.cursor : key <= s.cursor) ? "lit" : "") +
    '" style="--height:' + Math.max(8,Math.sqrt(monthly.get(key).length/largest)*100) + '%"></i>').join("");
  $("#time-ends").innerHTML = keys.length ? '<span>' + dateLabel(keys[0]) + '</span><span>' + dateLabel(keys.at(-1)) + '</span>' : "";
  for (const b of document.querySelectorAll('[data-action="mode"]')) b.setAttribute("aria-pressed",String(s.mode === b.dataset.value));
}
function update() {
  const photos = activePhotos();
  const current = sliced(photos);
  const dates = current.map(day).filter(Boolean).sort();
  s.base = pointsOf(ranged(photos));
  s.points = pointsOf(current);
  const point = selected();
  if (!point) s.selected = null;
  s.records = journeys(point?.items || current);
  const cityCount = s.points.length;
  const geo = current.filter((p) => p.city).length;
  const years = [...new Set(photos.map((p) => day(p).slice(0,4)).filter(Boolean))].sort().reverse();
  $("#years").innerHTML = '<option value="">所有年份</option>' + years.map((year) =>
    '<option value="' + year + '">' + year + ' 年</option>').join("");
  $("#years").value = s.year;
  $("#range-note").textContent = dates.length ? dateLabel(dates[0]) + " — " + dateLabel(dates.at(-1)) : "虚构示例";
  $("#stats").innerHTML = [[cityCount,"记录区划"],[geo,"带地点的记录"],[current.length,"演示记录"]].map(([value,label]) =>
    '<div><strong>' + number(value) + '</strong><span>' + label + '</span></div>').join("");
  $("#unknown").disabled = Boolean(s.from || s.to || s.cursor);
  $("#map-count").textContent = cityCount + " 个区划";
  $("#map-hint").textContent = point ? "已选 " + point.name : "点击着色区域查看记录";
  $("#journey-count").textContent = s.records.length + " 段";
  $("#cities").innerHTML = cityList();
  $("#journeys").innerHTML = journalList();
  if ($("#year-index")) {
    const years = [...new Set(s.records.map((record) => record.start.slice(0,4)))];
    $("#year-index").hidden = !years.length;
    $("#year-index").innerHTML = '<p>年鉴索引</p><div>' + years.map((year) => button("jump-year",year,year,"outline")).join("") + '</div>';
  }
  $("#selected-clear").hidden = !s.selected;
  renderTime(photos);
  renderMap();
  renderHistory(photos);
  miniObserver?.disconnect();
  miniObserver = new IntersectionObserver((entries, watcher) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const record = s.records.find((item) => item.id === entry.target.dataset.journey);
      if (record) drawMap(entry.target,s.world,pointsOf(record.items),{mini:true,regions:regions(),domestic:s.scope === "domestic"});
      watcher.unobserve(entry.target);
    }
  }, {rootMargin:"100px"});
  for (const canvas of document.querySelectorAll(".mini-map")) miniObserver.observe(canvas);
}
let historyCache;
function renderHistory(photos) {
  const container=$("#history-content");
  if (historyCache?.data !== s.data || historyCache.scope !== s.scope) {
    historyCache={data:s.data,scope:s.scope,stats:historyStats(photos,s.data.cities),container:null};
  }
  if (historyCache.container === container) return;
  container.innerHTML=historyMarkup(historyCache.stats,s.scope,s.historyCity);
  historyCache.container=container;
}
function renderMap() {
  const canvas = $("#atlas-map");
  if (!canvas || !s.data) return;
  projection = drawMap(canvas,s.world,s.points,{design:s.design,base:s.base,camera:s.camera,
    regions:regions(),domestic:s.scope === "domestic",selected:s.selected});
  if (!projection) return;
  const {pos,width,height} = projection;
  const occupied = [];
  const labels = [];
  const ordered = [...s.points].sort((a,b) => Number(b.id === s.selected) - Number(a.id === s.selected) || b.items.length - a.items.length);
  for (const point of ordered) {
    const [x,y] = pos(point.lat,point.lon);
    if (x < 12 || x > width - 12 || y < 12 || y > height - 12) continue;
    const active = point.id === s.selected;
    if (width > 490 || point.items.length > 20 || active) {
      const labelWidth = Math.max(24,Array.from(point.name).length * 12 + 6);
      const positions = [[x-labelWidth/2,y-8],[x-labelWidth/2,y+9],[x-labelWidth/2,y-24]];
      const position = positions.find(([left,top]) => left > 1 && left + labelWidth < width - 2 && top > 1 && top + 16 < height &&
        !(left + labelWidth > width - 55 && top < 122) &&
        !occupied.some(([px,py,pw]) => Math.abs(py-top) < 16 && px < left + labelWidth && px + pw > left));
      if (position) {
        occupied.push([...position,labelWidth]);
        labels.push('<span style="left:' + position[0] + 'px;top:' + position[1] + 'px">' + esc(point.name) + '</span>');
      }
    }
  }
  $("#map-labels").innerHTML = labels.join("");
}
function mapDrag() {
  const canvas = $("#atlas-map");
  let drag;
  canvas.addEventListener("pointerdown", (event) => {
    if (!projection || event.button !== 0) return;
    drag = {x:event.clientX, y:event.clientY, ...projection.center};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || !projection) return;
    if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 4) return;
    drag.moved=true;
    s.camera.center = {lat:Math.max(-85,Math.min(85,drag.lat + (event.clientY-drag.y)/projection.scale)),
      lon:Math.max(-180,Math.min(180,drag.lon - (event.clientX-drag.x)/projection.scale))};
    renderMap();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!drag || drag.moved || !projection) return;
    const rect=canvas.getBoundingClientRect();
    const id=projection.hit(event.clientX-rect.left,event.clientY-rect.top);
    if (id) focusPlace(id,false);
  });
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
}

function pause() { clearInterval(s.timer); s.timer = null; }
function play() {
  if (s.timer) {pause(); update(); return;}
  const keys = months();
  if (!keys.length) return;
  let index = keys.indexOf(s.cursor);
  if (index < 0 || index === keys.length-1) index = 0;
  s.cursor = keys[index];
  s.selected = null;
  s.camera = {zoom:1,center:null};
  s.timer = setInterval(() => {
    if (index >= keys.length-1) pause();
    else s.cursor = keys[++index];
    update();
  },600);
  update();
}
function setRange(from,to,year="") {
  if (from && to && from > to) {
    toast("起始日期需要早于或等于截止日期");
    $("#from").value=s.from; $("#to").value=s.to;
    return;
  }
  pause();
  Object.assign(s,{from,to,year,cursor:null,selected:null,camera:{zoom:1,center:null},journeyLimit:40});
  $("#from").value=from; $("#to").value=to;
  update();
}
function focusPlace(id, zoom = true) {
  const point = s.points.find((p) => p.id === id);
  if (!point) return;
  s.selected = id;
  if (zoom) s.camera={zoom:.9,center:null,bounds:point.bounds};
  update();
}
function openDialog(title,html,kind) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = html;
  s.drawer = kind;
  if (!dialog.open) dialog.showModal();
}
function photoDialog(id) {
  const p = s.data.photos.find((item) => item.id === Number(id));
  if (!p) return;
  openDialog("示例记录",'<strong>' + esc(p.path) + '</strong><dl class="evidence-fields"><dt>日期</dt><dd>' +
    esc(dateLabel(day(p))) + '</dd><dt>行政区</dt><dd>' + esc(s.data.cities[p.city]?.name || "未归属") +
    '</dd><dt>来源</dt><dd>程序生成的虚构示例</dd></dl>',"photo");
}
function exportReport() {
  const html = makeReport(sliced(activePhotos()),s.data.cities,s.world,regions(),s.scope === "domestic");
  const url = URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));
  const link = document.createElement("a");
  link.href=url; link.download="照片足迹演示报告.html"; link.click();
  setTimeout(() => URL.revokeObjectURL(url),2000);
}
function photosDialog(page = 0, context = s.photoContext) {
  s.photoContext = context;
  const items = context?.type === "place" ? s.points.find((point) => point.id === context.id)?.items :
    context?.type === "journey" ? s.records.find((record) => record.id === context.id)?.items : sliced(activePhotos());
  const photos = [...(items || [])].sort((a,b) => (b.stamp || "").localeCompare(a.stamp || ""));
  const size = 30;
  const last = Math.max(0,Math.ceil(photos.length/size)-1);
  openDialog(context ? "示例记录列表" : "时段记录",'<p>' + photos.length + ' 张 · 第 ' + (page+1) + ' / ' + (last+1) + ' 页</p>' +
    photos.slice(page*size,(page+1)*size).map(evidence).join("") + '<div class="dialog-actions">' +
    (page > 0 ? button("photo-page","上一页",page-1,"outline") : "") +
    (page < last ? button("photo-page","下一页",page+1,"outline") : "") + '</div>',"photos");
}
document.addEventListener("click",(event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const {action,value} = control.dataset;
  try {
    if (action === "city") focusPlace(value);
    if (action === "clear-city") {s.selected=null;update();}
    if (action === "play") play();
    if (action === "mode") {s.mode=value;update();}
    if (action === "clear-time") {pause();s.cursor=null;s.selected=null;update();}
    if (action === "clear-filter") {s.unknown=true;$("#unknown").checked=true;setRange("","");}
    if (action === "fit") {s.camera={zoom:1,center:null};renderMap();}
    if (action === "zoom-in" || action === "zoom-out") {
      s.camera.zoom=Math.min(12,Math.max(.6,s.camera.zoom*(action === "zoom-in" ? 1.35 : 1/1.35)));
      renderMap();
    }
    if (action === "photos") photosDialog(0,null);
    if (action === "photo-page") photosDialog(Number(value));
    if (action === "place-photos" || action === "journey-photos") photosDialog(0,{type:action.split("-")[0],id:value});
    if (action === "more-journeys") {s.journeyLimit+=40;update();}
    if (action === "history") $("#history-panel").scrollIntoView({block:"start"});
    if (action === "history-year" || action === "history-place" || action === "visit-range") {
      const [first,second,third]=value.split("/");
      if (action === "visit-range") {
        setRange(first,second);
        focusPlace(third);
      } else {
        setRange(first+"-01-01",first+"-12-31",first);
        if (second) focusPlace(second);
      }
      $("#map-title").scrollIntoView({block:"start"});
    }
    if (action === "jump-year") {
      if (!$("#journal-" + value)) setRange(value + "-01-01",value + "-12-31",value);
      $("#journal-" + value)?.scrollIntoView({block:"start"});
    }
    if (action === "photo") photoDialog(value);
    if (action === "export") exportReport();
    if (action === "journey") {
      const record = s.records.find((r) => r.id === value);
      if (!record) return;
      setRange(record.start,record.end);
      const point = pointsOf(record.items)[0];
      if (point) focusPlace(point.id);
      $("#map-frame").scrollIntoView({block:"nearest"});
    }
  } catch (error) { toast(error.message); }
});
document.addEventListener("change",(event) => {
  const input = event.target;
  if (input.id === "scope") {
    s.scope=input.value;
    setRange(s.from,s.to,s.year);
  }
  if (input.id === "history-city") {
    s.historyCity=input.value;
    const city=historyCache.stats.cities.find((item) => item.id === s.historyCity);
    if (city) $("#visit-summary").innerHTML=visitMarkup(city);
  }
  if (input.id === "years") setRange(input.value ? input.value + "-01-01" : "",input.value ? input.value + "-12-31" : "",input.value);
  if (input.id === "from" || input.id === "to") setRange($("#from").value,$("#to").value);
  if (input.id === "unknown") {s.unknown=input.checked;update();}
});
document.addEventListener("input",(event) => {
  if (event.target.id !== "month-range") return;
  pause();
  s.cursor=months()[Number(event.target.value)-1] || null;
  s.selected=null;
  s.camera={zoom:1,center:null};
  update();
});
dialog.addEventListener("close",() => {s.drawer=null;});
window.addEventListener("hashchange",setDesign);

try {
  [s.data,s.world,s.domesticRegions] = await Promise.all([loadAsset("/demo.json"),loadAsset("/world.json"),loadAsset("/regions.json")]);
  setDesign();
} catch (error) {
  app.innerHTML='<p class="initial">' + esc(error.message) + '</p>';
  app.removeAttribute("aria-busy");
}

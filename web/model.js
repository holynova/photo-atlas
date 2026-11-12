export const day = (photo) => photo.stamp?.slice(0, 10) || "";
export const month = (photo) => day(photo).slice(0, 7);
export const dateLabel = (date) => date ? date.replaceAll("-", ".") : "日期未知";
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
export const basename = (path) => path.split(/[\\/]/).at(-1);

export function group(items, key) {
  const result = new Map();
  for (const item of items) {
    const id = key(item);
    if (!id) continue;
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(item);
  }
  return result;
}

const coordinateKey = (photo) => "@" + photo.lat.toFixed(1) + "," + photo.lon.toFixed(1);

export function places(photos, cities) {
  const matched = [...group(photos, (p) => p.city)].map(([id, items]) => ({...cities[id], items}));
  matched.sort((a,b) => b.items.length - a.items.length || a.name.localeCompare(b.name, "zh-CN"));
  return matched;
}

export function journeys(photos) {
  const ordered = photos.filter((p) => day(p) && (p.city || p.lat !== null)).sort((a,b) => a.stamp.localeCompare(b.stamp));
  const records = [];
  for (const photo of ordered) {
    const date = day(photo);
    const location = photo.city || coordinateKey(photo);
    const last = records.at(-1);
    const gap = last ? (Date.parse(date) - Date.parse(last.end)) / 86400000 : Infinity;
    if (!last || date.slice(0, 7) !== last.start.slice(0, 7) || gap > 2) {
      records.push({id:String(photo.id), start:date, end:date, items:[photo], locations:[location]});
    } else {
      last.end = date;
      last.items.push(photo);
      if (last.locations.at(-1) !== location) last.locations.push(location);
    }
  }
  return records.reverse();
}

export function journeyTitle(record, cities) {
  const names = record.locations.map((id) => cities[id]?.name || "未归属地点");
  const unique = names.filter((name, index) => index === 0 || name !== names[index - 1]);
  return unique.slice(0,4).join(" → ") + (unique.length > 4 ? " 等" : "");
}

const palettes = {
  map: {water:"#11272e", land:"#23454a", border:"#416569", grid:"#1e3941", pin:"#c1f98a"},
  journal: {water:"#e7eeeb", land:"#c3d3c8", border:"#9eafa4", grid:"#cedbd4", pin:"#ac4a2c"},
  timeline: {water:"#eaf0f9", land:"#d6e1f0", border:"#a9bad1", grid:"#d4dfef", pin:"#324ac3"}
};
function bounds(points, width, height, box) {
  if (box) {
    const [left,bottom,right,top] = box;
    return {lat:(bottom+top)/2,lon:(left+right)/2,scale:Math.min(width/Math.max(.12,right-left)/1.12,height/Math.max(.12,top-bottom)/1.12)};
  }
  if (!points.length) return {lat:23, lon:18, scale:Math.min(width / 365, height / 155)};
  const xs = points.map((p) => p.lon), ys = points.map((p) => p.lat);
  return {lat:(Math.min(...ys) + Math.max(...ys)) / 2, lon:(Math.min(...xs) + Math.max(...xs)) / 2,
    scale:Math.min(width / Math.max(12, Math.max(...xs) - Math.min(...xs) + 16),
                   height / Math.max(10, Math.max(...ys) - Math.min(...ys) + 12))};
}

const paths = new WeakMap();
function pathFor(feature) {
  if (paths.has(feature)) return paths.get(feature);
  const path = new Path2D();
  for (const polygon of feature.polygons) {
    for (const ring of polygon) {
      const [x,y] = ring[0];
      path.moveTo(x,y);
      for (let i = 1; i < ring.length; i++) path.lineTo(...ring[i]);
      path.closePath();
    }
  }
  paths.set(feature,path);
  return path;
}

export function drawMap(canvas, world, points, options = {}) {
  const {design = "journal", base = points, camera, mini = false, exported = false,
    regions = [], domestic = false, selected} = options;
  const palette = palettes[design];
  const width = exported ? 1050 : mini ? 144 : Math.round(canvas.clientWidth);
  const height = exported ? 470 : mini ? 86 : Math.round(canvas.clientHeight);
  if (!width || !height) return null;
  const dpr = exported ? 1 : Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const clip = camera?.bounds || (domestic && !mini ? [73,17,135.2,54] : null);
  const fit = bounds(base, width, height, clip);
  const center = camera?.center || fit;
  const scale = fit.scale * (camera?.zoom || 1);
  const pos = (lat, lon) => [width / 2 + (lon - center.lon) * scale, height / 2 - (lat - center.lat) * scale];
  ctx.fillStyle = palette.water;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  const step = scale > 20 ? 5 : scale > 8 ? 10 : 20;
  for (let lon = -180; lon <= 180; lon += step) {
    const [x] = pos(0, lon);
    ctx.moveTo(x, 0); ctx.lineTo(x, height);
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const [, y] = pos(lat, 0);
    ctx.moveTo(0, y); ctx.lineTo(width, y);
  }
  ctx.strokeStyle = palette.grid;
  ctx.stroke();
  ctx.fillStyle = palette.land;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = .7;
  for (const polygon of domestic ? [] : world) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([lon,lat], index) => {
        const [x,y] = pos(lat,lon);
        if (index) ctx.lineTo(x,y); else ctx.moveTo(x,y);
      });
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.stroke();
  }
  const lit = new Set(points.map((point) => point.id));
  const west = center.lon - width / (scale * 2), east = center.lon + width / (scale * 2);
  const south = center.lat - height / (scale * 2), north = center.lat + height / (scale * 2);
  const visible = regions.filter((region) => {
    const [left,bottom,right,top] = region.bounds;
    return (region.domestic || lit.has(region.id)) && (!domestic || region.domestic) &&
      right >= west && left <= east && top >= south && bottom <= north;
  });
  ctx.save();
  ctx.translate(width / 2,height / 2);
  ctx.scale(scale,-scale);
  ctx.translate(-center.lon,-center.lat);
  for (const region of visible) {
    if (lit.has(region.id)) continue;
    ctx.fillStyle = palette.land;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = .62 / scale;
    ctx.fill(pathFor(region),"evenodd");
    ctx.stroke(pathFor(region));
  }
  for (const region of visible) {
    if (!lit.has(region.id)) continue;
    const active = region.id === selected;
    ctx.fillStyle = palette.pin;
    ctx.strokeStyle = active ? palette.pin : palette.border;
    ctx.globalAlpha = active ? .96 : .78;
    ctx.lineWidth = (active ? 1.7 : .7) / scale;
    ctx.fill(pathFor(region),"evenodd");
    ctx.globalAlpha = 1;
    ctx.stroke(pathFor(region));
  }
  ctx.restore();
  function hit(x,y) {
    const lon = west + x/scale, lat = north - y/scale;
    ctx.save();
    ctx.resetTransform();
    const region = visible.find((item) => {
      const [left,bottom,right,top]=item.bounds;
      return lit.has(item.id) && lon >= left && lon <= right && lat >= bottom && lat <= top &&
        ctx.isPointInPath(pathFor(item),lon,lat,"evenodd");
    });
    ctx.restore();
    return region?.id;
  }
  if (exported && points.length < 25) {
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#172b26";
    for (const point of points) {
      const [x,y] = pos(point.lat,point.lon);
      ctx.fillText(point.name,x+6,y-4);
    }
  }
  return {pos,width,height,center,scale,hit};
}

export function makeReport(photos, cities, world, regions, domestic) {
  const points = places(photos, cities);
  const matched = points;
  const records = journeys(photos);
  const canvas = document.createElement("canvas");
  drawMap(canvas, world, points, {exported:true,regions,domestic});
  const dates = photos.map(day).filter(Boolean).sort();
  const range = dates.length ? dateLabel(dates[0]) + " — " + dateLabel(dates.at(-1)) : "日期未知";
  const rows = matched.map((p) => {
    const days = p.items.map(day).filter(Boolean).sort();
    return '<tr><td>' + esc(p.name) + '</td><td>' + p.items.length + '</td><td>' + dateLabel(days[0]) + '</td><td>' + dateLabel(days.at(-1)) + '</td></tr>';
  }).join("");
  const entries = records.map((r) => '<article><time>' + dateLabel(r.start) +
    (r.end !== r.start ? " — " + dateLabel(r.end) : "") + '</time><h3>' + esc(journeyTitle(r,cities)) + '</h3><p>' +
    r.items.length + ' 条演示记录</p><details><summary>查看示例记录</summary><ul>' + r.items.map((p) =>
    '<li>' + esc(p.path) + ' · ' + esc(dateLabel(day(p))) +
    '</li>').join("") + '</ul></details></article>').join("");
  return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>照片足迹演示报告</title>' +
    '<style>body{max-width:1040px;margin:3rem auto;padding:0 1rem;color:#23332b;background:#f7f5ed;font:16px/1.7 system-ui,sans-serif}h1{font-size:clamp(2rem,6vw,4rem);margin-bottom:0}h2{border-bottom:1px solid #ccc;padding-bottom:.4em;margin-top:2em}h3,p{margin:.3em 0}img{width:100%;display:block;margin-top:1rem}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:.4em;border-bottom:1px solid #ddd}article{border-bottom:1px solid #ddd;padding:1rem 0}li{overflow-wrap:anywhere}@media print{body{margin:0}}</style>' +
    '<body><h1>照片足迹演示报告</h1><p>' + range + ' · ' + photos.length + ' 条演示记录 · ' + matched.length +
    ' 个记录区划 · ' + (domestic ? "国内" : "全球") + '</p><img alt="照片足迹地图" src="' + canvas.toDataURL("image/png") +
    '"><small>区划边界 · Natural Earth</small><h2>行政区记录</h2>' +
    '<table><thead><tr><th>行政区</th><th>记录</th><th>首条日期</th><th>末条日期</th></tr></thead><tbody>' +
    rows + '</tbody></table><h2>行程年鉴</h2>' + (entries || '<p>当前范围没有同时具备日期与地点的记录。</p>') +
    '<p>此报告由虚构数据生成，仅用于演示。</p></body></html>';
}

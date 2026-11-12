import {day, dateLabel, esc} from "./model.js";

const DAY = 86400000;
const gap = (from,to) => Math.round((Date.parse(to)-Date.parse(from))/DAY);
const display = (n) => n.toLocaleString("zh-CN");
const byDays = (a,b) => b.days-a.days || b.photos-a.photos || a.name.localeCompare(b.name,"zh-CN");
const dateSpan = (start,end) => dateLabel(start) + (start === end ? "" : " – " + dateLabel(end));

function entry(map,id) {
  if (!map.has(id)) map.set(id,{dates:new Set(),photos:0});
  return map.get(id);
}

function periods(dates) {
  const visits = [];
  let best = null;
  let streak = null;
  for (const date of dates) {
    const last = visits.at(-1);
    const distance = last ? gap(last.end,date) : 0;
    if (!last || distance >= 30) visits.push({start:date,end:date,days:1,gap:distance});
    else {last.end=date;last.days++;}
    if (!streak || gap(streak.end,date) !== 1) streak={start:date,end:date,days:1};
    else streak={...streak,end:date,days:streak.days+1};
    if (!best || streak.days > best.days) best=streak;
  }
  return {visits,streak:best};
}

export function historyStats(photos,cities) {
  const all=new Map(), annual=new Map();
  for (const photo of photos) {
    const date=day(photo);
    if (!date || !photo.city || !cities[photo.city]) continue;
    const year=date.slice(0,4);
    if (!annual.has(year)) annual.set(year,new Map());
    for (const item of [entry(all,photo.city),entry(annual.get(year),photo.city)]) {
      item.dates.add(date);
      item.photos++;
    }
  }
  const details=[...all].map(([id,item]) => ({id,name:cities[id].name,days:item.dates.size,photos:item.photos,
    ...periods([...item.dates].sort())})).sort(byDays);
  const years=[...annual].sort(([a],[b]) => a.localeCompare(b)).map(([year,items]) => ({
    year,places:[...items].map(([id,item]) => ({id,name:cities[id].name,days:item.dates.size,photos:item.photos})).sort(byDays)
  }));
  const shifts=[];
  let previous=null;
  for (const year of years) {
    const first=year.places[0], second=year.places[1];
    if (first.days < 5 || first.days === second?.days) continue;
    if (previous && previous.place.id !== first.id) shifts.push({from:previous,to:{year:year.year,place:first}});
    previous={year:year.year,place:first};
  }
  let longest=null, longestGap=null;
  for (const city of details) {
    if (!longest || city.streak.days > longest.streak.days) longest=city;
    for (const visit of city.visits) {
      if (visit.gap && (!longestGap || visit.gap > longestGap.visit.gap)) longestGap={city,visit};
    }
  }
  return {cities:details,years,shifts,longest,longestGap};
}

function interval(days) {
  const years=days/365.2425;
  return days >= 365 ? "约 " + years.toFixed(1) + " 年 · " + display(days) + " 天" : display(days) + " 天";
}

function metric(label, name, description) {
  return '<article><span>' + label + '</span><strong>' + esc(name) + '</strong><small>' + esc(description) + '</small></article>';
}

export function historyMarkup(stats,scope,selected) {
  if (!stats.cities.length) return '<p class="empty">当前范围没有同时带日期和区划的记录。</p>';
  const leader=stats.cities[0], longest=stats.longest, largest=stats.longestGap;
  const metrics=metric("记录天数最多",leader.name,display(leader.days)+" 个不同拍摄日") +
    metric("连续记录最久",longest.name,longest.streak.days+" 天 · "+dateSpan(longest.streak.start,longest.streak.end)) +
    (largest ? metric("两段记录最久间隔",largest.city.name,interval(largest.visit.gap)) : "");
  const shifts=stats.shifts.length ? stats.shifts.map(({from,to}) =>
    '<li><span>' + from.year + ' · ' + esc(from.place.name) + ' <small>' + from.place.days + ' 天</small></span>' +
    '<b aria-hidden="true">→</b><span>' + to.year + ' · ' + esc(to.place.name) + ' <small>' + to.place.days + ' 天</small></span>' +
    (Number(to.year)-Number(from.year)>1 ? '<small>中间年份证据不足</small>' : "") + '</li>').join("") : "<li>暂未见主要记录地变化。</li>";
  const city=stats.cities.find((item) => item.id === selected) || leader;
  const options=stats.cities.map((item) => '<option value="' + esc(item.id) + '"' + (item.id===city.id ? " selected" : "") +
    '>' + esc(item.name) + ' · ' + item.days + ' 天</option>').join("");
  const annual=[...stats.years].reverse().map((record) => '<article class="annual-row"><div><button class="outline" data-action="history-year" data-value="' +
    record.year + '">' + record.year + ' 年</button><span>' + record.places.length + ' 个区划</span></div><div class="annual-places">' +
    record.places.map((item,index) => '<button class="' + (index===0 ? "lead-place" : "") +
      '" data-action="history-place" data-value="' + record.year + "/" + esc(item.id) + '">' + esc(item.name) +
      '<small>' + item.days + ' 天</small></button>').join("") + '</div></article>').join("");
  return '<div class="history-metrics">' + metrics + '</div><div class="history-columns"><section><h3>主要记录地变化</h3>' +
    '<p>每年以拍摄天数最多的区划为主要记录地。至少 5 天且无并列才纳入比较。</p><ol class="history-shifts">' + shifts +
    '</ol></section><section><h3>同一地点的多段记录</h3><label class="history-picker">查看区划<select id="history-city">' +
    options + '</select></label><div id="visit-summary">' + visitMarkup(city) + '</div></section></div><section class="history-years">' +
    '<h3>每年去过哪些地方</h3><p>按拍摄天数排序。点年份或区划可在地图中查看。</p>' + annual +
    '</section><p class="history-note">统计覆盖' + (scope==="domestic" ? "国内" : "全球") +
    '区划的所有年份。拍摄日只计实际有照片的日期，记录地变化仅供回看，此处使用虚构数据，无法确认居住时长、迁居或每次抵达和离开的日期。</p>';
}

export function visitMarkup(city) {
  return '<p>' + city.days + ' 个拍摄日 · ' + city.visits.length + ' 段。相邻拍摄日间隔至少 30 天时分段。</p>' +
    '<ol class="visit-list">' + [...city.visits].reverse().map((visit) =>
      '<li><button class="quiet" data-action="visit-range" data-value="' + visit.start + "/" + visit.end + "/" + esc(city.id) +
      '">' + dateSpan(visit.start,visit.end) + '</button><small>' + visit.days + ' 个拍摄日' +
      (visit.gap ? " · 距上一段 " + interval(visit.gap) : " · 首段") + '</small></li>').join("") + '</ol>';
}

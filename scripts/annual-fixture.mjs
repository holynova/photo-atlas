import {createLocator,reportGeography} from "../local/places.mjs";

const examples = [
  [121.4737,31.2304,"shanghai","梧桐树下的上海"],
  [120.1551,30.2741,"hangzhou","西湖春日"],
  [110.493,24.78,"yangshuo","阳朔 · 漓江薄雾"],
  [118.6757,24.8741,"quanzhou","泉州海边"],
  [114.3054,30.5931],
  [104.0665,30.5723],
  [118.7969,32.0603],
  [118.0894,24.4798],
  [139.6917,35.6895],
  [135.5023,34.6937],
  [126.9780,37.5665],
  [100.5018,13.7563],
  [2.3522,48.8566],
  [-122.4194,37.7749],
  [151.2093,-33.8688],
];
const overseas = [
  [2019,5,10,4,10],[2023,9,8,6,11],[2024,7,7,5,8],[2024,7,12,4,9],
  [2025,2,8,4,8],[2025,7,12,7,12],[2025,8,18,6,13],[2025,12,11,5,14],
];
const plans = [
  [1,82,9,0], [2,64,8,0], [3,126,13,1], [4,184,14,1], [5,123,11,0], [6,124,10,3],
  [7,98,11,0], [8,165,13,3], [9,129,12,0], [10,318,18,2], [11,193,14,0], [12,136,12,0],
];

export async function makeAnnualFixture() {
  const locate = await createLocator();
  const places = examples.map(([x,y])=>locate(x,y));
  if (places.some(place=>place?.level!=="city")) throw new Error("Demo city boundary missing");
  const photos = [];
  function add(date, placeIndex, image=false, device="iPhone 15 Pro") {
    const [, , thumb, caption] = examples[placeIndex] || [];
    const media = typeof image==="object" ? image : image && thumb ? {thumb,caption} : null;
    const id = photos.length + 1;
    photos.push({id,path:"DEMO-"+String(id).padStart(4,"0"),stamp:date?.toISOString() ?? null,status:"done",lat:null,lon:null,
      city:places[placeIndex]?.id ?? null,thumb:media ? media.thumb+".webp" : null,
      caption:media?.caption ?? null,camera:date ? device : null});
  }
  const abroadDays = new Set();
  for (const [year,month,start,length,place] of overseas) {
    for (let offset=0; offset<length; offset++) {
      const date = new Date(Date.UTC(year,month-1,start+offset,14));
      abroadDays.add(date.toISOString().slice(0,10));
      for (let minute=0; minute<7+offset; minute++) {
        add(new Date(date.getTime()+minute*60000),place,false,"iPhone 15 Pro");
      }
    }
  }
  for (let year=2017; year<2024; year++) {
    const place = year<=2019 ? 4 : year<=2021 ? 5 : 0;
    for (let month=1; month<=12; month++) {
      for (const d of [2,5,8,11,14,17,20,23,26,28]) {
        if (month===2 && d>=20) continue;
        if (abroadDays.has(new Date(Date.UTC(year,month-1,d)).toISOString().slice(0,10))) continue;
        for (let time=0; time<3+(year+month+d)%7; time++) {
          add(new Date(Date.UTC(year,month-1,d,10,time)),place,false,"iPhone");
        }
      }
      const holiday = month===2 ? 3 : month===7 && year%2===0 ? 6 : month===10 && year%2===1 ? 7 : -1;
      if (holiday<0) continue;
      for (let offset=0; offset<3; offset++) {
        for (let time=0; time<8; time++) add(new Date(Date.UTC(year,month-1,21+offset,14,time)),holiday);
      }
    }
  }
  for (const year of [2024,2025]) {
    for (const [month,total,days,main] of plans) {
      const size = year === 2025 ? total : Math.floor(total * .66);
      for (let i=0; i<size; i++) {
        const date = new Date(Date.UTC(year,month-1,2 + Math.floor(i%days*25/days),i%4===0?15:10,i%60));
        const image = year===2025 && (month===6 && i===9 ? {thumb:"quanzhou-june",caption:"泉州 · 初夏港口"} :
          i===0 && [4,8,10,11].includes(month));
        if (abroadDays.has(date.toISOString().slice(0,10))) continue;
        const chosen = image || i%7!==3 ? (i%5===0 && !image ? 0 : main) : -1;
        add(date,chosen,image,i%6===0?"RICOH GR III":"iPhone 15 Pro");
      }
    }
  }
  photos.sort((a,b)=>(a.stamp||"").localeCompare(b.stamp||""));
  add(null,-1);
  const marked = places.map(place=>[place.id,place]);
  return {version:2,kind:"demo",source:"示例照片库",photos,...reportGeography(new Map(marked)),
    sampleRoles:{
      [places[3].id]:[{role:"hometown",start:"",end:""}],
      [places[4].id]:[{role:"home",start:"2017-01-02",end:"2019-12-28"}],
      [places[5].id]:[{role:"home",start:"2020-01-02",end:"2021-12-28"}],
      [places[0].id]:[{role:"work",start:"2022-01-02",end:""}],
    },
    totals:{photos:photos.length,dated:photos.length-1,located:photos.filter(photo=>photo.city).length,failed:0}};
}

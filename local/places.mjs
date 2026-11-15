import {readFile} from "node:fs/promises";
import {promisify} from "node:util";
import {gunzip} from "node:zlib";

const fromAssets = file => new URL("../assets/"+file, import.meta.url);
const readJSON = async file => JSON.parse(await readFile(fromAssets(file), "utf8"));
const decompress = promisify(gunzip);
const readCompact = async file => JSON.parse((await decompress(await readFile(fromAssets(file)))).toString("utf8"));
const radians = Math.PI/180;
let cityData;
const readCities = () => cityData ??= Promise.all([
  readCompact("china-cities.json.gz"),readCompact("world-city-centers.json.gz"),
]);

export async function cityCatalog() {
  const [cities,points] = await readCities();
  return [
    ...cities.map(({id,name,lon,lat,province})=>[id,name,lon,lat,"CHN",province]),
    ...points.map(([id,name,lon,lat,country])=>["geo-"+id,name,lon,lat,country]),
  ];
}

function getBounds(polygon) {
  return polygon[0].reduce(([w,s,e,n],[x,y]) => [Math.min(w,x),Math.min(s,y),Math.max(e,x),Math.max(n,y)],
    [Infinity,Infinity,-Infinity,-Infinity]);
}

function insideRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function preparePlaces(places) {
  return places.map(place => {
    const parts = place.polygons.map(polygon => ({polygon,bounds:getBounds(polygon)}));
    place.bounds ??= [0,1,2,3].map(index => (index<2 ? Math.min : Math.max)(...parts.map(part => part.bounds[index])));
    return {place,parts};
  });
}

function includes([w,s,e,n],x,y) {
  return x>=w && x<=e && y>=s && y<=n;
}

function matchBoundary(entries, lon, lat) {
  for (const {place,parts} of entries) {
    if (!includes(place.bounds,lon,lat)) continue;
    for (const {polygon,bounds} of parts) {
      if (includes(bounds,lon,lat) && insideRing(polygon[0],lon,lat) &&
        !polygon.slice(1).some(ring=>insideRing(ring,lon,lat))) return place;
    }
  }
  return null;
}

function nearbyCities(points) {
  const buckets = new Map();
  const key = (country,x,y) => country + "/" + ((x+180+360)%360) + "/" + y;
  for (const point of points) {
    const [, , x, y, country] = point;
    const bucket = key(country,Math.floor(x),Math.floor(y));
    if (!buckets.has(bucket)) buckets.set(bucket,[]);
    buckets.get(bucket).push(point);
  }
  const names = new Map();
  return (lon,lat,country) => {
    // Only suggest a city within 15 km of its reference point and inside the resolved country.
    const lead = Math.cos(lat*radians);
    const radius = Math.min(180,.15/Math.max(.0001,lead));
    let best, bestScore = Infinity;
    for (let x=Math.floor(lon-radius); x<=Math.floor(lon+radius); x++) {
      for (let y=Math.floor(lat-.15); y<=Math.floor(lat+.15); y++) {
        for (const point of buckets.get(key(country,x,y)) || []) {
          const [, , px, py, , population] = point;
          const dx = ((px-lon+540)%360-180)*radians;
          const dy = (py-lat)*radians;
          const a = Math.sin(dy/2)**2 + lead*Math.cos(py*radians)*Math.sin(dx/2)**2;
          const km = 12742*Math.asin(Math.sqrt(Math.min(1,a)));
          const score = km + (population<100000 ? 2.5 : population<500000 ? 1 : 0);
          if (km<=15 && score<bestScore) { best = point; bestScore = score; }
        }
      }
    }
    if (!best) return null;
    const [id,name,x,y] = best;
    if (!names.has(id)) names.set(id,{id:"geo-"+id,name,lon:x,lat:y,country,domestic:false,level:"city",precision:"nearby"});
    return names.get(id);
  };
}

let locatorPromise;
export function createLocator() {
  locatorPromise ??= Promise.all([
    readCities(),readJSON("regions.json"),readJSON("countries.json"),
  ]).then(([[cities,centers],admin,world]) => {
    const exact = preparePlaces(cities);
    const domestic = preparePlaces(admin.map(place=>({...place,level:"region",precision:"boundary"})));
    const countries = preparePlaces(world.map(place=>({...place,level:"country",precision:"boundary"})));
    const nearest = nearbyCities(centers);
    return (lon,lat) => {
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon)>180 || Math.abs(lat)>90) return null;
      const region = matchBoundary(exact,lon,lat) || matchBoundary(domestic,lon,lat);
      if (region?.domestic) return region;
      const country = matchBoundary(countries,lon,lat);
      return (country && nearest(lon,lat,country.id.slice("country-".length))) || region || country;
    };
  });
  return locatorPromise;
}

export function reportGeography(places) {
  const cities = Object.fromEntries([...places].map(([key,{polygons,...meta}])=>[key,meta]));
  const regions = [...places.values()].filter(place=>place.polygons && (!place.domestic || place.level==="city"));
  return {cities,regions};
}

export async function upgradeGeography(index) {
  if (index.version!==1) return index;
  const locate = await createLocator();
  const places = new Map();
  const photos = index.photos.map(photo=>{
    const place = locate(photo.lon,photo.lat);
    if (place) {
      places.set(place.id,place);
      return {...photo,city:place.id};
    }
    if (photo.city && index.cities[photo.city]) {
      places.set(photo.city,index.regions.find(region=>region.id===photo.city) || index.cities[photo.city]);
    }
    return photo;
  });
  return {...index,...reportGeography(places),photos,totals:{...index.totals,located:photos.filter(photo=>photo.city).length}};
}

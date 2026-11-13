import {readFile, writeFile, copyFile, readdir, mkdir} from "node:fs/promises";
import {makeFixture} from "./fixtures.mjs";

const local = (path) => new URL("../"+path,import.meta.url);
const read = (path) => readFile(local(path),"utf8");
const write = (path,data) => writeFile(local("dist/"+path),data);
const publicWeb = ["app.js","style.css","model.js","history.js","favicon.ico","geo-vendor.js","geo-vendor.LICENSE","_headers"];
const filenames = [...publicWeb,"index.html","demo.json","world.json","regions.json"].sort();
const {version}=JSON.parse(await read("package.json"));
const regions=JSON.parse(await read("assets/regions.json"));
const fixture=makeFixture(regions);
if (!fixture.photos.every((p)=> /^DEMO-\d{4}$/.test(p.path) && p.lat===null && p.lon===null)) {
  throw new Error("Fixture contains unexpected evidence");
}
await mkdir(local("dist/"),{recursive:true});
const stale=(await readdir(local("dist/"))).filter((name)=>!filenames.includes(name));
if (stale.length) throw new Error("Unexpected deployment files: "+stale.join(", "));
for (const file of publicWeb) await copyFile(local("web/"+file),local("dist/"+file));
await copyFile(local("assets/world.json"),local("dist/world.json"));
await write("index.html",(await read("web/index.html")).replace("__VERSION__",version));
await write("regions.json",JSON.stringify(regions.filter((region)=>region.domestic)));
await write("demo.json",JSON.stringify(fixture));
console.log("Built v"+version+" with "+fixture.photos.length+" synthetic records and "+filenames.length+" allowlisted files.");

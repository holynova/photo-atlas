import {readFile, writeFile, copyFile, readdir, mkdir} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {makeFixture} from "./fixtures.mjs";
import {makeAnnualFixture} from "./annual-fixture.mjs";
import {annualImages,publicFiles,webFiles} from "./public-files.mjs";
import {makeFootprint} from "../web/footprint-model.js";
import {cityCatalog} from "../local/places.mjs";

const local = (path) => new URL("../"+path,import.meta.url);
const read = (path) => readFile(local(path),"utf8");
const write = (path,data) => writeFile(local("dist/"+path),data);
const filenames = new Set([...publicFiles,"_headers"]);
const {version}=JSON.parse(await read("package.json"));
const regions=JSON.parse(await read("assets/regions.json"));
const fixture=makeFixture(regions);
const annual=await makeAnnualFixture();
if ([fixture,annual].some(index=>!index.photos.every(photo=> /^DEMO-(?:\d+|NO-DATE)$/.test(photo.path) && photo.lat===null && photo.lon===null))) {
  throw new Error("Fixture contains unexpected evidence");
}
await mkdir(local("dist/annual/"),{recursive:true});
const entries = await readdir(local("dist/"),{recursive:true,withFileTypes:true});
for (const entry of entries) {
  const name = path.relative(fileURLToPath(local("dist/")),path.join(entry.parentPath,entry.name)).split(path.sep).join("/");
  if (!(entry.isFile() && filenames.has(name)) && !(entry.isDirectory() && name==="annual")) {
    throw new Error("Unexpected deployment file: "+name);
  }
}
for (const file of [...webFiles,"_headers"]) {
  if (file.endsWith(".html")) await write(file,(await read("web/"+file)).replaceAll("__VERSION__",version));
  else await copyFile(local("web/"+file),local("dist/"+file));
}
for (const file of ["world.json","countries.json","china-cities.LICENSE",...annualImages]) await copyFile(local("assets/"+file),local("dist/"+file));
await copyFile(local("dist/footprint.html"),local("dist/index.html"));
await write("regions.json",JSON.stringify(regions.filter((region)=>region.domestic)));
await write("demo.json",JSON.stringify(fixture));
await write("annual-demo.json",JSON.stringify(annual));
await write("footprint-demo.json",JSON.stringify(makeFootprint(annual)));
await write("city-boundaries.json",gunzipSync(await readFile(local("assets/china-cities.json.gz"))));
await write("city-catalog.json",JSON.stringify(await cityCatalog()));
console.log("Built v"+version+" with "+fixture.photos.length+" map records and "+annual.photos.length+" annual demo records.");

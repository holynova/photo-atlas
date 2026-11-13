import {copyFile, mkdir, readFile, stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const portfolioRoot = process.env.PHOTO_ATLAS_PORTFOLIO_DIR;
if (!portfolioRoot) {
  throw new Error("Set PHOTO_ATLAS_PORTFOLIO_DIR to the portfolio repository directory.");
}

const resolvedPortfolioRoot = path.resolve(portfolioRoot);
const gitDirectory = path.join(resolvedPortfolioRoot, ".git");
await stat(gitDirectory).catch(() => {
  throw new Error("PHOTO_ATLAS_PORTFOLIO_DIR must point to a Git working tree.");
});

const sourceDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const targetDirectory = path.join(resolvedPortfolioRoot, "photo-atlas");
const publicFiles = [
  "app.js",
  "demo.json",
  "favicon.ico",
  "geo-vendor.js",
  "geo-vendor.LICENSE",
  "history.js",
  "index.html",
  "model.js",
  "regions.json",
  "style.css",
  "world.json",
];

const fixture = JSON.parse(await readFile(path.join(sourceDirectory, "demo.json"), "utf8"));
if (!Array.isArray(fixture.photos) || !fixture.photos.every((photo) =>
  /^DEMO-\d{4}$/.test(photo.path) && photo.lat === null && photo.lon === null
)) {
  throw new Error("Refusing to publish a fixture containing non-demo or precise location data.");
}

const indexHtml = await readFile(path.join(sourceDirectory, "index.html"), "utf8");
if (/\b(?:src|href)="\/(?:app|style|geo-vendor|demo|world|regions)\./.test(indexHtml)) {
  throw new Error("The app index uses root-relative assets and would break under /photo-atlas/.");
}

await mkdir(targetDirectory, {recursive: true});
for (const filename of publicFiles) {
  await copyFile(path.join(sourceDirectory, filename), path.join(targetDirectory, filename));
}

console.log(`Published ${publicFiles.length} synthetic-demo files to ${targetDirectory}.`);

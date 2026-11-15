import {copyFile, mkdir, readFile, stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {publicFiles} from "./public-files.mjs";

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
for (const name of ["demo.json","annual-demo.json"]) {
  const fixture = JSON.parse(await readFile(path.join(sourceDirectory,name), "utf8"));
  if (!Array.isArray(fixture.photos) || !fixture.photos.every((photo) =>
    /^DEMO-(?:\d+|NO-DATE)$/.test(photo.path) && photo.lat === null && photo.lon === null
  )) {
    throw new Error("Refusing to publish a fixture containing non-demo or precise location data.");
  }
}

for (const page of publicFiles.filter(filename => filename.endsWith(".html"))) {
  const html = await readFile(path.join(sourceDirectory,page),"utf8");
  if (/\b(?:src|href)="\/(?!\/)/.test(html)) {
    throw new Error(page+" uses root-relative links that would break under /photo-atlas/.");
  }
}

await mkdir(path.join(targetDirectory,"annual"), {recursive: true});
for (const filename of publicFiles) {
  await copyFile(path.join(sourceDirectory, filename), path.join(targetDirectory, filename));
}

console.log(`Published ${publicFiles.length} synthetic-demo files to ${targetDirectory}.`);

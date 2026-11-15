import {createHash, randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {readdir, mkdir, realpath, stat, writeFile, rename, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import {ExifTool} from "exiftool-vendored";
import sharp from "sharp";
import {createLocator,reportGeography} from "./places.mjs";

const run = promisify(execFile);
const supported = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif"]);
const tags = ["DateTimeOriginal", "CreateDate", "CreationTime", "OffsetTimeOriginal", "OffsetTimeDigitized",
  "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef", "Make", "Model", "Orientation", "FileType", "Error"];
const fileTypes = new Set(["JPEG", "PNG", "HEIF", "HEIC"]);
export const dataRoot = path.resolve(process.env.PHOTO_ATLAS_DATA_DIR || (
  process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support", "Photo Atlas") :
    path.join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "photo-atlas")
));
export const validId = id => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);

export async function resolveFolder(input) {
  const raw = input.startsWith("~/") ? path.join(os.homedir(), input.slice(2)) : input;
  let folder;
  try {
    folder = await realpath(path.resolve(raw));
    if ((await stat(folder)).isDirectory()) return folder;
  } catch (error) {
    if (error.code === "EACCES" || error.code === "EPERM") throw new Error("没有读取这个目录的权限。");
  }
  throw new Error("找不到这个照片目录，请检查路径后重试。");
}

async function collectFiles(root, signal) {
  const files = [];
  const unreadable = [];
  const pending = [root];
  let skipped = 0;
  while (pending.length) {
    signal.throwIfAborted();
    const folder = pending.pop();
    let entries;
    try {
      entries = await readdir(folder, {withFileTypes:true});
    } catch (error) {
      if (folder === root) throw new Error("无法读取照片目录，请检查系统权限。", {cause:error});
      unreadable.push(path.relative(root, folder));
      continue;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.name.startsWith(".") || entry.isSymbolicLink() || /\.(?:photoslibrary|photolibrary)$/i.test(entry.name) || full === dataRoot) {
        skipped++;
      } else if (entry.isDirectory()) {
        pending.push(full);
      } else if (entry.isFile() && supported.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      } else {
        skipped++;
      }
    }
  }
  return {files:files.sort(), skipped, unreadable};
}

function readStamp(metadata) {
  for (const [field, offsetField] of [["DateTimeOriginal", "OffsetTimeOriginal"], ["CreateDate", "OffsetTimeDigitized"], ["CreationTime"]]) {
    const value = metadata[field];
    if (typeof value !== "string") continue;
    const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
    if (!match) continue;
    const [,year,month,day,hour,minute,second,embeddedOffset] = match;
    const stamp = year + "-" + month + "-" + day + "T" + hour + ":" + minute + ":" + second;
    const utc = new Date(stamp + "Z");
    if (Number(year) < 1800 || !Number.isFinite(utc.valueOf()) || utc.toISOString().slice(0,19) !== stamp) continue;
    const rawOffset = embeddedOffset || metadata[offsetField];
    const offset = typeof rawOffset === "string" && /^(Z|[+-](?:0\d|1[0-4]):?[0-5]\d)$/.test(rawOffset)
      ? rawOffset.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2") : "";
    return {stamp:stamp + offset, dateSource:field};
  }
  return {stamp:null, dateSource:null};
}

async function createPreview(file, target) {
  // The final sharp pass also strips tags from previews produced by macOS.
  const render = source => sharp(source, {autoOrient:true, limitInputPixels:100_000_000})
    .resize({width:1200, height:1200, fit:"inside", withoutEnlargement:true})
    .flatten({background:"#f5f3ea"}).jpeg({quality:78}).toFile(target);
  try {
    await render(file);
  } catch (error) {
    if (process.platform !== "darwin" || !/\.hei[cf]$/i.test(file)) throw error;
    const intermediate = target + ".sips.jpg";
    try {
      await run("/usr/bin/sips", ["-s", "format", "jpeg", "-Z", "1200", file, "--out", intermediate], {timeout:30000});
      await render(intermediate);
    } finally {
      await rm(intermediate, {force:true});
    }
  }
}

function coordinates(metadata) {
  const lat = metadata.GPSLatitudeRef === "S" ? -Math.abs(metadata.GPSLatitude) : metadata.GPSLatitude;
  const lon = metadata.GPSLongitudeRef === "W" ? -Math.abs(metadata.GPSLongitude) : metadata.GPSLongitude;
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
    ? {lat,lon} : {lat:null,lon:null};
}

export async function scanFolder(input, {id=randomUUID(), signal=new AbortController().signal, onProgress=()=>{}} = {}) {
  const root = await resolveFolder(input);
  const startedAt = new Date().toISOString();
  onProgress({phase:"discovering",source:path.basename(root) || root});
  const {files, skipped, unreadable} = await collectFiles(root, signal);
  if (!files.length) throw new Error("在这个目录里没有找到 JPEG、HEIC、HEIF 或 PNG 照片。");
  const locate = await createLocator();
  const totals = {found:files.length, processed:0, photos:0, dated:0, gps:0, located:0, previews:0,
    failed:0, previewFailed:0, skipped, unreadable:unreadable.length};
  const update = () => onProgress({phase:"scanning", totals:{...totals}});
  const photos = [];
  const places = new Map();
  const issues = unreadable.map(file => ({file, kind:"folder"}));
  const pending = path.join(dataRoot, "." + id);
  let reader;
  try {
    await mkdir(path.join(pending, "thumbs"), {recursive:true, mode:0o700});
    reader = new ExifTool({maxProcs:2, useMWG:false});
    update();
    let cursor = 0;
    const readWorker = async () => {
      while (!signal.aborted && cursor < files.length) {
        const file = files[cursor++];
        const relative = path.relative(root, file);
        try {
          const metadata = await reader.readRaw(file, {readArgs:["-n", ...tags.map(tag => "-" + tag)]});
          if (metadata.Error || !fileTypes.has(metadata.FileType)) throw new Error("Invalid photo");
          const coords = coordinates(metadata);
          const place = coords.lat === null ? null : locate(coords.lon, coords.lat);
          if (place) places.set(place.id, place);
          const photoId = createHash("sha256").update(relative).digest("hex").slice(0,24);
          const photo = {id:photoId, path:relative, ...readStamp(metadata), ...coords, city:place?.id || null,
            camera:metadata.Model || metadata.Make || null, orientation:metadata.Orientation || null, status:"done", thumb:null};
          try {
            await createPreview(file, path.join(pending, "thumbs", photoId + ".jpg"));
            photo.thumb = photoId + ".jpg";
            totals.previews++;
          } catch {
            // Some valid photos have a readable metadata header but no supported preview decoder.
            issues.push({file:relative, kind:"preview"});
            totals.previewFailed++;
          }
          photos.push(photo);
          totals.photos++;
          if (photo.stamp) totals.dated++;
          if (photo.lat !== null) totals.gps++;
          if (place) totals.located++;
        } catch {
          issues.push({file:relative, kind:"photo"});
          totals.failed++;
        }
        totals.processed++;
        update();
      }
    };
    await Promise.all(Array.from({length:Math.min(4,files.length)}, readWorker));
    signal.throwIfAborted();
    if (!photos.length) throw new Error("发现了照片文件，但没有成功读取任何一张。请检查文件格式或试试另一个目录。");
    photos.sort((a,b) => (a.stamp || "").localeCompare(b.stamp || "") || a.path.localeCompare(b.path));
    const info = {id,source:path.basename(root) || root, startedAt, finishedAt:new Date().toISOString(), totals};
    const libraryKey = createHash("sha256").update(root).digest("hex");
    const index = {version:2,kind:"local",...info,libraryKey,photos,issues,...reportGeography(places)};
    await writeFile(path.join(pending,"index.json"), JSON.stringify(index), {mode:0o600});
    await writeFile(path.join(pending,"summary.json"), JSON.stringify(info), {mode:0o600});
    signal.throwIfAborted();
    await rename(pending, path.join(dataRoot,id));
    return info;
  } finally {
    await reader?.end().catch(() => {});
    await rm(pending, {recursive:true,force:true});
  }
}

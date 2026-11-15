import {spawn} from "node:child_process";
import {parseArgs} from "node:util";
import {scanFolder,dataRoot} from "./scan.mjs";
import {startServer} from "./server.mjs";

const usage = `npm run local                       启动图形工具
npm run local -- --no-open          启动工具并打印本地地址
npm run scan -- "/照片目录"          扫描并打开报告
npm run scan -- "/照片目录" --no-open  扫描并打印本地报告地址
可加 --port 8766 指定监听端口，或加 --port 0 自动挑选可用端口。`;

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = platform === "win32" ? ["url.dll,FileProtocolHandler",url] : [url];
  const child = spawn(command,args,{stdio:"ignore"});
  child.on("error",() => {});
  child.unref();
}

async function main() {
  const {positionals:[mode,folder,...extra],values} = parseArgs({allowPositionals:true,
    options:{port:{type:"string",default:process.env.PHOTO_ATLAS_PORT || "8766"},
      "no-open":{type:"boolean"}, prototypes:{type:"boolean"}, help:{type:"boolean",short:"h"}}});
  if (values.help) return console.log(usage);
  if (extra.length || !["serve","scan"].includes(mode) || (mode === "scan" && !folder) || (mode === "serve" && folder)) {
    throw new Error(usage);
  }
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port > 65535) throw new Error("端口必须是 0–65535 的整数。");
  const {server,url} = await startServer(port,{prototypes:values.prototypes});
  let destination = url + (values.prototypes ? "/prototypes/scan/" : "/scan");
  try {
    if (mode === "scan") {
      const result = await scanFolder(folder,{onProgress:({phase,source,totals}) => {
        if (phase === "discovering") console.log("正在查找照片 · " + source);
        if (totals && (totals.processed === 0 || totals.processed % 100 === 0 || totals.processed === totals.found)) {
          console.log(`已处理 ${totals.processed}/${totals.found}，可用 ${totals.photos}，失败 ${totals.failed}`);
        }
      }});
      console.log("本地索引 · " + dataRoot + "/" + result.id + "/index.json");
      destination = url + "/annual.html?scan=" + result.id;
    }
    console.log("打开 " + destination);
    if (!values["no-open"]) openBrowser(destination);
  } catch (error) {
    server.close();
    throw error;
  }
}

main().catch(error => {
  console.error(error.code === "EADDRINUSE" ? "端口已被占用。已有工具可直接打开，也可用 --port 0 启动新实例。" : error.message);
  process.exitCode = 1;
});

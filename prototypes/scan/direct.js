import {session,running,esc,folderField,scanStatus} from "/scan-client.js";

export function direct() {
  const {job,busy,message} = session;
  return '<div class="direct-layout"><div class="direct-photo"><img src="/annual/yangshuo.webp" alt="" fetchpriority="high"><span>照片足迹 / 本地导入</span></div>'+
    '<section class="direct-card"><h1 tabindex="-1">从照片目录开始</h1>'+
    '<p>把散落在文件夹里的照片，变成一份能打开的年度报告。</p><form>'+
    folderField({button:"选目录…"})+
    '<p class="help">JPEG、HEIC、HEIF、PNG · 在这台电脑上处理</p>'+
    (!running(job) && job.phase!=="done" ? '<button type="submit" class="primary"'+(busy?" disabled":"")+'>扫描并生成报告 <span aria-hidden="true">→</span></button>' : '')+
    '</form>'+(message?'<p class="state-note" role="status">'+esc(message)+'</p>':'')+scanStatus(job)+
    (job.phase==="done"?'<button class="text-button" type="button" data-action="reset">再导入一个目录</button>':'')+
    '</section></div>';
}

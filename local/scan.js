import {session,running,esc,folderField,scanStatus,libraryList,bindSurface} from "/scan-client.js";

const scanner = document.querySelector("#scanner");
function render() {
  const {job,message,busy,libraries} = session;
  scanner.innerHTML = '<section class="basic-panel"><h1 tabindex="-1">扫描本地照片</h1>'+
    '<p>选择一个照片目录。照片和扫描结果保存在这台电脑。</p><form>'+
    folderField()+'<p class="help">支持 JPEG、HEIC、HEIF、PNG，包含子目录。</p>'+
    (!running(job) && job.phase!=="done" ? '<button type="submit" class="primary"'+(busy?" disabled":"")+'>开始扫描</button>' : '')+
    '</form>'+(message?'<p class="state-note" role="status">'+esc(message)+'</p>':'')+scanStatus(job)+
    (job.phase==="done"?'<button type="button" class="text-button" data-action="reset">再扫一个目录</button>':'')+'</section>'+
    '<section class="basic-library"><h2>已生成报告</h2>'+libraryList(libraries)+'</section>';
}
render();
bindSurface(scanner,{render});

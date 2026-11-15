import {session,running,esc,folderField,scanStatus,libraryList,number} from "/scan-client.js";

export function workspace() {
  const {job,busy,message,libraries} = session;
  const last = libraries[0];
  return '<div class="workspace-head"><div><h1 tabindex="-1">照片工作台</h1><p>扫描目录，管理这台电脑上的年度报告。</p></div><a class="secondary" href="/annual.html">报告示例 ↗</a></div>'+
    '<div class="workspace-grid"><section class="workspace-input"><h2>添加目录</h2><form>'+folderField()+
    '<p class="help">支持 JPEG、HEIC、HEIF、PNG · 递归读取</p>'+
    (!running(job)?'<button type="submit" class="primary"'+(busy?" disabled":"")+'>启动扫描</button>':'')+'</form>'+
    (message?'<p class="state-note" role="status">'+esc(message)+'</p>':'')+'</section>'+
    '<section class="workspace-job"><h2>当前任务</h2>'+
    (job.phase==="idle"?'<p class="muted">选择一个目录，扫描进度会显示在这里。</p>':scanStatus(job))+'</section>'+
    '<section class="workspace-library"><div class="library-head"><div><h2>已生成报告</h2>'+
    (last?'<p class="muted">最近扫描 · '+esc(last.finishedAt.slice(0,10))+'</p>':'')+'</div>'+
    '<span>'+number(libraries.length)+' 份报告</span></div>'+libraryList(libraries)+'</section></div>';
}

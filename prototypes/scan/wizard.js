import {session,running,esc,folderField,scanStatus} from "/scan-client.js";

let step = 0;
const steps = ["选择照片目录","确认扫描范围","查看报告"];

export function wizardAction(action) {
  if (action === "back") {
    step = Math.max(0,step-1);
  } else if (action === "next" || action === "submit") {
    if (!session.folder.trim()) {
      session.message = "请选择目录或填写本地目录路径。";
      session.changed();
      return true;
    }
    if (step === 1) {
      session.start();
      return true;
    }
    step = 1;
  } else if (action === "reset") {
    step = 0;
    session.reset();
    return true;
  } else {
    return false;
  }
  session.message = "";
  session.changed();
  document.querySelector("#stage h1")?.focus({preventScroll:true});
  return true;
}

export function wizard() {
  const {job,busy,message} = session;
  const active = running(job) || job.phase==="done" ? 2 : step;
  const content = [
    '<h1 tabindex="-1">照片放在哪里？</h1><p>请选择一个本地文件夹，里面的子目录也会一起扫描。</p>'+
    '<form>'+folderField({label:"目录位置"})+'<div class="wizard-actions"><button type="submit" class="primary"'+(busy?" disabled":"")+'>继续 →</button></div></form>',
    '<h1 tabindex="-1">确认扫描内容</h1><p>照片足迹会从这个目录读取拍摄时间、地点和相机信息。</p>'+
    '<dl class="review-list"><div><dt>目录</dt><dd>'+esc(session.folder)+'</dd></div><div><dt>格式</dt><dd>JPEG、HEIC、HEIF、PNG</dd></div>'+
    '<div><dt>处理方式</dt><dd>本地读取，生成报告和缩略图</dd></div></dl>'+
    '<div class="wizard-actions"><button class="text-button" type="button" data-action="back">← 上一步</button><button class="primary" type="button" data-action="next"'+
    (busy?" disabled":"")+'>开始扫描</button></div>'+scanStatus(job),
    '<h1 tabindex="-1">'+(job.phase==="done"?"你的照片报告准备好了":"正在整理照片")+'</h1>'+
    scanStatus(job)+(job.phase==="done"?'<button class="text-button" type="button" data-action="reset">导入另一个目录</button>':'')
  ][active];
  return '<div class="wizard-layout"><aside class="wizard-aside"><h2>导入照片</h2><ol>'+steps.map((label,index)=>
    '<li'+(index===active?' aria-current="step"':'')+'><span>'+(index<active?'✓':index+1)+'</span>'+label+'</li>').join("")+
    '</ol><p>照片和报告保存在本机。</p></aside><section class="wizard-card">'+content+
    (message?'<p class="state-note" role="status">'+esc(message)+'</p>':'')+'</section></div>';
}

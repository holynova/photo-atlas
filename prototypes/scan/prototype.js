import {bindSurface} from "/scan-client.js";
import {direct} from "./direct.js";
import {wizard,wizardAction} from "./wizard.js";
import {workspace} from "./workspace.js";

export const variants = [direct,wizard,workspace];
export function connect(stage, getCurrent) {
  bindSurface(stage,{
    render:()=>{ stage.innerHTML = variants[getCurrent()](); },
    onAction:action=>getCurrent() === 1 && wizardAction(action),
  });
}

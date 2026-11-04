import * as source from "./program.mjs.source.mjs";
export * from "./program.mjs.source.mjs";
import {readArtifact} from "./program.mjs.initial-state.mjs";
let initial;
const bytes=()=>initial??=(readArtifact(new URL("./program.mjs.initial.snapshot",import.meta.url),{"bytes":248,"file":"program.mjs.initial.snapshot","sha256":"61944f8bf7dc6b4788b8d2952c6f54be4f61014c43acb17ba5a48047ea4f46e2"}));
export async function restoreState(bytes){const state=source.createState();try{await state.restore(bytes);return state;}catch(error){state.dispose?.();throw error;}}
export async function createState(){return restoreState(await bytes());}

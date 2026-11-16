import archives from '../../versions/archives.json';
import {SaveError} from './saves';
import {SAVE_CONTRACT} from './save-contract';
import type {SaveStorage} from './save-storage';
import {tr,t} from '../i18n';
import {escapeHtml as esc} from '../cognition/help-ui';
export function saveErrorText(error:unknown):string{
 return error instanceof Error?t(error.message):t('存档校验未通过：格式或字段无效。');
}
export function saveErrorView(error:unknown):string{
 if(!error)return '';
 return `<div class="save-error" role="alert"><p>${esc(saveErrorText(error))}</p>${error instanceof SaveError&&error.kind==='incompatible'?`<p>${tr('当前规则：')}${esc(SAVE_CONTRACT.compatibilityId)}</p>${Object.entries(error.header).map(([k,v])=>`<p>${esc(k)}: ${esc(v)}</p>`).join('')}`:''}</div>`;
}
export function archiveHelp():string{
 return `<details class="archive-help"><summary>${tr('查看离线归档指引')}</summary><p>${tr('旧 v1 存档不能在本版本继续，包括原 0.18 正式档。请保留原 JSON，在对应 HTML 中打开。')}</p><p>${tr('v1 的 0.18 标签无法区分原画师候选与发布版；优先使用原导出对应的 HTML，不自动选择或迁移。')}</p><ul>${archives.archives.map(a=>`<li><p>${tr(a.label)}</p><a href="versions/${a.file}" download>${esc(a.file)}</a><p>${tr(a.limitations)}</p></li>`).join('')}</ul><p>${tr('配套 ZIP 中归档位于 versions 文件夹。若只有单个 HTML，请另行取得上述同名归档；相对链接不保证本地已有文件。本页不会上传存档或自动联网。')}</p></details>`;
}
export function rawRecordsView(store:SaveStorage,attr:'data-action'|'data-act'):string{
 try{
  const records=store.records();
  return `<section class="save-originals"><h3>${tr('保留原档与旧版记录')}</h3><p>${tr('这些下载保留槽中的原始字符串；与导出当前局不同，损坏记录也可取回。')}</p>${records.length?records.map(r=>`<div class="save-original"><p>${tr(r.kind==='current'?'当前槽原档':r.kind==='recovery'?'覆盖前恢复记录':'发现旧版记录')}<br><code>${esc(r.key)}</code></p><button class="secondary" ${attr}="raw-${encodeURIComponent(r.key)}">${tr('导出保留原档')}</button></div>`).join(''):`<p>${tr('未发现保留原档。')}</p>`}</section>`;
 }catch(error){return saveErrorView(error);}
}
/** Download initiation can fail; no storage is removed on either success or failure. */
export function downloadRaw(store:SaveStorage,key:string):void{
 try{
  const raw=store.raw(key),url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  try{const link=document.createElement('a');link.href=url;link.download=`${key.replace(/[^a-zA-Z0-9._-]/g,'_')}.json`;document.body.append(link);link.click();link.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }catch(error){if(error instanceof SaveError)throw error;throw new SaveError('storage','下载未能启动；原档仍保留，请检查浏览器下载设置。');}
}

/**
 * Inline MCP App, protocol 2026-01-26, no third-party scripts or network access.
 * Sources: https://developers.openai.com/plugins/build/chatgpt-ui and
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
 * Result _meta is widget-only. Never copy confirmationSecret into model context,
 * DOM attributes, localStorage, follow-up messages or diagnostic logs.
 */
export const CHAT_SYNC_RESOURCE_URI = 'ui://livestocks/screenshot-sync-v2.html';
export const CHAT_SYNC_RESOURCE_MIME = 'text/html;profile=mcp-app';
export const CHAT_SYNC_APP_HTML = String.raw`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>סקירת סנכרון LiveStocks</title>
<style>
:root{color-scheme:light dark;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--color-text-primary,CanvasText);background:var(--color-background-primary,Canvas);--line:var(--color-border-primary,color-mix(in srgb,CanvasText 13%,transparent));--muted:var(--color-text-secondary,color-mix(in srgb,CanvasText 58%,transparent));--soft:var(--color-background-secondary,color-mix(in srgb,CanvasText 4%,Canvas))}
*{box-sizing:border-box}body{margin:0;padding:20px}main{max-width:760px;margin:auto}.card-header{display:flex;gap:11px;align-items:center}.sync-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border:1px solid var(--line);border-radius:11px;color:var(--muted)}.sync-icon svg{width:18px;height:18px}h1{font-size:17px;line-height:1.35;font-weight:650;letter-spacing:-.25px;margin:0}p{margin:0}.muted,small{color:var(--muted)}#description{margin-top:3px;font-size:12px;line-height:1.6}.table-wrap{overflow:auto;max-height:300px;border:1px solid var(--line);border-radius:14px;margin:17px 0 12px}table{border-collapse:collapse;width:100%;font-size:14px;table-layout:fixed}caption{position:absolute;overflow:hidden;width:1px;height:1px;clip-path:inset(50%);white-space:nowrap}th,td{padding:11px 14px;text-align:right;border-bottom:1px solid var(--line);vertical-align:middle}th{position:sticky;top:0;background:var(--color-background-primary,Canvas);color:var(--muted);font-size:11px;line-height:1.45;font-weight:500;padding-top:9px;padding-bottom:9px}th:first-child{width:22%}th small{display:block;font-size:10px;font-weight:400;margin-top:1px}td:first-child{font-weight:650;letter-spacing:.2px}td small{font-size:11px;font-weight:400;letter-spacing:0;margin-top:3px}tr:last-child td{border-bottom:0}.numbers{white-space:nowrap;direction:ltr;display:inline-block;font-variant-numeric:tabular-nums;font-weight:550;letter-spacing:.15px}#unchanged,#blocked{font-size:12px;margin-top:8px}#blocked,#error{color:var(--color-text-danger,light-dark(#b42318,#ffb4ab))}.review-help{display:flex;align-items:baseline;justify-content:space-between;gap:6px 16px;flex-wrap:wrap}.date-note{font-size:11px;line-height:1.7}details{font-size:12px;color:var(--muted)}summary{cursor:pointer;list-style:none;width:fit-content;display:flex;align-items:center;gap:5px;border-radius:5px;padding:2px 0}summary::-webkit-details-marker{display:none}summary svg{width:12px;height:12px;transition:transform .15s ease}details[open] summary svg{transform:rotate(180deg)}details p{font-size:12px;line-height:1.7;margin-top:6px;max-width:620px}.actions{display:flex;gap:8px;align-items:center;margin-top:18px}button{font:inherit;font-size:13px;line-height:1.4;font-weight:550;border-radius:999px;min-height:40px;padding:9px 18px;cursor:pointer;border:1px solid transparent;background:transparent;color:inherit;transition:background .15s ease,opacity .15s ease}button.primary{background:var(--color-background-inverse,light-dark(#212121,#ececec));color:var(--color-text-inverse,light-dark(#fff,#171717))}button.primary:hover:not(:disabled){opacity:.86}#cancel{border-color:var(--line)}#cancel:hover:not(:disabled){background:var(--soft)}button:disabled{opacity:.4;cursor:default}button:focus-visible,summary:focus-visible{outline:2px solid var(--color-text-primary,CanvasText);outline-offset:3px}#status,#error{font-size:12px;line-height:1.7;margin-top:12px;padding:9px 12px;border-radius:10px;background:var(--soft)}#error{background:color-mix(in srgb,currentColor 7%,Canvas)}#status.success{font-weight:550;color:var(--color-text-success,light-dark(#18794e,#8dd7ad))}#privacy{display:block;font-size:10px;line-height:1.7;margin-top:10px}#unchanged:empty,#blocked:empty,#status:empty,#error:empty{display:none}[hidden]{display:none!important}
@media(max-width:420px){body{padding:15px}h1{font-size:16px}.sync-icon{width:32px;height:32px}th,td{padding-left:8px;padding-right:8px}th:first-child{width:21%}td{font-size:13px}.numbers{font-size:13px}.table-wrap{margin-top:15px}.review-help{gap:5px}.actions{margin-top:15px}button.primary{flex:1}#cancel{min-width:74px}#privacy{font-size:10px}}
@media(prefers-reduced-motion:reduce){button,summary svg{transition:none}}
</style></head><body><main aria-label="סקירת סנכרון">
<header class="card-header"><span class="sync-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg></span><div><h1>סנכרון ההחזקות</h1><p id="description" class="muted">טוען את ההצעה…</p></div></header>
<div id="review" hidden><div class="table-wrap"><table><caption>השינויים המוצעים</caption><thead><tr><th scope="col">מניה</th><th scope="col">כמות<small>לפני / אחרי</small></th><th scope="col">עלות למניה · USD<small>לפני / אחרי</small></th></tr></thead><tbody id="rows"></tbody></table></div><p id="unchanged" class="muted"></p><p id="blocked" role="alert"></p><div class="review-help"><small class="date-note">תאריך רכישה אפשר להשלים אחר כך בצ׳אט.</small><details><summary>היסטוריה וחישובי רווח<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg></summary><p>היתרה ובסיס העלות מתעדכנים; עסקאות העבר נשמרות. רווח ומס חסרים לא ינוחשו, ותאריך משוער נשאר מסומן כמשוער.</p></details></div></div>
<p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>
<div class="actions"><button id="confirm" class="primary" disabled>אישור וסנכרון</button><button id="cancel" disabled>ביטול</button></div>
<small id="privacy" class="muted">רק ההחזקות שבסקירה יעודכנו. מניות שלא מופיעות בצילום נשארות ללא שינוי.</small>
</main><script>
(function(){
'use strict';
var data=null, confirmationSecret='', ready=false, busy=false, completed=false, nextId=1, generation=0;
var pending=new Map();
var el=function(id){return document.getElementById(id);};
var number=function(value){return typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('he-IL',{maximumFractionDigits:4}):'—';};
function text(id,value){el(id).textContent=value;}
function notify(method,params){if(window.parent!==window)window.parent.postMessage({jsonrpc:'2.0',method:method,params:params},'*');}
function rpc(method,params){
  return new Promise(function(resolve,reject){
    var id=nextId++,timer=setTimeout(function(){pending.delete(id);reject(new Error('הבקשה לא הושלמה. אפשר לנסות שוב; אישור חוזר לא ייצור כפילות.'));},20000);
    pending.set(id,{resolve:resolve,reject:reject,timer:timer});
    window.parent.postMessage({jsonrpc:'2.0',id:id,method:method,params:params},'*');
  });
}
function size(){notify('ui/notifications/size-changed',{height:document.documentElement.scrollHeight,width:document.documentElement.clientWidth});}
function controls(){
  var expired=data&&data.expiresAt&&Date.parse(data.expiresAt)<=Date.now();
  var actionable=ready&&data&&data.status==='pending'&&confirmationSecret&&!completed&&!expired;
  el('confirm').disabled=busy||!actionable||!data.plan||!data.plan.canApply;
  el('cancel').disabled=busy||!actionable;
  if(expired&&!completed)text('status','פג תוקף ההצעה. בקשו בצ׳אט הצעה חדשה.');
}
function accept(result){
  if(!result||typeof result!=='object')return;
  var value=result.structuredContent;
  if(!value||typeof value!=='object')return;
  if(value.applied===true||value.status==='applied'){
    if(typeof value.proposalId!=='string'||(data&&value.proposalId!==data.proposalId))return;
    completed=true;confirmationSecret='';text('status','ההחזקות סונכרנו בהצלחה. היסטוריית העסקאות נשמרה.');el('status').className='success';controls();size();return;
  }
  if(value.status==='cancelled'){
    if(typeof value.proposalId!=='string'||(data&&value.proposalId!==data.proposalId))return;
    completed=true;confirmationSecret='';text('status','ההצעה בוטלה. לא נשמר שינוי.');controls();size();return;
  }
  if(value.status==='unchanged'||value.status==='needs_details'){
    generation+=1;data=null;confirmationSecret='';busy=false;completed=true;el('review').hidden=true;
    text('description',value.status==='unchanged'?'היתרות כבר תואמות.':'יש להשלים רק את הפרטים החסרים בצ׳אט.');
    text('status',value.status==='unchanged'?'לא נדרש שינוי.':((value.plan&&Array.isArray(value.plan.blocked))?value.plan.blocked.map(function(row){return row.symbol;}).join(', '):''));controls();size();return;
  }
  if(!value.plan||typeof value.proposalId!=='string')return;
  // Host globals can replay the original prepare after an action. An immutable
  // pending review must not erase its receipt/error or restore its capability.
  var sameProposal=data&&data.proposalId===value.proposalId;
  if(sameProposal&&value.status==='pending'&&(completed||busy||(data.status==='pending'&&confirmationSecret)))return;
  if(!sameProposal){generation+=1;busy=false;}else if(busy)return;
  data=value;completed=false;
  // Only the hidden result metadata supplies the mutation capability.
  confirmationSecret=result._meta&&typeof result._meta.confirmationSecret==='string'?result._meta.confirmationSecret:'';
  el('review').hidden=false;el('rows').replaceChildren();text('error','');text('status','');el('status').className='';
  var location=value.plan.location==='bank_two'?'בנק 2':'בנק 1';
  text('description',location+' · מצב ההחזקות נכון ל־'+(value.plan.observedAt||''));
  (Array.isArray(value.plan.changes)?value.plan.changes:[]).forEach(function(row){
    var tr=document.createElement('tr');
    [row.symbol,number(row.previousQuantity)+' → '+number(row.quantity),number(row.previousAverageCostUsd)+' → '+(row.quantity===0?'—':number(row.averageCostUsd))].forEach(function(value,index){
      var td=document.createElement('td'),span=document.createElement('bdi');span.textContent=String(value);if(index>0)span.className='numbers';td.appendChild(span);if(index===0&&(row.acquiredOn||row.estimatedAcquiredOn)){var date=document.createElement('small');date.style.display='block';date.textContent=row.acquiredOn?'נרכש: '+row.acquiredOn:'משוער: '+row.estimatedAcquiredOn;td.appendChild(date);}tr.appendChild(td);
    });el('rows').appendChild(tr);
  });
  var unchanged=Array.isArray(value.plan.unchanged)?value.plan.unchanged.length:0;
  text('unchanged',unchanged?unchanged+' החזקות תואמות ללא שינוי.':'');
  var blocked=Array.isArray(value.plan.blocked)?value.plan.blocked:[];
  text('blocked',blocked.length?'יש להשלים בצ׳אט פרטים עבור: '+blocked.map(function(row){return row.symbol;}).join(', '):'');
  if(value.status==='superseded')text('status','ההצעה הוחלפה. אשרו רק את הסקירה החדשה בצ׳אט.');
  if(!confirmationSecret&&value.status==='pending')text('status','אישור הסנכרון דורש חיבור עם הרשאת סנכרון. אין הרשאת כתיבה כללית.');
  controls();size();
}
function resultError(result){
  if(result&&result.isError){var first=Array.isArray(result.content)&&result.content.find(function(item){return item.type==='text';});throw new Error(first&&first.text?first.text:'הסנכרון לא הושלם.');}
  return result;
}
async function call(name,args){
  if(window.openai&&typeof window.openai.callTool==='function')return resultError(await window.openai.callTool(name,args));
  return resultError(await rpc('tools/call',{name:name,arguments:args}));
}
async function action(name){
  if(busy||completed||!data||!confirmationSecret)return;
  if(name==='confirm_screenshot_sync'&&el('confirm').disabled)return;
  var proposalId=data.proposalId,secret=confirmationSecret,actionGeneration=generation;
  busy=true;text('error','');text('status',name==='confirm_screenshot_sync'?'מסנכרן…':'מבטל…');controls();
  try{
    var result=await call(name,{proposalId:proposalId,confirmationSecret:secret});
    if(data&&data.proposalId===proposalId&&generation===actionGeneration){accept(result);if(!completed)throw new Error('לא התקבל אישור שמירה. נסו שוב או בקשו לבדוק את מצב ההצעה.');}
  }catch(error){if(data&&data.proposalId===proposalId&&generation===actionGeneration){text('status','');text('error',error&&error.message?error.message:'הבקשה לא הושלמה.');}}
  finally{if(generation===actionGeneration){busy=false;controls();size();}}
}
el('confirm').addEventListener('click',function(){void action('confirm_screenshot_sync');});
el('cancel').addEventListener('click',function(){void action('cancel_screenshot_sync');});
window.addEventListener('message',function(event){
  if(event.source!==window.parent||!event.data||event.data.jsonrpc!=='2.0')return;
  var message=event.data;
  if(message.id!==undefined&&pending.has(message.id)){
    var work=pending.get(message.id);clearTimeout(work.timer);pending.delete(message.id);
    if(message.error)work.reject(new Error(message.error.message||'החיבור למארח לא הושלם.'));else work.resolve(message.result);
    return;
  }
  if(message.method==='ui/notifications/tool-result')accept(message.params);
  if(message.method==='ui/notifications/tool-cancelled'){text('status','הבקשה בוטלה במארח. לא התקבל אישור שמירה.');busy=false;controls();}
  if(message.method==='ui/resource-teardown'&&message.id!==undefined){confirmationSecret='';completed=true;controls();window.parent.postMessage({jsonrpc:'2.0',id:message.id,result:{}},'*');}
});
function compatibilityResult(){
  var host=window.openai;if(!host)return;
  var metadata=host.toolResponseMetadata||{},envelope=metadata.mcp_tool_result||metadata.call_tool_result;
  if(envelope&&envelope.result)envelope=envelope.result;
  if(envelope)accept(envelope);
  else if(host.toolOutput)accept({structuredContent:host.toolOutput,_meta:metadata._meta||metadata});
  if(typeof host.callTool==='function'){ready=true;controls();}
}
window.addEventListener('openai:set_globals',compatibilityResult);
compatibilityResult();
if(window.parent!==window){
  rpc('ui/initialize',{appInfo:{name:'LiveStocks screenshot review',version:'1.0.0'},appCapabilities:{availableDisplayModes:['inline']},protocolVersion:'2026-01-26'}).then(function(){ready=true;notify('ui/notifications/initialized',{});controls();size();}).catch(function(){if(!ready){text('status','המארח אינו מאפשר אישור בתוך הצ׳אט כרגע. לא נשמר שינוי.');controls();}});
}else if(!ready){text('status','יש לפתוח את הסקירה מתוך ChatGPT כדי לאשר.');}
setInterval(controls,1000);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(size).observe(document.body);
})();
</script></body></html>`;

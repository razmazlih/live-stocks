/**
 * Inline MCP App, protocol 2026-01-26, no third-party scripts or network access.
 * Sources: https://developers.openai.com/plugins/build/chatgpt-ui and
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
 * Result _meta is widget-only. Never copy confirmationSecret into model context,
 * DOM attributes, localStorage, follow-up messages or diagnostic logs.
 */
export const CHAT_SYNC_RESOURCE_URI = 'ui://livestocks/screenshot-sync-v1.html';
export const CHAT_SYNC_RESOURCE_MIME = 'text/html;profile=mcp-app';
export const CHAT_SYNC_APP_HTML = String.raw`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>סקירת סנכרון LiveStocks</title>
<style>
:root{color-scheme:light dark;font:15px/1.5 system-ui,sans-serif;color:var(--color-text-primary,#172033);background:var(--color-background-primary,Canvas)}*{box-sizing:border-box}body{margin:0;padding:16px}main{max-width:760px;margin:auto}h1{font-size:19px;margin:0 0 6px}p{margin:8px 0}.muted,small{color:var(--color-text-secondary,#64748b)}.table-wrap{overflow:auto;max-height:340px;border:1px solid var(--color-border-primary,#cbd5e1);border-radius:12px;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;text-align:right;border-bottom:1px solid var(--color-border-primary,#e2e8f0)}th{position:sticky;top:0;font-weight:600;background:var(--color-background-secondary,#f1f5f9)}tr:last-child td{border:0}.numbers{white-space:nowrap;direction:ltr;display:inline-block}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}button{font:inherit;border-radius:10px;min-height:44px;padding:9px 18px;cursor:pointer;border:1px solid var(--color-border-primary,#94a3b8);background:var(--color-background-primary,Canvas);color:inherit}button.primary{background:var(--color-background-inverse,#172033);color:var(--color-text-inverse,#fff);border-color:transparent}button:disabled{opacity:.45;cursor:default}button:focus-visible,summary:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}details{font-size:13px;margin-top:12px}summary{cursor:pointer}#error{color:var(--color-text-danger,#b91c1c)}[hidden]{display:none!important}#status{min-height:24px}.success{font-weight:600;color:var(--color-text-success,#15803d)}@media(max-width:420px){body{padding:12px}th,td{padding:8px 6px;font-size:12px}.actions button{flex:1}}
</style></head><body><main aria-label="סקירת סנכרון">
<h1>סנכרון ההחזקות</h1><p id="description" class="muted">טוען את ההצעה…</p>
<div id="review" hidden><div class="table-wrap"><table><caption class="muted">השינויים המוצעים</caption><thead><tr><th scope="col">מניה</th><th scope="col">כמות לפני ← אחרי</th><th scope="col">עלות USD לפני ← אחרי</th></tr></thead><tbody id="rows"></tbody></table></div><p id="unchanged" class="muted"></p><p id="blocked" role="alert"></p><small>תאריך חסר? אפשר להשלים בצ׳אט — לא חובה.</small><details><summary>מה נשמר בחישובי הרווח?</summary><p>ההתאמה מעדכנת את היתרה ובסיס העלות בלבד. עסקאות העבר נשמרות. רווח ומס היסטוריים חסרים לא ינוחשו, ותאריך משוער לא יהפוך לתאריך רכישה מאומת.</p></details></div>
<p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>
<div class="actions"><button id="confirm" class="primary" disabled>אישור וסנכרון</button><button id="cancel" disabled>ביטול</button></div>
<small id="privacy" class="muted">רק היתרות המוצגות יעודכנו. מניות שאינן מופיעות בצילום לא יימחקו.</small>
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
  if(!data||data.proposalId!==value.proposalId){generation+=1;busy=false;}else if(busy)return;
  data=value;completed=false;
  // Only the hidden result metadata supplies the mutation capability.
  confirmationSecret=result._meta&&typeof result._meta.confirmationSecret==='string'?result._meta.confirmationSecret:'';
  el('review').hidden=false;el('rows').replaceChildren();text('error','');text('status','');
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

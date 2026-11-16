/**
 * Inline MCP App, protocol 2026-01-26, no third-party scripts or network access.
 * Sources: https://developers.openai.com/plugins/build/chatgpt-ui and
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
 * Result _meta is widget-only. Never copy confirmationSecret into model context,
 * DOM attributes, localStorage, follow-up messages or diagnostic logs.
 */
export const CHAT_SYNC_RESOURCE_URI = 'ui://livestocks/screenshot-sync-v4.html';
export const CHAT_SYNC_RESOURCE_MIME = 'text/html;profile=mcp-app';
export const CHAT_SYNC_APP_HTML = String.raw`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>סקירת סנכרון LiveStocks</title>
<style>
/* Shared palette: app/globals.css Liquid Glass semantic tokens. */
:root{color-scheme:light dark;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--surface:light-dark(#fff,#1c222d);--soft:light-dark(#f3f6fb,#222936);--ink:light-dark(#152238,#eef3fb);--muted:light-dark(#53647a,#bdc8d9);--line:light-dark(#dce4ef,#384150);--blue:light-dark(#2467dc,#78aaff);--blue-soft:light-dark(#edf4ff,#202f49);color:var(--ink);background:transparent}
*{box-sizing:border-box}body{margin:0;padding:12px}p{margin:0}main{max-width:760px;margin:auto;padding:24px;border:1px solid var(--line);border-radius:24px;background:radial-gradient(ellipse at 0 0,light-dark(#edf4ff,#202f49),transparent 65%),var(--surface);box-shadow:0 12px 40px -18px rgb(33 60 104 / .23),inset 0 1px 0 light-dark(#fff,#384150)}
.card-header{display:flex;align-items:center;gap:12px;margin-bottom:22px}.sync-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:15px;flex:none;background:#2467dc;color:#fff;box-shadow:0 6px 16px rgb(36 103 220 / .2)}.sync-icon svg{width:21px;height:21px}.eyebrow{color:var(--blue);font-size:11px;letter-spacing:.5px;font-weight:700;margin-bottom:3px}h1{font-size:24px;line-height:1.2;letter-spacing:-.8px;margin:0;font-weight:750}#description{font-size:12px;margin-top:7px;color:var(--muted)}.muted,small{color:var(--muted)}
.review-summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px}.summary-count{font-size:12px;color:var(--muted);font-weight:600}.summary-state{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--blue)}.summary-state:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.table-wrap{max-height:460px;overflow:auto;overscroll-behavior:contain;border-radius:18px}table{display:block;width:100%;border-spacing:0}tbody{display:grid;gap:12px}.sr-only,caption{position:absolute!important;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.holding-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--surface)}.holding-identity{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:16px;min-width:0}.ticker-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:var(--blue-soft);color:var(--blue);font-size:13px;font-weight:750;flex:none}.ticker-info{flex:1;min-width:0}.ticker-symbol{font-size:18px;letter-spacing:.4px;font-weight:750;overflow-wrap:anywhere}.acquisition-date{display:block;font-size:10px;margin-top:2px}.holding-kind{border:1px solid var(--line);border-radius:6px;padding:3px 7px;font-size:10px;color:var(--muted);flex:none}
.holding-stat{display:block;padding:5px 16px 18px;min-width:0}.holding-stat+.holding-stat{border-inline-start:1px solid var(--line)}.stat-label{font-size:11px;color:var(--muted);display:block;margin-bottom:6px}.comparison{display:flex;flex-direction:column;gap:8px}.comparison-value{min-width:0}.comparison-value bdi{direction:ltr;display:inline-block;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;max-width:100%}.after{order:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px}.after bdi{order:0;font-size:34px;line-height:1.15;font-weight:750;letter-spacing:-1px}.after small{order:1;font-size:10px;color:var(--blue)}.before{order:1;display:flex;align-items:baseline;gap:6px}.before small{font-size:10px}.before bdi{font-size:12px;color:var(--muted)}.change-arrow{display:none}
.holding-total{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;background:var(--blue-soft);border-top:1px solid var(--line);color:var(--muted);font-size:11px}.holding-total bdi{font-size:17px;font-weight:700;color:var(--blue);font-variant-numeric:tabular-nums}
.review-help{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-top:14px}.date-note,details{font-size:10px;color:var(--muted)}summary{cursor:pointer;display:flex;align-items:center;gap:5px;list-style:none;min-height:32px}summary::-webkit-details-marker{display:none}summary svg{width:12px;height:12px}details[open] summary svg{transform:rotate(180deg)}details p{font-size:12px;line-height:1.8;margin:6px 0;max-width:620px}
.actions{display:flex;gap:10px;margin-top:18px;align-items:center}button{font:inherit;font-size:13px;font-weight:650;min-height:46px;border:1px solid var(--line);border-radius:12px;padding:10px 18px;cursor:pointer;background:var(--surface);color:var(--muted)}button.primary{flex:1;background:#2467dc;color:white;border-color:#2467dc;box-shadow:0 4px 12px rgb(36 103 220 / .18)}button:hover:not(:disabled){filter:brightness(1.08)}button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
#status,#error{font-size:12px;line-height:1.8;margin-top:14px;border-radius:12px;padding:12px 14px;background:var(--soft)}#status.success{background:var(--blue-soft);color:var(--blue);border:1px solid var(--line);font-weight:600}#error,#blocked{color:light-dark(#b42318,#ffb4ab)}#unchanged,#blocked{font-size:12px;margin-top:12px}#privacy{display:block;font-size:10px;line-height:1.8;margin-top:14px;color:var(--muted)}#unchanged:empty,#blocked:empty,#status:empty,#error:empty{display:none}[hidden]{display:none!important}main[data-state="applied"] .actions,main[data-state="cancelled"] .actions{display:none}
@media(max-width:420px){body{padding:8px}main{padding:18px;border-radius:22px}h1{font-size:22px}.holding-identity{padding:14px}.holding-stat{padding:4px 14px 16px}.after bdi{font-size:31px}.holding-total{padding:12px 14px}.holding-total bdi{font-size:16px}.card-header{margin-bottom:20px}}
@media(max-width:340px){main{padding:14px}.holding-identity{gap:8px;flex-wrap:wrap}.holding-kind{font-size:9px}.holding-stat{padding-inline:10px}.after bdi{font-size:27px}.holding-total{flex-wrap:wrap;gap:4px}.review-summary{font-size:10px}}
</style></head><body><main aria-label="סקירת סנכרון">
<header class="card-header"><span class="sync-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg></span><div><p class="eyebrow" dir="ltr">LiveStocks</p><h1>עדכון ההחזקות</h1><p id="description" class="muted">טוען את ההצעה…</p></div></header>
<div id="review" hidden><div class="review-summary"><span id="summary-count" class="summary-count"></span><span id="summary-state" class="summary-state">ממתין לאישור שלך</span></div><div class="table-wrap"><table role="table"><caption>השינויים המוצעים</caption><thead class="sr-only" role="rowgroup"><tr role="row"><th role="columnheader" scope="col">מניה</th><th role="columnheader" scope="col">כמות מניות לפני ואחרי</th><th role="columnheader" scope="col">עלות למניה בדולר לפני ואחרי</th></tr></thead><tbody id="rows" role="rowgroup"></tbody></table></div><p id="unchanged" class="muted"></p><p id="blocked" role="alert"></p><div class="review-help"><small class="date-note">אפשר להשלים תאריך רכישה בצ׳אט.</small><details><summary>היסטוריה וחישובי רווח<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg></summary><p>בסיס העלות הוא כמות המניות כפול העלות למניה, ואינו שווי השוק הנוכחי. היתרה ובסיס העלות מתעדכנים; עסקאות העבר נשמרות. רווח ומס חסרים לא ינוחשו, ותאריך משוער נשאר מסומן כמשוער.</p></details></div></div>
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
    document.querySelector('main').dataset.state='applied';text('summary-state','הסנכרון הושלם');completed=true;confirmationSecret='';text('error','');text('confirm','סונכרן');text('status','ההחזקות סונכרנו בהצלחה. היסטוריית העסקאות נשמרה.');el('status').className='success';controls();size();return;
  }
  if(value.status==='cancelled'){
    if(typeof value.proposalId!=='string'||(data&&value.proposalId!==data.proposalId))return;
    document.querySelector('main').dataset.state='cancelled';text('summary-state','בוטל · ללא שינוי');completed=true;confirmationSecret='';text('error','');text('status','ההצעה בוטלה. לא נשמר שינוי.');controls();size();return;
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
  data=value;completed=false;document.querySelector('main').dataset.state='pending';text('summary-state','ממתין לאישור שלך');var changeCount=Array.isArray(value.plan.changes)?value.plan.changes.length:0;text('summary-count',changeCount===1?'החזקה אחת לעדכון':number(changeCount)+' החזקות לעדכון');
  // Only the hidden result metadata supplies the mutation capability.
  confirmationSecret=result._meta&&typeof result._meta.confirmationSecret==='string'?result._meta.confirmationSecret:'';
  el('review').hidden=false;el('rows').replaceChildren();text('error','');text('status','');el('status').className='';text('confirm','אישור וסנכרון');
  var location=typeof value.plan.sourceName==='string'?value.plan.sourceName:'';
  var observedDate=String(value.plan.observedAt||'').split('-');
  text('description',location+' · נכון ל־'+(observedDate.length===3?observedDate.reverse().join('.'):String(value.plan.observedAt||'')));
  (Array.isArray(value.plan.changes)?value.plan.changes:[]).forEach(function(row){
    var tr=document.createElement('tr');tr.className='holding-card';tr.setAttribute('role','row');
    var identity=document.createElement('td');identity.className='holding-identity';identity.setAttribute('role','cell');
    var avatar=document.createElement('span');avatar.className='ticker-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=String(row.symbol).slice(0,2);identity.appendChild(avatar);
    var info=document.createElement('span');info.className='ticker-info';var symbol=document.createElement('bdi');symbol.className='ticker-symbol';symbol.textContent=String(row.symbol);info.appendChild(symbol);
    if(row.acquiredOn||row.estimatedAcquiredOn){var date=document.createElement('small');date.className='acquisition-date';date.textContent=row.acquiredOn?'נרכש: '+row.acquiredOn:'משוער: '+row.estimatedAcquiredOn;info.appendChild(date);}identity.appendChild(info);
    var kind=document.createElement('span');kind.className='holding-kind';kind.textContent=row.quantity===0?'סגירת החזקה':row.previousQuantity===0?'החזקה חדשה':'עדכון החזקה';identity.appendChild(kind);tr.appendChild(identity);
    function stat(label,before,after){
      var cell=document.createElement('td');cell.className='holding-stat';cell.setAttribute('role','cell');var title=document.createElement('span');title.className='stat-label';title.textContent=label;cell.appendChild(title);
      var comparison=document.createElement('span');comparison.className='comparison';
      [['before','קיים',before],['after','אחרי הסנכרון',after]].forEach(function(item,index){
        if(index){var arrow=document.createElement('span');arrow.className='change-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='←';comparison.appendChild(arrow);}
        var part=document.createElement('span');part.className='comparison-value '+item[0];var hint=document.createElement('small');hint.textContent=item[1];var amount=document.createElement('bdi');amount.textContent=item[2];part.appendChild(hint);part.appendChild(amount);comparison.appendChild(part);
      });cell.appendChild(comparison);return cell;
    }
    tr.appendChild(stat('כמות מניות',number(row.previousQuantity),number(row.quantity)));
    tr.appendChild(stat('עלות למניה · USD',number(row.previousAverageCostUsd),row.quantity===0?'—':number(row.averageCostUsd)));var total=document.createElement('td');total.className='holding-total';total.setAttribute('role','cell');total.setAttribute('colspan','3');var totalLabel=document.createElement('span');totalLabel.textContent='בסיס עלות אחרי הסנכרון';var totalAmount=document.createElement('bdi');totalAmount.textContent=typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&(row.quantity===0||(typeof row.averageCostUsd==='number'&&Number.isFinite(row.averageCostUsd)))?number(row.quantity===0?0:row.quantity*row.averageCostUsd)+' USD':'—';total.appendChild(totalLabel);total.appendChild(totalAmount);tr.appendChild(total);el('rows').appendChild(tr);
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
  }catch{if(data&&data.proposalId===proposalId&&generation===actionGeneration){text('status','');text('error',name==='confirm_screenshot_sync'?'לא התקבל אישור שמירה. אפשר לנסות שוב בבטחה; לא ייווצר עדכון כפול.':'לא התקבל אישור ביטול. אפשר לנסות לבטל שוב או לבדוק את מצב ההצעה בצ׳אט.');if(name==='confirm_screenshot_sync')text('confirm','ניסיון חוזר');}}
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

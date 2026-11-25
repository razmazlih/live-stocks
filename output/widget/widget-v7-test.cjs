const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||require('node:path').join(__dirname,'Stocks Status.js');
const source=fs.readFileSync(file,'utf8');
class Node {
 constructor(){this.children=[];}
 addStack(){const x=new Node();this.children.push(x);return x;}
 addText(text){const x=new Node();x.text=text;this.children.push(x);return x;}
 addImage(image){const x=new Node();x.image=image;this.children.push(x);return x;}
 addSpacer(length){const x=new Node();x.spacer=true;x.length=length;this.children.push(x);}
 layoutVertically(){this.vertical=true;} layoutHorizontally(){this.vertical=false;} centerAlignContent(){} topAlignContent(){} rightAlignText(){} setPadding(){}
 async presentSmall(){} async presentMedium(){} async presentLarge(){} async presentExtraLarge(){}
}
const TOKEN='lst_widget_'+ 'a'.repeat(43);
const HOST='https://razmaz-live-stocks.vercel.app';
const fixture={widgetTokenExpiresAt:new Date(Date.now()+86400000).toISOString(),usdToIlsRate:3.7,summary:{totalValue:1000,totalNetPnLUsd:100,totalNetPnLIls:321,totalProjectedPnLUsd:40,totalProjectedPnLIls:134,totalForecastGapUsd:60,totalForecastGapIls:187},stocks:[{symbol:'AAA',quantity:2,currentPrice:100,totalValueUsd:200,totalValueIls:740,dailyChange:2,currentPnLUsd:10,currentPnLIls:37}]};
const texts=n=>[...(n.text!==undefined?[n.text]:[]),...n.children.flatMap(texts)];
function fingerprint(value) {
 let a=2166136261,b=3335557771;
 for(const char of value){a=Math.imul(a^char.charCodeAt(0),16777619)>>>0;b=Math.imul(b^char.charCodeAt(0),2246822519)>>>0;}
 return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
async function run(payload=fixture,{family='large',currency='ILS',mode,offline=false,cached=false,token=TOKEN,baseUrl=HOST,status=200,invalidJSON=false,runsInWidget=true,alerts=[],savedAt=new Date(Date.now()-60000).toISOString(),storage:newStorage,keys:newKeys,parameter=''}={}){
 const storage=newStorage||new Map(), keys=newKeys||new Map(),requests=[],shownAlerts=[];
 const key='livestocks.widget.v1:'+baseUrl;
 if(token&&!newKeys)keys.set(key,token);
 if(cached)storage.set(`stocks-glance-v4-${fingerprint(baseUrl)}-${fingerprint(token)}.json`,JSON.stringify({origin:baseUrl,identity:fingerprint(token),payload,expiresAt:payload.widgetTokenExpiresAt,savedAt}));
 const noop=class {constructor(...args){this.args=args;}};
 class Path {
  constructor(){this.points=[];}
  move(point){this.points.push(['move',...point.args]);}
  addLine(point){this.points.push(['line',...point.args]);}
 }
 class DrawContext {
  constructor(){this.strokes=[];this.dots=[];this.fills=[];}
  setLineWidth(){} strokeEllipse(){}
  setFillColor(color){this.fill=color;}
  setStrokeColor(color){this.color=color;}
  addPath(path){this.path=path;}
  fillPath(){this.fills.push({color:this.fill,points:this.path.points});}
  strokePath(){this.strokes.push({color:this.color,points:this.path.points});}
  fillEllipse(rect){this.dots.push({color:this.fill,rect:rect.args});}
  getImage(){return {strokes:this.strokes,dots:this.dots,fills:this.fills};}
 }
 class Color{constructor(hex,alpha){this.hex=hex;this.alpha=alpha;}static dynamic(a,b){return a;}}
 const context={config:{widgetFamily:family,runsInWidget},args:{widgetParameter:`currency=${currency};${mode ? 'mode='+mode+';' : ''}baseurl=${baseUrl};${parameter}`},Color,Font:new Proxy({},{get:()=>()=>({})}),Size:noop,Point:noop,Rect:noop,LinearGradient:noop,Path,DrawContext,SFSymbol:{named:()=>({image:{}})},ListWidget:Node,
 Request:class {constructor(url){this.url=url;requests.push(this)}async loadJSON(){if(offline)throw Error('offline');this.response={statusCode:status};if(invalidJSON)throw Error('invalid JSON');return payload}},
 Keychain:{contains:key=>keys.has(key),get:key=>{if(!keys.has(key))throw Error('Missing key');return keys.get(key)},set:(key,value)=>keys.set(key,value),remove:key=>keys.delete(key)},
 Alert:class {constructor(){this.mock=alerts.shift()||{choice:-1};this.actions=[];shownAlerts.push(this)}addAction(text){this.actions.push(text)}addDestructiveAction(text){this.actions.push(text)}addCancelAction(){}addSecureTextField(){this.secure=true}textFieldValue(){return this.mock.token||''}async presentAlert(){return this.mock.choice}async presentSheet(){return this.mock.choice}},
 FileManager:{local:()=>({documentsDirectory:()=>'',joinPath:(_,name)=>name,listContents:()=>Array.from(storage.keys()),remove:p=>storage.delete(p),fileExists:p=>storage.has(p),readString:p=>storage.get(p),writeString:(p,v)=>storage.set(p,v)})},Script:{setWidget(w){context.widget=w},name:()=> 'Stocks Status',complete(){}},console};
 const api=await vm.runInNewContext(`(async()=>{${source}\nreturn {normalize,cash,gapLabel,load,options,httpsOrigin,fingerprint,credentialKey,cacheLocation,setupCredential,disconnect};})()`,context);
 assert(context.widget); const rendered=texts(context.widget);assert(!rendered.some(s=>/NaN|Infinity|undefined/.test(s)));
 return {api,model:api.normalize(payload),rendered,storage,keys,requests,shownAlerts,widget:context.widget};
}
function stockLinks(node) {
 const own = typeof node.url === 'string' && node.url.includes('/stock/') ? [node.url] : [];
 return own.concat(node.children.flatMap(stockLinks));
}

function linkedSection(node, heading) {
 for (const child of node.children) {
  const found = linkedSection(child, heading);
  if (found) return found;
 }
 const links = stockLinks(node);
 return links.length && texts(node).includes(heading) ? links : null;
}

async function targetTests() {
 for (const family of ['small','medium','large','extraLarge']) {
  for (const currency of ['ILS','USD']) {
   for (const cached of [false,true]) {
    const {rendered,api} = await run(fixture,{family,currency,cached,offline:cached});
    const view = rendered.join(' ');
    assert.equal(api.options('').mode,'target');
    assert.match(view,/היעד האישי להיום/);
    assert.match(view,/מעל היעד/);
    assert(view.includes(currency==='ILS'?'₪187':'$60'),`unsigned target gap absent for ${family} ${currency}`);
    assert.match(view,/שווי התיק/);
    assert(view.includes(currency==='ILS'?'₪3,700':'$1,000'));
    assert.match(view,/2\.0%/);
    assert.equal(/נטו/.test(view),family!=='small');
    if(family!=='small') assert(view.includes(currency==='ILS'?'₪+15':'$+4'));
    if(cached) assert.match(view,/שמור/);
   }
  }
 }
 for(const [gap,direction] of [[-31,'מתחת ליעד'],[0,'בדיוק ביעד'],[-0.3,'בדיוק ביעד']]){
  const payload=structuredClone(fixture);
  payload.summary.totalForecastGapIls=gap;
  const {rendered}=await run(payload,{family:'small',mode:'target'});
  assert(rendered.join(' ').includes(direction));
  if(gap===-31) assert(rendered.join(' ').includes('₪31'));
 }
 const incomplete=structuredClone(fixture);
 incomplete.summary.totalNetPnLIls=null;
 incomplete.summary.totalForecastGapIls=null;
 incomplete.dataQuality={completeTransactionHistory:false};
 const missing=await run(incomplete,{family:'medium'});
 assert.match(missing.rendered.join(' '),/היסטורי/);
 assert.doesNotMatch(missing.rendered.join(' '),/מעל היעד|מתחת ליעד|בדיוק ביעד/);

 const many=structuredClone(fixture);
 many.stocks=[1,-9,3,8,5,-7,2,null].map((dailyChange,i)=>({
  ...fixture.stocks[0],symbol:'S'+i,dailyChange,quantity:1,totalValueUsd:100-i,
  totalValueIls:(100-i)*3.7,
 }));
 for(const [family,count] of [['large',3],['extraLarge',6]]){
  const out=await run(many,{family});
  const ranked=['S1','S3','S5','S4','S2','S6'].slice(0,count);
  const urls=symbols=>symbols.map(symbol=>HOST+'/stock/'+symbol);
  assert.deepEqual(linkedSection(out.widget,'מה הזיז את התיק היום'),urls(ranked));
  if(family==='extraLarge') assert.deepEqual(linkedSection(out.widget,'ההחזקות הגדולות'),urls(['S0','S1','S2']));
  assert(out.rendered.includes('כיסוי 7/8'));
 }
 const partial=await run(many,{family:'medium'});
 assert.match(partial.rendered.join(' '),/שינוי יומי אין נתון מלא/);
 console.log('PASS target layouts, directions, incomplete data, cache and contribution links.');
}
function nodes(root) {
 return [root,...root.children.flatMap(nodes)];
}

async function chartTests() {
 const day=86400000;
 const asOf=Date.UTC(2025,6,29,14);
 const point=(index,gapIls,gapUsd=12)=>({timestamp:asOf-(29-index)*day,gapIls,gapUsd});
 const payload={...fixture,timestamp:new Date(asOf).toISOString(),targetHistory:[
  point(-1,987),point(2,-4),point(3,-2),point(4,null),point(6,-1),
  point(28,3),point(29,6),point(30,999),
 ]};
 for (const family of ['small','medium','large','extraLarge']) {
  const out=await run(payload,{family});
  assert.deepEqual(JSON.parse(out.requests[0].body),{targetCurrency:'ILS',includeTargetHistory:true});
  const tree=nodes(out.widget);
  const image=tree.find(node=>node.image?.strokes && node.imageSize?.args[0]>100);
  assert(image, family+' chart is missing');
  assert.equal(image.image.strokes.length,3,'zero baseline, under-stroke and trend');
  const [axis,underStroke,line]=image.image.strokes;
  assert.deepEqual(underStroke.points,line.points,'dimensional stroke cannot offset the data');
  const [[,left,zero],[,right,zero2]]=axis.points;
  assert.equal(zero,zero2);
  assert(right>left);
  assert.deepEqual(line.points.map(p=>p[0]),['move','line','move','move','line'],'break line at omitted or null dates');
  assert(line.points[0][1]>left,'first observation must retain its calendar position');
  assert.equal(line.points.at(-1)[1],right,'today is the last horizontal coordinate');
  assert(line.points[0][2]>zero && line.points.at(-1)[2]<zero);
  assert.equal(image.image.dots.length,4,'one isolated observation and a three-layer endpoint');
  assert(image.image.fills.length>0);
  for(const area of image.image.fills){
   const xs=area.points.map(p=>p[1]);
   assert(Math.max(...xs)-Math.min(...xs)<=(right-left)/29+0.001,'area fill must respect the break in history');
  }
  assert.notEqual(image.image.dots.at(-1).color.hex,line.color.hex);
  const headerRow=tree.find(node=>node.children.some(child=>child.text==='היעד האישי להיום'));
  assert.equal(headerRow.vertical,false);
  assert(headerRow.children.at(-2).spacer && headerRow.children.at(-2).length===undefined);
 }
 const usd=await run(payload,{currency:'USD',family:'large'});
 const graph=nodes(usd.widget).find(node=>node.image?.strokes && node.imageSize?.args[0]>100).image;
 assert.equal(graph.strokes.length,2,'wholly positive USD series does not show zero axis');
 assert(!usd.rendered.some(t=>t.includes('─ היעד')));
 assert(graph.strokes[1].points.every(p=>p[2]===graph.strokes[1].points[0][2]),'constant series stays flat');
 for(const history of [undefined,[],[point(29,0)], [point(2,null),point(29,null)]]) {
  const out=await run({...payload,targetHistory:history});
  assert(!nodes(out.widget).some(node=>node.image?.strokes && node.imageSize?.args[0]>100));
  assert(out.rendered.includes('אין מספיק היסטוריה לגרף'));
 }
 const offline=await run(payload,{offline:true,cached:true});
 assert(nodes(offline.widget).some(node=>node.image?.strokes && node.imageSize?.args[0]>100));
 for (const mode of ['value','pnl']) {
  const legacy=await run(payload,{mode});
  assert.deepEqual(JSON.parse(legacy.requests[0].body),{targetCurrency:'ILS'});
  assert(!legacy.rendered.includes('הפער מהיעד · 30 יום'));
 }
 console.log('PASS dated chart geometry, RTL placement, currency isolation, request opt-in and offline history.');
}
async function regressionTests(){
 let assertions=0,renders=0;
 const check=(a,b)=>{assert.equal(a,b);assertions++};
 for(const currency of ['ILS','USD']){
  const key=currency==='ILS'?'Ils':'Usd'; const base=currency==='ILS'?187:60;
  let out=await run(fixture,{currency});check(out.model.forecastGap,base);check(out.model.pnl,currency==='ILS'?321:100);
  const exact=structuredClone(fixture);exact.summary[`totalForecastGap${key}`]=-25;out=await run(exact,{currency});check(out.model.forecastGap,-25);check(out.api.gapLabel(-25),'מתחת לתחזית');
  exact.summary[`totalForecastGap${key}`]=0;out=await run(exact,{currency});check(out.model.forecastGap,0);check(out.api.gapLabel(0),'בדיוק בתחזית');
  delete exact.summary[`totalForecastGap${key}`];out=await run(exact,{currency});check(out.model.forecastGap,base);
  for(const bad of [null,'',NaN,Infinity,'bad']){exact.summary[`totalForecastGap${key}`]=bad;out=await run(exact,{currency});check(out.model.forecastGap,base);}
  exact.summary[`totalProjectedPnL${key}`]=null;out=await run(exact,{currency});check(out.model.forecastGap,null);check(out.api.gapLabel(null),'אין נתון תחזית');
  exact.summary[`totalProjectedPnL${key}`]=0;exact.summary[`totalNetPnL${key}`]=0;out=await run(exact,{currency});check(out.model.forecastGap,0);
  exact.summary[`totalNetPnL${key}`]=null;out=await run(exact,{currency});check(out.model.forecastGap,null);
  exact.summary[`totalForecastGap${key}`]='12.5';out=await run(exact,{currency});check(out.model.forecastGap,12.5);check(out.api.gapLabel(12.5),'מעל התחזית');
  delete exact.usdToIlsRate;out=await run(fixture,{currency});check(out.model.forecastGap,base);
 }
 const noBasisDate=structuredClone(fixture);noBasisDate.stocks[0].currentPnLIls=null;check((await run(noBasisDate)).model.stocks[0].pnl,null);
 const noIls={summary:{totalNetPnLUsd:100,totalProjectedPnLUsd:40,totalForecastGapUsd:60},stocks:[],usdToIlsRate:3.7};
 check((await run(noIls)).model.forecastGap,null);check((await run(noIls)).model.pnl,null);
 const noFx=structuredClone(fixture);delete noFx.usdToIlsRate;check((await run(noFx)).model.forecastGap,187);check((await run(noFx)).model.pnl,321);
 for(const family of ['small','medium','large','extraLarge'])for(const currency of ['ILS','USD'])for(const mode of ['value','pnl'])for(const cached of [false,true]){
  const out=await run(fixture,{family,currency,mode,offline:cached,cached});renders++;
  assert(out.rendered.some(t=>/פער מהתחזית/.test(t)),`${family} forecast caption absent`);assertions++;
  assert(out.rendered.some(t=>/נטו/.test(t)),`${family} P/L caption absent`);assertions++;
  assert(out.rendered.some(t=>/מעל התחזית/.test(t)),`${family} direction absent`);assertions++;
  assert(out.rendered.some(t=>t.includes(currency==='ILS'?'₪+321':'$+100')),`${family} correct P/L absent`);assertions++;
  assert(out.rendered.some(t=>t.includes(currency==='ILS'?'₪+187':'$+60')),`${family} correct gap absent`);assertions++;
  if(cached){assert(out.rendered.some(t=>t.includes('שמור')));assertions++;}
 }
 for(const family of ['small','medium','large','extraLarge']){const out=await run(fixture,{family,offline:true});assert(out.rendered.includes('לא ניתן לטעון את התיק'));assertions++;renders++;}
 await targetTests();
 await chartTests();
 console.log(`PASS ${assertions} assertions, ${renders} family/currency/mode/cache renders plus targeted normalization scenarios.`);
}
module.exports={run,fixture,TOKEN,HOST,fingerprint};
if(require.main===module)regressionTests().catch(e=>{console.error(e);process.exit(1)});

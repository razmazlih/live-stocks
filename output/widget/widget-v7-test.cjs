const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||require('node:path').join(__dirname,'Stocks Status.js');
const source=fs.readFileSync(file,'utf8');
class Node {
 constructor(){this.children=[];}
 addStack(){const x=new Node();this.children.push(x);return x;}
 addText(text){const x=new Node();x.text=text;this.children.push(x);return x;}
 addImage(){const x=new Node();this.children.push(x);return x;}
 addSpacer(){} layoutVertically(){} layoutHorizontally(){} centerAlignContent(){} topAlignContent(){} rightAlignText(){} setPadding(){}
 async presentSmall(){} async presentMedium(){} async presentLarge(){} async presentExtraLarge(){}
}
const fixture={usdToIlsRate:3.7,summary:{totalValue:1000,totalNetPnLUsd:100,totalNetPnLIls:321,totalProjectedPnLUsd:40,totalProjectedPnLIls:134,totalForecastGapUsd:60,totalForecastGapIls:187},stocks:[{symbol:'AAA',quantity:2,currentPrice:100,totalValueUsd:200,totalValueIls:740,dailyChange:2,currentPnLUsd:10,currentPnLIls:37}]};
const texts=n=>[...(n.text!==undefined?[n.text]:[]),...n.children.flatMap(texts)];
async function run(payload=fixture,{family='large',currency='ILS',mode='value',offline=false,cached=false}={}){
 const storage=new Map(); if(cached) storage.set('cache',JSON.stringify({origin:'https://razmaz-live-stocks.vercel.app',payload,savedAt:'2026-11-02T00:00:00Z'}));
 const noop=class {constructor(...args){this.args=args;}};
 const draw=new Proxy(class {getImage(){return {}}},{construct(T,args){return new Proxy(new T(...args),{get(o,k){return k in o?o[k]:()=>{}}})}});
 class Color{constructor(hex,alpha){this.hex=hex;this.alpha=alpha;}static dynamic(a,b){return a;}}
 const context={config:{widgetFamily:family,runsInWidget:true},args:{widgetParameter:`currency=${currency};mode=${mode}`},Color,Font:new Proxy({},{get:()=>()=>({})}),Size:noop,Point:noop,Rect:noop,LinearGradient:noop,Path:class {move(){}addLine(){}},DrawContext:draw,SFSymbol:{named:()=>({image:{}})},ListWidget:Node,Request:class {async loadJSON(){if(offline)throw Error('offline');return payload}},FileManager:{local:()=>({documentsDirectory:()=>'',joinPath:()=> 'cache',fileExists:p=>storage.has(p),readString:p=>storage.get(p),writeString:(p,v)=>storage.set(p,v)})},Script:{setWidget(w){context.widget=w},complete(){}},console};
 const api=await vm.runInNewContext(`(async()=>{${source}\nreturn {normalize,cash,gapLabel,load};})()`,context);
 assert(context.widget); const rendered=texts(context.widget);assert(!rendered.some(s=>/NaN|Infinity|undefined/.test(s)));
 return {api,model:api.normalize(payload),rendered};
}
(async()=>{
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
 console.log(`PASS ${assertions} assertions, ${renders} family/currency/mode/cache renders plus targeted normalization scenarios.`);
})().catch(e=>{console.error(e);process.exit(1)});

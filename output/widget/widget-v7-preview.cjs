const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'Stocks Status.js'),'utf8');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class Node{constructor(type='stack'){this.type=type;this.children=[];this.dir='row'}addStack(){let n=new Node();this.children.push(n);return n}addText(t){let n=new Node('text');n.text=t;this.children.push(n);return n}addImage(i){let n=new Node('image');n.image=i;this.children.push(n);return n}addSpacer(v){let n=new Node('spacer');n.length=v;this.children.push(n)}layoutVertically(){this.dir='column'}layoutHorizontally(){this.dir='row'}centerAlignContent(){this.align='center'}topAlignContent(){this.align='flex-start'}setPadding(...p){this.pad=p}rightAlignText(){} }
class Size{constructor(width,height){this.width=width;this.height=height}}
const fonts=new Proxy({},{get:(_,k)=>size=>({size,weight:/bold/i.test(k)?700:/medium/i.test(k)?500:400})});
async function widget(family,dark,scenario){let result; class Color{constructor(hex,alpha=1){this.hex=hex;this.alpha=alpha}static dynamic(a,b){return dark?b:a}}
const fixture={summary:{totalValue:24000/3.6,totalNetPnLIls:3650,totalNetPnLUsd:3650/3.6,totalProjectedPnLIls:4800,totalProjectedPnLUsd:4800/3.6},usdToIlsRate:3.6,stocks:[['NVDA',12000,62],['MSFT',7500,-38],['AAPL',4500,18]].map(([symbol,value,daily])=>({symbol,quantity:10,currentPrice:value/36,totalValueUsd:value/3.6,totalValueIls:value,dailyChange:daily/36}))};
if(scenario==='missing'){fixture.summary.totalProjectedPnLIls=null;fixture.summary.totalProjectedPnLUsd=null}
if(scenario==='above'){fixture.summary.totalNetPnLIls=6200;fixture.summary.totalNetPnLUsd=6200/3.6}
class ListWidget extends Node{constructor(){super('widget');this.dir='column'}}
class Drawing{setStrokeColor(){}setLineWidth(){}strokeEllipse(){}addPath(){}strokePath(){}setFillColor(){}fillEllipse(){}getImage(){return {ring:true}}}
const ctx={config:{widgetFamily:family,runsInWidget:true},args:{widgetParameter:''},Color,Font:fonts,Size,Point:class{},Rect:class{},Path:class{move(){}addLine(){}},DrawContext:Drawing,LinearGradient:class{},SFSymbol:{named:n=>({image:{symbol:n}})},ListWidget,Request:class{async loadJSON(){return fixture}},FileManager:{local:()=>({documentsDirectory:()=>'',joinPath:()=>'',writeString(){},fileExists:()=>false})},Script:{setWidget(w){result=w},complete(){}}};
await vm.runInNewContext('(async()=>{'+source+'})()',ctx);return result;}
const col=c=>c?'#'+c.hex+(c.alpha<1?Math.round(c.alpha*255).toString(16).padStart(2,'0'):''):'inherit';
function render(n,axis='column'){
let css=['box-sizing:border-box','min-width:0'];
if(n.type==='spacer'){css.push(n.length===undefined?'flex:1 1 0':`flex:0 0 ${n.length}px`,`${axis==='row'?'width':'height'}:${n.length||0}px`);return `<i style="${css.join(';')}"></i>`}
if(n.type==='text'){css.push(`font-size:${n.font.size}px`,`font-weight:${n.font.weight}`,`color:${col(n.textColor)}`,'text-align:right','white-space:nowrap','line-height:1.18','overflow:hidden','flex-shrink:1');return `<span class="t" data-size="${n.font.size}" data-min="${n.minimumScaleFactor}" style="${css.join(';')}">${esc(n.text)}</span>`}
if(n.type==='image'){css.push(`width:${n.imageSize.width}px`,`height:${n.imageSize.height}px`,`color:${col(n.tintColor)}`,'flex-shrink:0');return `<span style="${css.join(';')}">▥</span>`}
css.push('display:flex',`flex-direction:${n.dir}`,`align-items:${n.dir==='column'?'stretch':n.align||'flex-start'}`,'flex-shrink:0');
if(n.pad)css.push('padding:'+n.pad.map(x=>x+'px').join(' '));
if(n.size?.width)css.push(`width:${n.size.width}px`);if(n.size?.height)css.push(`height:${n.size.height}px`);
if(n.backgroundColor)css.push(`background:${col(n.backgroundColor)}`);
if(n.backgroundGradient)css.push(`background:linear-gradient(135deg,${n.backgroundGradient.colors.map((c,i)=>col(c)+' '+n.backgroundGradient.locations[i]*100+'%').join(',')})`);
if(n.cornerRadius)css.push(`border-radius:${n.cornerRadius}px`);
if(n.borderWidth)css.push(`border:${n.borderWidth}px solid ${col(n.borderColor)}`);
if(n.backgroundImage)css.push('border:4px solid #82afff','border-radius:50%');
if(n.children.some(x=>x.type==='spacer'&&x.length===undefined)&&n.type!=='widget'&&!(axis==='row'?n.size?.width:n.size?.height))css.push('flex-grow:1','min-height:0');
return `<div class="${n.type}" style="${css.join(';')}">${n.children.map(c=>render(c,n.dir)).join('')}</div>`}
(async()=>{let cards='';for(const dark of [true,false])for(const [family,w,h] of [['small',155,155],['medium',329,155],['large',329,329],['extraLarge',715,345]])for(const scenario of ['below','above','missing']){cards+=`<section data-case="${family}-${dark?'dark':'light'}-${scenario}" class="${dark?'dark':'light'} ${scenario}" style="width:${w}px"><small>${family} · ${dark?'dark':'light'} · ${scenario}</small><div class="frame" style="width:${w}px;height:${h}px">${render(await widget(family,dark,scenario))}</div></section>`}
fs.writeFileSync(require('node:path').join(__dirname,'preview.html'),`<!doctype html><meta charset="utf-8"><style>body{background:#273143;color:#e9f0ff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:30px}.grid{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}.frame{border-radius:26px;overflow:hidden;box-shadow:0 15px 30px #0002}.widget{width:100%;height:100%;direction:rtl}.light,.above,.missing{display:none}small{display:block;margin-bottom:10px;color:#b6c4d8}h1{font-size:23px}p{font-size:13px;color:#b6c4d8}</style><h1>LiveStocks · רווח, הפסד והמרחק מהתחזית</h1><p>הדמיית הקוד · נתוני דוגמה · תצוגת Scriptable בפועל עשויה להשתנות</p><div class="grid">${cards}</div><script>window.fit=()=>document.querySelectorAll('.t').forEach(e=>{if(!e.offsetParent)return;let s=+e.dataset.size;while(e.scrollWidth>e.clientWidth+1&&s>e.dataset.size*e.dataset.min){s-=.25;e.style.fontSize=s+'px'}});fit();window.check=()=>[...document.querySelectorAll('section')].filter(e=>e.offsetParent).map(e=>({case:e.dataset.case,overflow:[...e.querySelectorAll('.t')].filter(t=>{let a=t.getBoundingClientRect(),b=e.querySelector('.frame').getBoundingClientRect();return a.bottom>b.bottom||a.right>b.right||a.left<b.left||t.scrollWidth>t.clientWidth+1}).map(t=>t.textContent)}))</script>`);})();

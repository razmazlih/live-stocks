const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'Stocks Status.js'), 'utf8');
const families = [
  ['large', 'גדול', 329, 329], ['small', 'קטן', 155, 155],
  ['medium', 'בינוני', 329, 155], ['extraLarge', 'גדול במיוחד', 715, 345],
];
const scenarios = {
  above: 'מעל היעד ביום ירידות', below: 'מתחת ליעד ביום עליות',
  exact: 'בדיוק ביעד', missing: 'היסטוריה חלקית', long: 'סכומים גדולים',
};
const escape = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

class Node {
  constructor(type = 'stack') {
    this.type = type;
    this.children = [];
    this.dir = type === 'widget' ? 'column' : 'row';
  }
  add(type, properties) {
    const child = Object.assign(new Node(type), properties);
    this.children.push(child);
    return child;
  }
  addStack() { return this.add('stack'); }
  addText(value) { return this.add('text', { value }); }
  addImage(image) { return this.add('image', { image }); }
  addSpacer(length) { return this.add('spacer', { length }); }
  layoutVertically() { this.dir = 'column'; }
  layoutHorizontally() { this.dir = 'row'; }
  centerAlignContent() { this.align = 'center'; }
  topAlignContent() { this.align = 'flex-start'; }
  setPadding(...padding) { this.padding = padding; }
  rightAlignText() {}
}
class ListWidget extends Node { constructor() { super('widget'); } }
class Size { constructor(width, height) { Object.assign(this, { width, height }); } }
const fonts = new Proxy({}, { get: (_, name) => size => ({
  size, weight: /bold/i.test(name) ? 700 : /medium/i.test(name) ? 500 : 400,
  numeric: /monospaced/i.test(name),
}) });

function fixture(scenario) {
  const fx = 3.6;
  const scale = scenario === 'long' ? 100000 : 1;
  const stocks = [
    ['NVDA', 25000, -180], ['AAPL', 22000, 72], ['MSFT', 17400, -118],
    ['GOOGL', 10000, 19], ['AMD', 7400, 34], ['META', 6200, -16],
  ].map(([symbol, value, movement]) => ({
    symbol, quantity: 10, currentPrice: value * scale / fx / 10,
    totalValueIls: value * scale, totalValueUsd: value * scale / fx,
    dailyChange: movement * scale * (scenario === 'below' ? -1 : 1) / fx / 10,
  }));
  const target = 8200 * scale;
  const gap = (scenario === 'below' ? -340 : scenario === 'exact' ? 0 : 1250) * scale;
  const pnl = target + gap;
  const missing = scenario === 'missing';
  return {
    usdToIlsRate: fx, widgetTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    dataQuality: { completeTransactionHistory: !missing }, stocks,
    summary: {
      totalValue: stocks.reduce((sum, stock) => sum + stock.totalValueUsd, 0),
      totalProjectedPnLIls: missing ? null : target, totalProjectedPnLUsd: missing ? null : target / fx,
      totalNetPnLIls: missing ? null : pnl, totalNetPnLUsd: missing ? null : pnl / fx,
      totalForecastGapIls: missing ? null : gap, totalForecastGapUsd: missing ? null : gap / fx,
    },
  };
}

async function widget(family, theme, scenario, currency) {
  let result;
  class Color {
    constructor(hex, alpha = 1) { Object.assign(this, { hex, alpha }); }
    static dynamic(light, dark) { return theme === 'dark' ? dark : light; }
  }
  const secrets = new Map([['livestocks.widget.v1:https://razmaz-live-stocks.vercel.app', 'lst_widget_' + 'a'.repeat(43)]]);
  const context = {
    Keychain: { contains: k => secrets.has(k), get: k => secrets.get(k), set: (k, v) => secrets.set(k, v) },
    config: { widgetFamily: family, runsInWidget: true }, args: { widgetParameter: 'currency=' + currency },
    Color, Font: fonts, Size, Point: class {}, LinearGradient: class {}, ListWidget,
    SFSymbol: { named: name => ({ image: { symbol: name } }) },
    Request: class { async loadJSON() { return fixture(scenario); } },
    FileManager: { local: () => ({ documentsDirectory: () => '', joinPath: () => '', listContents: () => [], writeString() {}, fileExists: () => false }) },
    Script: { setWidget(w) { result = w; }, complete() {} },
  };
  await vm.runInNewContext('(async()=>{' + source + '})()', context);
  return result;
}

const color = c => '#' + c.hex + (c.alpha < 1 ? Math.round(c.alpha * 255).toString(16).padStart(2, '0') : '');
const styles = new Map();
function styleClass(properties) {
  const css = properties.join(';');
  if (!styles.has(css)) styles.set(css, 's' + styles.size);
  return styles.get(css);
}

function render(node, axis = 'column') {
  const css = [];
  if (node.type === 'spacer') {
    css.push(node.length === undefined ? 'flex:1 1 0' : 'flex:0 0 ' + node.length + 'px');
    return '<i class="' + styleClass(css) + '"></i>';
  }
  if (node.type === 'text') {
    css.push('font-size:' + node.font.size + 'px', 'font-weight:' + node.font.weight, 'color:' + color(node.textColor));
    if (node.lineLimit > 1) css.push('white-space:normal', 'display:-webkit-box', '-webkit-box-orient:vertical', '-webkit-line-clamp:' + node.lineLimit);
    if (node.font.numeric) css.push('font-family:ui-monospace,monospace');
    return '<span dir="auto" class="t ' + styleClass(css) + '" data-size="' + node.font.size +
      '" data-min="' + node.minimumScaleFactor + '">' + escape(node.value) + '</span>';
  }
  if (node.type === 'image') {
    css.push('width:' + node.imageSize.width + 'px', 'height:' + node.imageSize.height + 'px', 'color:' + color(node.tintColor));
    return '<span class="' + styleClass(css) + '">▥</span>';
  }
  css.push('display:flex', 'flex-direction:' + node.dir, 'align-items:' + (node.dir === 'column' ? 'stretch' : node.align || 'flex-start'));
  if (node.padding) css.push('padding:' + node.padding.map(x => x + 'px').join(' '));
  if (node.size?.width) css.push('width:' + node.size.width + 'px');
  if (node.size?.height) css.push('height:' + node.size.height + 'px');
  if (node.backgroundColor) css.push('background:' + color(node.backgroundColor));
  if (node.backgroundGradient) css.push('background:linear-gradient(135deg,' + node.backgroundGradient.colors.map((c, i) => color(c) + ' ' + node.backgroundGradient.locations[i] * 100 + '%').join(',') + ')');
  if (node.cornerRadius) css.push('border-radius:' + node.cornerRadius + 'px');
  if (node.borderWidth) css.push('border:' + node.borderWidth + 'px solid ' + color(node.borderColor));
  if (node.type !== 'widget' && node.children.some(x => x.type === 'spacer' && x.length === undefined) && !(axis === 'row' ? node.size?.width : node.size?.height)) css.push('flex-grow:1');
  return '<div class="' + node.type + ' ' + styleClass(css) + '">' + node.children.map(child => render(child, node.dir)).join('') + '</div>';
}

async function main() {
  const cards = [];
  for (const theme of ['dark', 'light']) for (const currency of ['ILS', 'USD']) {
    for (const scenario of Object.keys(scenarios)) for (const [family, label, width, height] of families) {
      const tree = await widget(family, theme, scenario, currency);
      cards.push(`<section hidden data-case="${family}-${theme}-${currency}-${scenario}" data-filter="${theme}-${currency}-${scenario}"><h2>${label}</h2><div class="frame" style="width:${width}px;height:${height}px">${render(tree)}</div></section>`);
    }
  }
  const options = items => Object.entries(items).map(([value, title]) => `<option value="${value}">${title}</option>`).join('');
  const css = [...styles].map(([declarations, name]) => '.' + name + '{' + declarations + '}').join('\n');
  fs.writeFileSync(path.join(__dirname, 'preview.html'), `<!doctype html><html lang="he" dir="rtl">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LiveStocks · היעד האישי להיום</title>
<style>
*{box-sizing:border-box}body{margin:28px;background:#eeeef0;color:#242829;font:15px -apple-system,BlinkMacSystemFont,sans-serif}
h1{font-size:24px}h2,label{font-size:13px}h2{font-weight:500}.controls,.grid{display:flex;align-items:flex-start;flex-wrap:wrap;gap:20px}
.controls{margin:24px 0}select{font:inherit;margin-inline-start:6px}.frame{overflow:hidden;border-radius:23px;box-shadow:0 4px 16px #0002}
.widget,.stack,.t{min-width:0;min-height:0}.widget{direction:ltr;width:100%;height:100%}.stack{flex-shrink:0}
.t{text-align:right;white-space:nowrap;line-height:1.18;overflow:hidden}.grid{justify-content:flex-start}
${css}
</style><h1>LiveStocks · היעד האישי להיום</h1><p>הדמיית Scriptable עם נתוני דוגמה</p>
<form class="controls"><label>תרחיש<select id="scenario">${options(scenarios)}</select></label>
<label>תצוגה<select id="theme">${options({dark:'כהה',light:'בהירה'})}</select></label>
<label>מטבע<select id="currency">${options({ILS:'₪',USD:'$'})}</select></label></form>
<div class="grid">${cards.join('\n')}</div>
<script>
function show(){
 const filter=['theme','currency','scenario'].map(id=>document.getElementById(id).value).join('-');
 for(const card of document.querySelectorAll('section')){
   card.hidden=card.dataset.filter!==filter;
   if(card.hidden)continue;
   for(const label of card.querySelectorAll('.t')){
     let size=Number(label.dataset.size);
     const minimum=size*Number(label.dataset.min);
     label.style.fontSize=size+'px';
     while(label.scrollWidth>label.clientWidth+1 && size>minimum){
       size=Math.max(minimum,size-.25);label.style.fontSize=size+'px';
     }
   }
 }
}
document.querySelector('form').onchange=show;show();
</script></html>\n`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

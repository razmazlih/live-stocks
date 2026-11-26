import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'buy';
if (!['buy', 'sell', 'batch', 'screenshot'].includes(mode)) throw new Error('Use buy, sell, batch, or screenshot');
const source = await readFile(path.join(root, 'lib/chat-sync-app.ts'), 'utf8');
let html = source.match(/String\.raw`([\s\S]*)`;\s*$/)?.[1];
if (!html) throw new Error('Inline app template not found');
const icon = `data:image/png;base64,${(await readFile(path.join(root, 'public/brand/apple-touch-icon.png'))).toString('base64')}`;
html = html.replace('${CHAT_SYNC_BRAND_ICON_DATA_URI}', icon);
const location = '10000000-0000-4000-8000-000000000001';
const date = new Date().toISOString().slice(0, 10);
const input = { location, side: mode === 'sell' ? 'SELL' : 'BUY', symbol: 'TTWO', quantity: mode === 'sell' ? 2 : 6, priceUsd: mode === 'sell' ? 235 : 222, executedOn: date, commissionUsd: 1.5 };
const quantity = mode === 'sell' ? 4 : 6;
const average = mode === 'sell' || mode === 'screenshot' ? 222 : 222.25;
const plan = { location, sourceName: 'ONE ZERO · הדגמה', observedAt: date, canApply: true, changes: [{ symbol: 'TTWO', previousQuantity: mode === 'sell' ? 6 : 0, quantity, previousAverageCostUsd: mode === 'sell' ? 222 : null, averageCostUsd: average }], unchanged: [], blocked: [], warnings: [] };
const review = { proposalId: 'synthetic-preview', status: 'pending', kind: mode === 'screenshot' ? 'screenshot' : 'transaction', input, plan };
const portfolio = { status: 'available', fetchedAt: new Date().toISOString(), holdings: [{ symbol: 'TTWO', quantity, averageCostUsd: average, sourceName: 'ONE ZERO', location }, { symbol: 'AAPL', quantity: 5, averageCostUsd: 110, sourceName: 'ONE ZERO', location }, { symbol: 'MSFT', quantity: 7, averageCostUsd: 200, sourceName: 'חשבון נוסף', location: 'another-demo-source' }] };
const saved = { proposalId: 'synthetic-preview', kind: review.kind, status: 'applied', portfolio };
if (mode === 'batch') {
  const sale = { ...input, symbol: 'AAPL', side: 'SELL', quantity: 2, priceUsd: 200, commissionUsd: 2 };
  const salePlan = { ...plan, transaction: sale, changes: [{ symbol: sale.symbol, previousQuantity: 7, quantity: 5, previousAverageCostUsd: 110, averageCostUsd: 110 }] };
  review.input = { transactions: [input, sale] };
  review.plan = { canApply: true, transactions: [{ ...plan, transaction: input }, salePlan] };
  saved.transactions = [input, sale].map(transaction => ({ applied: true, transaction }));
}
const bridge = `/* Synthetic local preview only. No account, network or financial write. */
window.openai=${JSON.stringify({ toolOutput: review, toolResponseMetadata: { confirmationSecret: 'synthetic-only' } })};
window.openai.callTool=async function(name){await new Promise(function(resolve){setTimeout(resolve,700)});var receipt=${JSON.stringify(saved)};receipt.status=name.startsWith('cancel_')?'cancelled':'applied';return {structuredContent:receipt};};`;

html = html.replace('<script>', `<script>${bridge}`);
const target = path.join(root, 'output/playwright', `chat-review-${mode}.html`);
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, html);
console.log(target);

// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: chart-line;

/** LiveStocks • Personal portfolio glance, v9.0
 * Native small / medium / large / extraLarge layouts for Scriptable.
 * Parameters: currency=ILS|USD; mode=target|value|pnl; baseurl=https://your-host
 * Run in Scriptable to store a personal read-only token in native Keychain.
 * Never put a token in script source, widget parameters, or iCloud files.
 * Daily change is the latest quoted holding movement, not a live account return.
 * Daily change follows the API: prior close, or entry for positions opened today.
 * ILS daily movement converts USD movement at current FX; excludes FX movement.
 * Response update time is not the exchange quote time. No invented chart/history.
 */
const SETTINGS = { offlineMaxAge: 60 * 60 * 1000, baseUrl: "https://razmaz-live-stocks.vercel.app", refresh: 15, timeout: 15 };
const FAMILY = ["small", "medium", "large", "extraLarge"].includes(config.widgetFamily) ? config.widgetFamily : "medium";
const LARGE = FAMILY === "large" || FAMILY === "extraLarge";
const XL = FAMILY === "extraLarge";
const SMALL = FAMILY === "small";
function httpsOrigin(value) {
  // Scriptable does not guarantee the browser URL API. Accept an HTTPS origin only.
  const match = /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?\/?$/i.exec(String(value || ""));
  if (!match || match[2] && (+match[2] < 1 || +match[2] > 65535)) return null;
  return `https://${match[1].toLowerCase()}${match[2] && +match[2] !== 443 ? ":" + Number(match[2]) : ""}`;
}
function options(raw) {
  const out = { baseUrl: httpsOrigin(args.queryParameters && args.queryParameters.baseurl || SETTINGS.baseUrl), currency: "ILS", mode: "target" };
  String(raw || "").split(/[;\n]/).forEach(part => {
    const i = part.indexOf("=");
    if (i < 1) return;
    const k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim();
    if (["baseurl", "host", "url"].includes(k)) out.baseUrl = httpsOrigin(v);
    if (k === "currency" && /^(ILS|USD)$/i.test(v)) out.currency = v.toUpperCase();
    if (k === "mode" && /^(target|pnl|value)$/i.test(v)) out.mode = v.toLowerCase();
  });
  return out;
}
const OPTIONS = options(args.widgetParameter);
const C = {
  bg: Color.dynamic(new Color("F4F7FC"), new Color("0C1220")),
  ink: Color.dynamic(new Color("17243B"), new Color("F5F8FF")),
  muted: Color.dynamic(new Color("5D6B82"), new Color("A5B2CA")),
  card: Color.dynamic(new Color("FFFFFF"), new Color("172238")),
  line: Color.dynamic(new Color("DCE4F0"), new Color("2B3952")),
  accent: Color.dynamic(new Color("2459C4"), new Color("9BBDFF")),
  up: Color.dynamic(new Color("157148"), new Color("80E3B4")),
  down: Color.dynamic(new Color("B82F4D"), new Color("FFA4B6")),
  warning: Color.dynamic(new Color("965E0B"), new Color("F2C16E")),
};
const n = v => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
const ltr = s => `\u2066${s}\u2069`;
const tone = v => v === null || v === 0 ? C.muted : v > 0 ? C.up : C.down;
function number(v, digits = 0, sign = false) {
  if (v === null || !Number.isFinite(v)) return "—";
  const p = sign && v > 0 ? "+" : v < 0 ? "−" : "";
  return p + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function cash(v, compact = false, sign = false) {
  if (v === null) return ltr("—");
  let unit = "", scale = 1;
  if (compact && Math.abs(v) >= 1e6) { unit = "M"; scale = 1e6; }
  else if (compact && Math.abs(v) >= 1e4) { unit = "K"; scale = 1e3; }
  return ltr(`${OPTIONS.currency === "ILS" ? "₪" : "$"}${number(v / scale, scale > 1 ? 1 : 0, sign)}${unit}`);
}
const pct = v => ltr(v === null ? "—" : `${number(v, 1, true)}%`);
function text(parent, value, size = 11, color = C.ink, weight = "regular", numeric = false) {
  const t = parent.addText(String(value));
  t.font = numeric ? (weight === "bold" ? Font.boldMonospacedSystemFont(size) : Font.mediumMonospacedSystemFont(size)) : weight === "bold" ? Font.boldSystemFont(size) : weight === "medium" ? Font.mediumSystemFont(size) : Font.systemFont(size);
  t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.85; t.rightAlignText();
  return t;
}
function stack(parent, vertical = true) { const s = parent.addStack(); vertical ? s.layoutVertically() : s.layoutHorizontally(); if (!vertical) s.centerAlignContent(); return s; }
function panel(parent, pad = 12) { const s = stack(parent); s.backgroundColor = C.card; s.cornerRadius = 18; s.borderWidth = 0.5; s.borderColor = C.line; s.setPadding(pad, pad, pad, pad); return s; }
function rule(parent, gap = 6) { parent.addSpacer(gap); const s = stack(parent, false); s.size = new Size(0, 0.5); s.backgroundColor = C.line; parent.addSpacer(gap); }
function icon(parent, name, color, size = 12) { const sym = SFSymbol.named(name); const im = parent.addImage(sym.image); im.imageSize = new Size(size, size); im.tintColor = color; }
function sumKnown(list) { return list.length && list.every(v => v !== null) ? list.reduce((a, b) => a + b, 0) : null; }
function normalize(payload) {
  const s = payload.summary || {}, fx = n(payload.usdToIlsRate) ?? n(s.usdToIlsRate);
  const convert = usd => usd !== null && (OPTIONS.currency === "USD" || fx !== null && fx > 0) ? usd * (OPTIONS.currency === "USD" ? 1 : fx) : null;
  const source = Array.isArray(payload.stocks) ? payload.stocks : payload.topStocks || [];
  const groups = new Map();
  source.forEach(raw => {
    if (!raw || typeof raw !== "object") return;
    const symbol = String(raw.symbol || "").trim().toUpperCase();
    const q = n(raw.quantity);
    if (!symbol || q !== null && q <= 0) return;
    const daily = n(raw.dailyChange), usdValue = n(raw.totalValueUsd);
    const item = { symbol, value: OPTIONS.currency === "ILS" ? n(raw.totalValueIls) ?? convert(usdValue) : usdValue,
      pnl: OPTIONS.currency === "ILS" ? n(raw.currentPnLIls) : n(raw.currentPnLUsd),
      daily: daily !== null && q !== null ? convert(daily * q) : null,
      // Base value includes entry price for new positions, matching API semantics.
      base: daily !== null && q !== null && n(raw.currentPrice) !== null ? convert((n(raw.currentPrice) - daily) * q) : null };
    if (!groups.has(symbol)) groups.set(symbol, []);
    groups.get(symbol).push(item);
  });
  const stocks = Array.from(groups.entries()).map(([symbol, rows]) => {
    const value = sumKnown(rows.map(r => r.value)), daily = sumKnown(rows.map(r => r.daily)), base = sumKnown(rows.map(r => r.base));
    return { symbol, value, daily, base, pnl: sumKnown(rows.map(r => r.pnl)), dailyPercent: daily !== null && base > 0 ? daily / base * 100 : null };
  });
  const full = Array.isArray(payload.stocks);
  const value = convert(n(s.totalValue)) ?? (full ? sumKnown(stocks.map(r => r.value)) : null);
  const pnl = OPTIONS.currency === "ILS" ? n(s.totalNetPnLIls) : n(s.totalNetPnLUsd);
  // Same-currency authoritative gap includes realized P/L and the API tax model.
  const projected = n(OPTIONS.currency === "ILS" ? s.totalProjectedPnLIls : s.totalProjectedPnLUsd);
  const reportedGap = n(OPTIONS.currency === "ILS" ? s.totalForecastGapIls : s.totalForecastGapUsd);
  const forecastGap = reportedGap ?? (pnl !== null && projected !== null ? n(pnl - projected) : null);
  const known = stocks.filter(r => r.daily !== null);
  const complete = full && stocks.length > 0 && known.length === stocks.length;
  const daily = complete ? sumKnown(stocks.map(r => r.daily)) : null;
  const base = complete ? sumKnown(stocks.map(r => r.base)) : null;
  const ranked = stocks.slice().sort((a, b) => {
    if (a.daily === null && b.daily !== null) return 1;
    if (a.daily !== null && b.daily === null) return -1;
    return Math.abs(b.daily ?? 0) - Math.abs(a.daily ?? 0) || (b.value ?? 0) - (a.value ?? 0);
  });
  const largest = stocks.slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return { value, pnl, projected, forecastGap, daily, dailyPercent: daily !== null && base > 0 ? daily / base * 100 : null,
    stocks, ranked, known: known.length, full, fx, largest,
    incompleteHistory: payload.dataQuality && payload.dataQuality.completeTransactionHistory === false,
    concentration: full && stocks.every(r => r.value !== null && r.value >= 0) && largest && largest.value !== null && value > 0 ? largest.value / value * 100 : null,
    winners: known.filter(r => r.daily > 0).length, losers: known.filter(r => r.daily < 0).length };
}
function fingerprint(value) {
  // Non-secret cache identity only; authorization always uses the full opaque token.
  let a = 2166136261, b = 3335557771;
  for (const char of value) {
    a = Math.imul(a ^ char.charCodeAt(0), 16777619) >>> 0;
    b = Math.imul(b ^ char.charCodeAt(0), 2246822519) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
function credentialKey() { return `livestocks.widget.v1:${OPTIONS.baseUrl}`; }
function readCredential() {
  try {
    if (!OPTIONS.baseUrl || !Keychain.contains(credentialKey())) return null;
    const token = Keychain.get(credentialKey());
    return /^lst_widget_[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch (_) { return null; }
}
function readCredentialMetadata() {
  try { return JSON.parse(Keychain.get(credentialKey() + ":metadata")); } catch (_) { return null; }
}
function cacheLocation(token) {
  const fm = FileManager.local();
  const identity = fingerprint(token);
  return { fm, identity, path: fm.joinPath(fm.documentsDirectory(), `stocks-glance-v4-${fingerprint(OPTIONS.baseUrl)}-${identity}.json`) };
}
function clearCaches(legacyOnly = false) {
  try {
    const fm = FileManager.local(), directory = fm.documentsDirectory();
    const currentPrefix = OPTIONS.baseUrl ? `stocks-glance-v4-${fingerprint(OPTIONS.baseUrl)}-` : null;
    for (const name of fm.listContents(directory)) {
      if (/^stocks-glance-v3-[a-f0-9]+\.json$/.test(name) || !legacyOnly && currentPrefix && name.startsWith(currentPrefix) && /^[a-f0-9]+\.json$/.test(name.slice(currentPrefix.length))) {
        fm.remove(fm.joinPath(directory, name));
      }
    }
  } catch (_) {}
}
function disconnect() {
  clearCaches();
  try {
    for (const key of [credentialKey(), credentialKey() + ":metadata"]) if (Keychain.contains(key)) Keychain.remove(key);
  } catch (_) {}
}
async function setupCredential() {
  if (!OPTIONS.baseUrl) return;
  if (readCredential()) {
    const menu = new Alert(); menu.title = "החשבון האישי בווידג׳ט";
    menu.message = OPTIONS.baseUrl;
    menu.addAction("הצגת הווידג׳ט"); menu.addAction("החלפת טוקן"); menu.addDestructiveAction("ניתוק במכשיר זה"); menu.addCancelAction("ביטול");
    const choice = await menu.presentSheet();
    if (choice === 2) { disconnect(); return; }
    if (choice !== 1) return;
  }
  const prompt = new Alert(); prompt.title = "חיבור LiveStocks";
  prompt.message = `יש ליצור טוקן אישי בהגדרות החשבון ולהדביק כאן. הטוקן יישמר ב־Keychain רק עבור ${OPTIONS.baseUrl}`;
  prompt.addSecureTextField("טוקן אישי לווידג׳ט"); prompt.addAction("שמירה"); prompt.addCancelAction("ביטול");
  if (await prompt.presentAlert() !== 0) return;
  const token = prompt.textFieldValue(0).trim();
  if (!/^lst_widget_[A-Za-z0-9_-]{43}$/.test(token)) {
    const error = new Alert(); error.title = "הטוקן אינו תקין"; error.message = "יש להעתיק את הטוקן המלא ממסך ההגדרות."; error.addAction("אישור"); await error.presentAlert(); return;
  }
  disconnect();
  Keychain.set(credentialKey(), token);
}
function valid(p) { return p && !p.error && p.summary && typeof p.summary === "object" && Array.isArray(p.stocks); }
function reconnect() { clearCaches(); return { payload: null, stale: false, reconnect: true }; }
async function load() {
  clearCaches(true);
  if (!OPTIONS.baseUrl) return reconnect();
  const token = readCredential();
  if (!token) return reconnect();
  const cache = cacheLocation(token), metadata = readCredentialMetadata();
  if (metadata && metadata.identity === cache.identity && new Date(metadata.expiresAt).getTime() <= Date.now()) {
    disconnect(); return reconnect();
  }
  let req;
  try {
    req = new Request(`${OPTIONS.baseUrl}/api/widget/summary`);
    req.method = "POST"; req.timeoutInterval = SETTINGS.timeout;
    req.allowInsecureRequest = false;
    // Never forward a personal credential to a redirected host or path.
    req.onRedirect = () => null;
    req.headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` };
    req.body = JSON.stringify({ targetCurrency: OPTIONS.currency });
    const payload = await req.loadJSON();
    const status = req.response && req.response.statusCode;
    if (status === 401 || status === 403) { disconnect(); return reconnect(); }
    if (status && status >= 300 || !valid(payload)) throw new Error("Portfolio unavailable");
    if (readCredential() !== token) return reconnect();
    const expiresAt = payload.widgetTokenExpiresAt;
    const expiry = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) { disconnect(); return reconnect(); }
    const state = { origin: OPTIONS.baseUrl, identity: cache.identity, payload, expiresAt, savedAt: new Date().toISOString(), stale: false };
    Keychain.set(credentialKey() + ":metadata", JSON.stringify({ identity: cache.identity, expiresAt }));
    try { cache.fm.writeString(cache.path, JSON.stringify(state)); } catch (_) {}
    return state;
  } catch (_) {
    const status = req && req.response && req.response.statusCode;
    if (status === 401 || status === 403) { disconnect(); return reconnect(); }
    if (readCredential() !== token) return reconnect();
    // Offline/server failure only. Invalid requests, redirects and denied access cannot use cache.
    if (status && status < 500) return { payload: null, stale: false };
    try {
      if (cache.fm.fileExists(cache.path)) {
        const state = JSON.parse(cache.fm.readString(cache.path));
        const savedAt = new Date(state.savedAt).getTime(), expiresAt = new Date(state.expiresAt).getTime();
        if (state.origin === OPTIONS.baseUrl && state.identity === cache.identity && Number.isFinite(expiresAt) && expiresAt <= Date.now()) { disconnect(); return reconnect(); }
        if (state.origin === OPTIONS.baseUrl && state.identity === cache.identity && valid(state.payload) && Number.isFinite(savedAt) && savedAt <= Date.now() && Date.now() - savedAt <= SETTINGS.offlineMaxAge && expiresAt > Date.now()) return { ...state, stale: true };
        cache.fm.remove(cache.path);
      }
    } catch (_) {}
    return { payload: null, stale: false };
  }
}
function age(date) {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  return elapsed < 1 ? "עודכן עכשיו" : elapsed < 60 ? `לפני ${elapsed} דק׳` : elapsed < 1440 ? `לפני ${Math.floor(elapsed / 60)} שע׳` : `לפני ${Math.floor(elapsed / 1440)} ימים`;
}
// v6: native typography and airy surfaces. System glass rendering is owned by Scriptable/iOS.
function header(w, state) {
  const r = stack(w, false);
  text(r, state.stale ? "שמור · " + age(state.savedAt) : age(state.savedAt), SMALL ? 9 : 10, state.stale ? C.warning : C.muted);
  r.addSpacer();
  if (!SMALL) { text(r, "התיק שלי", 12, C.ink, "bold"); r.addSpacer(6); }
  icon(r, "chart.bar.xaxis", C.accent, SMALL ? 14 : 15);
}
function concentrationImage(value, size) {
  const ctx = new DrawContext(); ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const mid = size / 2, radius = mid - 6;
  // Raster images do not retain adaptive colors when moved between widget hosts.
  // These literal strokes contrast on both appearances; all text stays native.
  const trackColor = new Color("708894", 0.35);
  const arcColor = new Color("82AFFF");
  ctx.setStrokeColor(trackColor); ctx.setLineWidth(5);
  ctx.strokeEllipse(new Rect(6, 6, size - 12, size - 12));
  if (value !== null && value > 0) {
    const path = new Path();
    const span = Math.PI * 2 * Math.min(100, Math.max(0, value)) / 100;
    const steps = Math.max(2, Math.ceil(span * 24));
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + span * i / steps;
      const pt = new Point(mid + radius * Math.cos(angle), mid + radius * Math.sin(angle));
      if (i === 0) path.move(pt); else path.addLine(pt);
    }
    ctx.addPath(path); ctx.setStrokeColor(arcColor); ctx.strokePath();
    // Rounded terminal makes the ring distinct without inventing data.
    const end = -Math.PI / 2 + span;
    ctx.setFillColor(arcColor); ctx.fillEllipse(new Rect(mid + radius * Math.cos(end) - 2.5, mid + radius * Math.sin(end) - 2.5, 5, 5));
  }
  return ctx.getImage();
}
function concentration(parent, m, size = 52) {
  const box = stack(parent); box.size = new Size(size + 8, 0);
  const ring = stack(box); ring.size = new Size(size, size);
  ring.backgroundImage = concentrationImage(m.concentration, size);
  ring.addSpacer();
  const center = stack(ring, false); center.addSpacer();
  text(center, ltr(m.concentration === null ? "—" : `${number(m.concentration, 0)}%`), size > 70 ? 19 : 16, C.ink, "bold");
  center.addSpacer(); ring.addSpacer();
  box.addSpacer(1);
  const name = stack(box, false); name.addSpacer();
  text(name, m.largest && m.concentration !== null ? ltr(m.largest.symbol) : "פיזור", 9, C.accent, "bold", true); name.addSpacer();
  box.addSpacer(2); text(box, "החזקה הגדולה", 9, C.muted);
  return box;
}
function dailyLine(parent, m, compact = false) {
  const chip = stack(parent); chip.cornerRadius = 8;
  chip.backgroundColor = m.daily === null || m.daily === 0 ? C.card : m.daily > 0
    ? Color.dynamic(new Color("157148", 0.09), new Color("80E3B4", 0.12))
    : Color.dynamic(new Color("B82F4D", 0.07), new Color("FFA4B6", 0.10));
  chip.setPadding(4, 6, 4, 6);
  const label = m.daily === null ? "היום · אין נתון מלא" : SMALL
    ? `היום ${pct(m.dailyPercent)}`
    : `היום ${cash(m.daily, compact, true)} · ${pct(m.dailyPercent)}`;
  text(chip, label, SMALL ? 11 : compact ? 10 : 11, tone(m.daily), "medium");
}
function valueBlock(parent, m, compact = false) {
  const mainPnl = OPTIONS.mode === "pnl";
  text(parent, mainPnl ? "רווח כולל נטו" : "שווי התיק", 11, C.muted);
  parent.addSpacer(2);
  const value = text(parent, cash(mainPnl ? m.pnl : m.value, compact, mainPnl), SMALL ? 31 : compact ? 30 : XL ? 38 : 30, mainPnl ? tone(m.pnl) : C.ink, "bold");
  value.minimumScaleFactor = 0.72; // Only the hero may scale for unusually large balances.
  parent.addSpacer(5); dailyLine(parent, m, compact);
}
function gapLabel(gap) {
  if (gap === null) return "אין נתון תחזית";
  if (Math.abs(gap) < 0.5) return "בדיוק בתחזית";
  return gap > 0 ? "מעל התחזית" : "מתחת לתחזית";
}
function metricCell(parent, label, value, caption, size = 17) {
  const cell = stack(parent);
  text(cell, label, 10, C.muted);
  cell.addSpacer(3); text(cell, cash(value, true, true), size, tone(value), "bold");
  if (caption) { cell.addSpacer(3); text(cell, caption, 9, C.muted); }
  return cell;
}
function metricRail(parent, m) {
  const rail = panel(parent, 8); rail.cornerRadius = 15; rail.layoutHorizontally();
  metricCell(rail, "רווח / הפסד נטו", m.pnl, "כולל מימושים ומס");
  rail.addSpacer();
  const line = stack(rail); line.size = new Size(0.5, 43); line.backgroundColor = C.line;
  rail.addSpacer();
  metricCell(rail, "פער מהתחזית", m.forecastGap, gapLabel(m.forecastGap));
}
function impactRow(parent, r, maximum, detailed) {
  const row = stack(parent, false); row.url = `${OPTIONS.baseUrl}/stock/${encodeURIComponent(r.symbol)}`;
  const values = stack(row);
  text(values, cash(r.daily, true, true), detailed ? 13 : 12, tone(r.daily), "medium", true);
  if (detailed) { values.addSpacer(1); text(values, pct(r.dailyPercent), 10, C.muted, "regular", true); }
  row.addSpacer();
  // This bar encodes today's absolute contribution. It is not price history.
  if (detailed) {
    const track = stack(row, false); track.size = new Size(30, 3); track.backgroundColor = C.line; track.cornerRadius = 1.5;
    if (r.daily !== null && r.daily !== 0 && maximum > 0) {
      const fill = stack(track); fill.size = new Size(Math.max(1, 30 * Math.abs(r.daily) / maximum), 3); fill.backgroundColor = tone(r.daily); fill.cornerRadius = 1.5;
    }
    row.addSpacer(8);
  }
  text(row, ltr(r.symbol), detailed ? 13 : 12, C.ink, "bold", true);

}
function movers(parent, m, count, compact = false) {
  const p = compact ? stack(parent) : panel(parent, 8);
  const title = stack(p, false);
  text(title, m.known < m.stocks.length ? `כיסוי ${m.known}/${m.stocks.length}` : `${m.stocks.length} מניות`, 10, m.known < m.stocks.length ? C.warning : C.muted); title.addSpacer();
  text(title, m.known ? "ההשפעה היומית" : "ההחזקות שלי", compact ? 10 : 11, C.ink, "bold");
  p.addSpacer(4);
  const max = Math.max(0, ...m.ranked.map(r => Math.abs(r.daily ?? 0)));
  if (!m.stocks.length) { p.addSpacer(); text(p, "אין החזקות פעילות", 11, C.muted); p.addSpacer(); }
  m.ranked.slice(0, count).forEach((r, i) => {
    p.addSpacer(); impactRow(p, r, max, !compact); p.addSpacer();
    if (i < Math.min(count, m.ranked.length) - 1) rule(p, 2);
  });
  return p;
}
function footer(w, m, state) {
  w.addSpacer(4); const r = stack(w, false);
  text(r, m.fx !== null ? ltr(`USD/ILS ${number(m.fx, 3)}`) : "שער לא זמין", 8, C.muted, "regular", true);
  r.addSpacer(); text(r, state.stale ? "נתונים שמורים ↗" : "לתיק המלא ↗", 9, state.stale ? C.warning : C.accent, "medium");
}
function renderSmall(w, m) {
  w.addSpacer(5);
  text(w, "שווי התיק", 10, C.muted);
  const hero = text(w, cash(m.value, true), 26, C.ink, "bold"); hero.minimumScaleFactor = 0.72;
  w.addSpacer(3);
  const row = (label, value) => {
    const r = stack(w, false);
    text(r, cash(value, true, true), 12, tone(value), "bold");
    r.addSpacer(3); text(r, label, 10, C.muted);
  };
  row("נטו", m.pnl);
  w.addSpacer(4); row("פער מהתחזית", m.forecastGap);
  w.addSpacer(2); text(w, gapLabel(m.forecastGap), 9, C.muted);
  w.addSpacer();
  text(w, m.dailyPercent === null ? "היום · אין נתון" : `היום ${pct(m.dailyPercent)}`, 10, tone(m.daily));
}
function renderMedium(w, m, state) {
  w.addSpacer(8);
  const body = stack(w, false); body.topAlignContent();
  const detail = stack(body); detail.size = new Size(125, 0);
  metricCell(detail, "רווח / הפסד נטו", m.pnl, null, 17);
  detail.addSpacer(7);
  metricCell(detail, "פער מהתחזית", m.forecastGap, gapLabel(m.forecastGap), 17);
  body.addSpacer(9);
  const line = stack(body); line.size = new Size(0.5, 89); line.backgroundColor = C.line;
  body.addSpacer(9);
  const main = stack(body);
  // Both requested metrics always remain visible; mode=pnl does not hide portfolio value.
  text(main, "שווי התיק", 11, C.muted); main.addSpacer(3);
  const hero = text(main, cash(m.value, true), 28, C.ink, "bold"); hero.minimumScaleFactor = 0.72;
  main.addSpacer(5);
  text(main, m.dailyPercent === null ? "היום · אין נתון" : `היום ${pct(m.dailyPercent)}`, 11, tone(m.daily), "medium");
  main.addSpacer(3); text(main, cash(m.daily, true, true), 11, tone(m.daily));
  w.addSpacer();
}
function renderLarge(w, m, state) {
  w.addSpacer(8);
  const hero = stack(w, false); concentration(hero, m, 48); hero.addSpacer(); valueBlock(stack(hero), m);
  w.addSpacer(6); metricRail(w, m);
  w.addSpacer(6); movers(w, m, 3);
}
function renderXL(w, m, state) {
  w.addSpacer(12);
  const columns = stack(w, false); columns.topAlignContent();
  const movement = movers(columns, m, 6); movement.size = new Size(0, 252);
  columns.addSpacer(14); const summary = stack(columns); summary.size = new Size(300, 252);
  const hero = stack(summary, false); concentration(hero, m, 64); hero.addSpacer(); valueBlock(stack(hero), m);
  summary.addSpacer(10); metricRail(summary, m);
  summary.addSpacer(10);
  const info = panel(summary, 10); text(info, "ההחזקות הגדולות", 11, C.ink, "bold"); info.addSpacer(6);
  if (m.concentration === null) {
    info.addSpacer(); text(info, "אין נתוני פיזור מלאים", 10, C.muted); info.addSpacer();
  } else {
    m.stocks.slice().sort((a,b) => b.value-a.value).slice(0,3).forEach((r,i) => {
      if(i) info.addSpacer(4);
      const line = stack(info, false); line.url = `${OPTIONS.baseUrl}/stock/${encodeURIComponent(r.symbol)}`;
      text(line, ltr(`${number(r.value/m.value*100,1)}%`), 11, C.accent, "medium", true); line.addSpacer(); text(line, ltr(r.symbol), 11, C.ink, "bold", true);
    });
  }
  summary.addSpacer();
  footer(w, m, state);
}
function targetHero(parent, m) {
  const gap = m.forecastGap;
  text(parent, "היעד האישי להיום", SMALL ? 11 : 13, C.muted, "medium");
  parent.addSpacer(SMALL ? 2 : 4);
  if (gap === null) {
    const message = text(parent, m.incompleteHistory ? "חסרה היסטוריית עסקאות" : "אין מספיק נתונים לחישוב היעד", SMALL ? 15 : 20, C.ink, "bold");
    message.lineLimit = 2;
    return;
  }
  if (Math.round(Math.abs(gap)) === 0) {
    text(parent, "בדיוק ביעד", SMALL ? 22 : 28, C.ink, "bold");
    return;
  }
  const compact = SMALL || FAMILY === "medium" || Math.abs(gap) >= 1e8;
  const amount = text(parent, cash(Math.abs(gap), compact), SMALL ? 29 : LARGE ? 40 : 32, tone(gap), "bold");
  amount.minimumScaleFactor = 0.72;
  text(parent, gap > 0 ? "מעל היעד" : "מתחת ליעד", SMALL ? 13 : 16, tone(gap), "medium");
}
function targetStats(parent, m) {
  if (LARGE) {
    const row = stack(parent, false);
    const movement = stack(row);
    text(movement, "שינוי יומי", 10, C.muted);
    text(movement, m.daily === null ? "אין נתון מלא" : cash(m.daily, true, true) + " · " + pct(m.dailyPercent), 14, C.ink, "medium");
    row.addSpacer();
    const balance = stack(row);
    text(balance, "שווי התיק", 10, C.muted);
    text(balance, cash(m.value, true), 16, C.ink, "medium");
    return;
  }
  text(parent, "שווי התיק", 10, C.muted);
  text(parent, cash(m.value, true), SMALL ? 14 : 18, C.ink, "medium");
  parent.addSpacer(2);
  const change = SMALL ? pct(m.dailyPercent) : cash(m.daily, true, true) + " · " + pct(m.dailyPercent);
  text(parent, m.daily === null ? "שינוי יומי · אין נתון מלא" : "שינוי יומי " + change, SMALL ? 10 : 11, C.muted);
}
function targetMovers(parent, m) {
  const title = stack(parent, false);
  if (m.known < m.stocks.length) text(title, `כיסוי ${m.known}/${m.stocks.length}`, 10, C.muted);
  title.addSpacer();
  text(title, "מה הזיז את התיק היום", 12, C.ink, "bold");
  const contributors = m.ranked.filter(r => r.daily !== null).slice(0, XL ? 6 : 3);
  if (!contributors.length) text(parent, m.stocks.length ? "אין נתוני שינוי יומי" : "אין החזקות פעילות", 11, C.muted);
  for (const stock of contributors) {
    parent.addSpacer(4);
    const row = stack(parent, false);
    row.url = `${OPTIONS.baseUrl}/stock/${encodeURIComponent(stock.symbol)}`;
    text(row, cash(stock.daily, true, true), 12, C.muted, "medium", true);
    row.addSpacer();
    text(row, ltr(stock.symbol), 12, C.ink, "medium", true);
  }
}
function targetHoldings(parent, m) {
  text(parent, "ההחזקות הגדולות", 12, C.ink, "bold");
  if (m.concentration === null) {
    text(parent, m.stocks.length ? "אין נתוני משקל מלאים" : "אין החזקות פעילות", 11, C.muted);
    return;
  }
  for (const stock of [...m.stocks].sort((a, b) => b.value - a.value).slice(0, 3)) {
    parent.addSpacer(4);
    const row = stack(parent, false);
    row.url = `${OPTIONS.baseUrl}/stock/${encodeURIComponent(stock.symbol)}`;
    text(row, ltr(number(stock.value / m.value * 100, 1) + "%"), 12, C.muted);
    row.addSpacer();
    text(row, ltr(stock.symbol), 12, C.ink, "medium", true);
  }
}
function renderTarget(w, m, state) {
  const stamp = stack(w, false);
  text(stamp, (state.stale ? "שמור · " : "") + age(state.savedAt), 9, C.muted);
  stamp.addSpacer();
  w.addSpacer(SMALL ? 3 : 6);
  if (FAMILY === "medium") {
    const body = stack(w, false);
    targetStats(stack(body), m);
    body.addSpacer();
    const hero = stack(body);
    if (m.forecastGap === null) hero.size = new Size(146, 0);
    targetHero(hero, m);
  } else {
    targetHero(w, m);
    if (SMALL) w.addSpacer(); else rule(w, 6);
    targetStats(w, m);
  }
  if (SMALL) return;
  if (LARGE) {
    rule(w, 6);
    if (XL) {
      const columns = stack(w, false);
      columns.topAlignContent();
      const holdings = stack(columns);
      holdings.size = new Size(230, 0);
      targetHoldings(holdings, m);
      columns.addSpacer(36);
      targetMovers(stack(columns), m);
    } else {
      targetMovers(w, m);
    }
  }
  w.addSpacer();
  const label = m.pnl === null ? "רווח / הפסד נטו מצטבר" : m.pnl < 0 ? "הפסד נטו מצטבר" : "רווח נטו מצטבר";
  text(w, label + " " + cash(m.pnl === null ? null : Math.abs(m.pnl), true), 11, C.muted);
}
async function main() {
  if (!config.runsInWidget) await setupCredential();
  const state = await load(), w = new ListWidget();
  w.backgroundColor = C.bg;
  const gradient = new LinearGradient(); gradient.colors = [Color.dynamic(new Color("E2ECFF"), new Color("20365A")), C.bg, C.bg]; gradient.locations = [0, 0.65, 1]; gradient.startPoint = new Point(0, 0); gradient.endPoint = new Point(1, 1); if (OPTIONS.mode !== "target") w.backgroundGradient = gradient;
  w.url = state.reconnect ? "scriptable:///run?scriptName=" + encodeURIComponent(Script.name()) + (OPTIONS.baseUrl ? "&baseurl=" + encodeURIComponent(OPTIONS.baseUrl) : "") : `${OPTIONS.baseUrl}/`; const pad = SMALL ? 11 : XL ? 18 : 13; w.setPadding(pad, pad, pad, pad);
  w.refreshAfterDate = new Date(Date.now() + (state.stale || !state.payload ? 7 : SETTINGS.refresh) * 60000);
  if (!state.payload) {
    w.addSpacer(); icon(w, "wifi.exclamationmark", C.warning, 24); w.addSpacer(10);
    text(w, state.reconnect ? "נדרש חיבור אישי" : "לא ניתן לטעון את התיק", SMALL ? 13 : 18, C.ink, "bold"); w.addSpacer(8);
    text(w, state.reconnect ? "הקש להגדרת טוקן ב־Scriptable ↗" : "הקש לפתיחת LiveStocks ↗", 11, C.accent); w.addSpacer();
  } else {
    const m = normalize(state.payload);
    if (OPTIONS.mode === "target") renderTarget(w, m, state);
    else {
      header(w, state);
      if (SMALL) renderSmall(w, m); else if (FAMILY === "medium") renderMedium(w, m, state); else if (XL) renderXL(w, m, state); else renderLarge(w, m, state);
    }
  }
  Script.setWidget(w);
  if (!config.runsInWidget) {
    if (SMALL) await w.presentSmall(); else if (XL && typeof w.presentExtraLarge === "function") await w.presentExtraLarge(); else if (LARGE) await w.presentLarge(); else await w.presentMedium();
  }
  Script.complete();
}
await main();

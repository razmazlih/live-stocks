/**
 * Inline MCP App, protocol 2026-01-26, no third-party scripts or network access.
 * Sources: https://developers.openai.com/plugins/build/chatgpt-ui and
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
 * Result _meta is widget-only. Never copy confirmationSecret into model context,
 * DOM attributes, localStorage, follow-up messages or diagnostic logs.
 */
export const CHAT_SYNC_RESOURCE_URI = 'ui://livestocks/screenshot-sync-v5.html';
export const CHAT_SYNC_RESOURCE_MIME = 'text/html;profile=mcp-app';
export const CHAT_SYNC_BRAND_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAAACXBIWXMAAAsTAAALEwEAmpwYAAANoklEQVR4nO2da3BdVRXHD35jlId+VB6SnJWU8hhBEFR0EHVwRgE7Qwfl1dy9Q6C8hbY8BFoQkQEKRSilWmiBAgWxVd5YxgItKhRQaA3PQpO2Cdn73pukTdo0r+2s06beJs3j5p599jnn/vfM/2Nm9v3v315ZZ5+11/E8x2NCraqiTHaSL/XVJPSDvtCrfKHqSagGEipPQvWR1AaKgQdC9e1ckwZeI16rnWt2Fa9hRY0ir9xGRV3+ID+jJEm12Be6yfkiQSZMD3ypNu1YWyUqa3IHemkcB0xu3NuXarIv1XJE3DLaREL1BVG8Vtf5Z2X39ZI+/LqWSl/o+ST1VufmQsYt3LozYCHzeYWXtFFZmzts57+dHoCEzUSFKQkzIdQjfiY70Yv7qKjL7+cLfTdJ1QuQATKNno7MZ2a8+A2zly/12SR1M0AGyFSEB8HBQK36pReXwck+Sf0EQAbIVIIHvlTLDpra9mWnMFcLfYwv9TrADJgpnFORhkqR+7YTmKukqvWF6gbMgJlC9MCXarsvWzKRwhy8GZKqHzADZrLiQcDWLPskzzRf2HGKgYWEBzoKD+bwgYM1nknoO7GQ2MwUqQdqriWY1XWAGTCTAw+4cC30B0DkzICZnHmg+kN7UKw6Tx/LT56IzgCaHHrAJ2p+bfb4kmA+eErr/r7QnwJmwEwx8MCXav1E2faVEl5nq6WufwQED6jQA6GeHtfJR6XQ5wAmwERx9KDY2g+uz8BtkhgsHGSG8aC5qCo9X6h7YCaAonh7cFcxxfmoZ3a/YJAc+aJAVZ2eMCrQJNSjMBMwUQI88IVaNDLMmc8rcG3K/UJBeqxA91TVNh8yQu4cXGiFofDAJMcDNW/4mydCd7qfIAQP9NjTDqk7qoXeZw/RWQkYic1ESfQgkz13aP4s9SvOJwbBA1m8B9zAaEh7LnQ0AkyU5J5752a/Nqg8NAYTg+CBHC/ULTU4e8YGMmnxwJfqof8/EEq10fWEIHhApQG9aUf+XKMIMAEmSoEH3BzU40bVricCwQMKwYNKoU/1gs75MBSbSqbAA6GnM9ALnU8EggcyFA8WcP3GKgAFoCgFHvhCv8avvOtdTwSCBxSGB0Kt5frnDQAKQFEaPBCqgYFucz4RCB7IUIDOc8qB76BgQ5k0eMAse3GYCAQPKCQPADRgMmnyAEDHYBEgDaABQfw2wpFTs2bSzW2m7p7NpuaudnPSNXlEaNeLAumiPfjJDa3m8ZVdpiHfb5o2m930zvpec/3iDnPYBdlIvEXKAYhNKR7cuKTTbGjbHeI96Z8f90YSsQE0gDbj8aC6Vpu5z28bFeRC1Tf1mRNn2IUaQANoU6wHE87T5oGXi4N5QK/W9wR/D6ABXizy+0PrtFn8Ste4YB7QpfO3AGjXCwlpM/H8rHny9e0lwcxa/l4PgAZQbjfV4VOzZtmbpcPM4odIPuKzMU/k0Ii+ZjQPjpiaNc+s7g4F5gH90NKJB4AG0GYkD466KGv+9m64MLNOvg5AI+2IePMdfUnWrPhvT+gwb2o35uiLkXIA6Ahh/tZlObPqg/BhZr3+Ua+1eSPlQMphBntw/BW54M2eDZhZNzzaAaABXjSR+YRpObP6M3swv9vYFzxkIkIjklqH+cSr8uadhj5rMDfmTVCNZ/M3IOXARjHswY+uzZs1G+zBvD7Xb6bMbre+KQE0gDY//nXerNloD+ZPc/3mzNvsRmYADZANe/Czma3mg+Z+ezBn+80Zt0YDMyJ0mUM96eY287GyB/NHLf3m579pjfQ3IeUoU51+S5v5RNuD+cOWfnPKrGhhBtBlqrNvbzefZe3BvHZTnzn5+uhhBtBlqCmz24MTB1sw88MlP2S6+n1IOcpIdfduNo2tdkBm8Rm27StWADoGIMVBF963eUyXWcerN9f1mu9cmXP+OxGhy0BXPrDFbGy3BzPXfXD9h+vfCaDLQDMWbgnKNW3BzJdej7k0HjAD6JRr5mMd1kBmca0010y7/p0Augz02yc7rcL84n+6zTcuihfMLOTQKVNVrTZznt5qFebn3um2dskVQMfAxDjBfO9zdmFe+sb2yPrUjUeI0MOAwQU19zy31Tz7drdZUd9jnn2r28x5Zmvwytj1ooXdzahpjHpsZVfQaMb1bwXQRRjy05mtAcAjLezLa3piBXYY3YyaRtGiFV1WW3gBaAtmnM9v0vJjX+Qlq7YHtzzS0M2oaQT94aVtQXNG17CORUg5CmAez5s0fpU8/6Vt5tjLck5g/tM/7MI874XkwAygS4R5cLkkn/syZEntZtQ0SLP/stU5oADaAcyDaxr4kwzWuxm9ZxfmO5YlD2Yq95QjbJgLtXxNj5XbGtxxiB9KbcJ88xOdztdmvCpboG3CPCCuoXj0tS7zven50LoZrXy/x+p8r33YXhMYAG3JhAsigHnwreffPdVZ0ts1292MNrYbc/kf7TUiB9AJjszD6f3mPnPNQx1Fn+eecGXOrP7UHswb2oy55H67eT+AThnMheJIe84dY2u6wunKWxZbczW2GnPe79MBc1nl0HGBuVB87DbSZVJuCv5eo93WXJk59rsZAegygHlAPC9+MXPc5bnUdjOiCJX6CB1nmAu1Ltsf1DBzJVvauhkRgE7maUYYent9r/nIcjej025y0zMjCqU2QiclMkepDx11MwLQgDlV3YwoQqUuQicxzbCtdxv7zA+udlvmCqABc2g5+fdDevWeBKUmQtuOzLcv22quWtRh9fQhrd2MCEDH6wGwsC74qIuzQWmlzYaHaetmRAA6njAPrq9Y+Pcuq12J0tLNiAB0vGEuFJ/p2vh0cJq6GRGATgbMhW0P+JYKP4C5hPnFmHYzAtCOHwBv+/P4bmwcPjVrZj3eYfVTD8Pp6be6zRExbgATlRJ3yhGnyDycvnlpNmhSE9V5eNy7GRGATi7Mg8s/n/qX3TYD3MYgqpvmlAAlJkInDeZC/eK2NrPqg/DvAj7yajK6GRGATg/MA+JmLRffvzm0GuckdTMiAJ0umAc3iOG651I+q5a0bkYEoON9mhGG+MXMw68U/2Lm9qXJbABD5Z5DpxnmQp1649hezPCVqWkPJr/NAJUj0OUCc+GLGf4g5l9Xdw/5jiDXMc99fltozWoo5Yod0OUG82DxefLJ1+WDe4UnTMsFsLueEyVIsQI6bQ+AkC5foAGz+zWgFCgWQANm92tAKZFzoAGzewgoRXIKNGB2DwClTM6ABszuF59SKCdAA2b3C08pVeRAA2b3i04pVqRAA2b3C04pV2RAA2b3i01loEiABszuF5rKRNaBLvfaDEinB2i+egSYATWlAWjuD8Glj4jMAJrSAPRNSzoBM2A2qQH6jU/sdBFCzoyIT1EDzY1WADPAo7QAzZ8+QGQG0JQWoE+6Jo+bJgDapAZobho4+LIncmZEbEoq0KwX/l16z2Q8AGITUFyAnjp3M2AGkCY1QHOrquVrxtegEJEZkZniBjTru9NywTfyioH51qdQm4HIruMJNIs7/qyoHz1S81elZixEqyvArOOZchTq0DptrliwZY89kj9W/eaBl7eVzZdOIZ2uK1jH/ypnTr+lLajE4xcwDDsWGR5QUoGG4AGlKUJD8IAANCBAINCI0IBAl50Hni9Uj+tJQPCAQvCAWfZIqDYABaAoDR4IlWegNzifCAQPZChAN3DKUQ+gABSlwQOh1nq+0KucTwSCB7J0D3yhX/N8qRcCKABF6fBgAQN9dQwmAsEDU7IHQk/3KJOdBDOxoSgFHlQKfapXUaPI9UQgeEAheODXtVR6PHypNgIqQEWJ9kA1egODpFrsfkIQPNDjj85CLdoFtJ9REmZiQ1GiPchO2QV0ZU3uQBKqz/2kIHigi/dAqL5qob+6C+gg7RBqBczEhqIEeuBLtXw3mIO0QyjhemIQPKDxeJDJnjsU6LOy+5LQnYAKUFGCPPCl7ph4YcuXhgC9I0rr+a4nCMEDKsoDNW+PMAd5dObzChT8AyhKiAe+UN1Vtc2HDAv0zofDR1xPFIIHNLZ0Y+GIMAdpRyY7kaTqBVSAimLsAWcS1UJXjwr0zlz6btcThuABjRydZ48J5gDos7L7+lJtAlSAiuLpQXNFXX6/MQMdQC31mTGYOAQPzGAPqqQ6oyiYd0Et9GMwFJuK4uXBk954x8FTWvf3pV4Xgx8BwQNDQn9SdKoxeFQLfYwv1XYYik1FLj0QuquyRh3thTF82ZIhqfoBNaAmJx6o/j3Wa5QGNS7TYkNrV9F5eqgwF0A9G4uKKE0ReuALda9nb5i9SOq7ADWgpmgi853MnGd7+EJdhpwaUJPNnFnqWdZB3g1q2ZLB6QegpvCjclfoD4BjHXyMwmeDSEEANoWRL0u1njLZ4zyXI6j7EHoJoAbUVBrMS/lFnheX4Ut9Cjf7ANgAm4o6xdBNO1KMCB7+ih1Hnt38RU7mkVsDahr9OK6Hy5T5P7wX91FVpyf4Uj2E61wAm4aC3M1djsZcnB+nwfe9+BIj38xFKlLecPsBA2pe9ZTmr3tJHwdMbtzbl2oyCf0MonYZSai+4AsRtbquWuh9vDQObtlEoqWGpHoYHyxKJcQbON3kXnND2nOVw+CevpW1+jRf6hn8SQFf6pX88ZfgTFKoPHruxSviklD5nWuzlr9pwmvGxUPBGg70Z3Y4/gcHSl+yvuSWgQAAAABJRU5ErkJggg==';
export const CHAT_SYNC_APP_HTML = String.raw`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>סקירת סנכרון LiveStocks</title>
<style>
/* Brand tokens are shared with the site's Liquid Glass palette in app/globals.css. */
:root{color-scheme:light dark;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--surface:light-dark(#fff,#1c222d);--soft:light-dark(#f3f6fb,#222936);--ink:light-dark(#152238,#eef3fb);--muted:light-dark(#53647a,#bdc8d9);--line:light-dark(#dce4ef,#384150);--blue:light-dark(#2467dc,#78aaff);--blue-soft:light-dark(#edf4ff,#202f49);color:var(--ink);background:transparent}
*{box-sizing:border-box}body{margin:0;padding:8px}p,h1,h2{margin:0}main{max-width:760px;margin:auto;overflow:hidden;border:1px solid var(--line);border-radius:24px;background:var(--surface);box-shadow:0 12px 40px -18px rgb(33 60 104 / .23)}.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px 0}.brand{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:750;letter-spacing:-.3px}.brand-mark{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#2467dc;color:white}.brand-mark img{display:block;width:26px;height:26px;border-radius:8px}.private-note{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)}.private-note svg{width:12px;height:12px}.steps{display:flex;gap:6px;padding:18px 22px 0;list-style:none;margin:0}.steps li{flex:1;border-top:2px solid var(--line);padding-top:7px;font-size:10px;color:var(--muted);transition:color .25s,border-color .25s}.steps li.active{color:var(--blue);border-color:var(--blue);font-weight:650}.steps b{font-variant-numeric:tabular-nums;font-weight:inherit;margin-inline-end:4px;opacity:.65}.content{padding:24px 22px 20px}.card-header{margin-bottom:22px}.eyebrow{font-size:11px;color:var(--blue);font-weight:600;margin-bottom:7px}h1{font-size:29px;line-height:1.2;font-weight:750;letter-spacing:-1px}.intro{font-size:12px;line-height:1.8;color:var(--muted);margin-top:9px;max-width:520px}#description{display:inline-flex;gap:6px;align-items:center;margin-top:13px;padding:5px 9px;border-radius:7px;background:var(--soft);font-size:11px;color:var(--muted)}
.review-summary{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:11px;flex-wrap:wrap}.summary-count{font-size:12px;font-weight:650}.summary-state{font-size:10px;color:var(--muted)}.table-wrap{max-height:620px;overflow:auto;overscroll-behavior:contain;border-radius:16px}table{display:block;width:100%;border-spacing:0}tbody{display:grid;gap:12px}.sr-only,caption{position:absolute!important;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.holding-card{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--surface);animation:arrive .32s ease both}.holding-identity{display:flex;align-items:center;gap:10px;min-width:0;padding:15px}.ticker-avatar{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:11px;background:var(--blue-soft);color:var(--blue);font-size:12px;font-weight:750}.ticker-info{flex:1;min-width:0}.ticker-symbol{font-size:18px;font-weight:750;letter-spacing:.2px;overflow-wrap:anywhere}.acquisition-date{display:block;font-size:10px;color:var(--muted);margin-top:2px}.holding-kind{font-size:10px;color:var(--blue);background:var(--blue-soft);padding:4px 7px;border-radius:6px}.holding-stat{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.5fr);align-items:center;gap:10px;padding:0 15px 13px;min-width:0}.stat-label{font-size:11px;color:var(--muted)}.comparison{display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr);gap:6px;align-items:center}.comparison-value{min-width:0;padding:7px 8px}.comparison-value small{display:block;font-size:9px;color:var(--muted);margin-bottom:2px}.comparison-value bdi{display:block;direction:ltr;max-width:100%;overflow-wrap:anywhere;font-variant-numeric:tabular-nums;line-height:1.25}.before bdi{font-size:16px;color:var(--muted);font-weight:500}.after{background:var(--blue-soft);border-radius:9px}.after bdi{font-size:22px;font-weight:750;color:var(--blue);letter-spacing:-.5px}.change-arrow{font-size:13px;color:var(--muted);text-align:center}.holding-total{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 15px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);background:var(--soft)}.holding-total bdi{font-size:15px;color:var(--ink);font-weight:650;font-variant-numeric:tabular-nums}
.review-help{margin-top:13px}.date-note{display:none}details{font-size:11px;color:var(--muted)}summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;min-height:34px;width:fit-content}summary::-webkit-details-marker{display:none}summary svg{width:12px;height:12px;transition:transform .2s}details[open] summary svg{transform:rotate(180deg)}details p{font-size:12px;line-height:1.8;margin:6px 0 10px}.actions{display:flex;gap:9px;margin-top:18px}button{font:inherit;font-size:12px;font-weight:600;min-height:46px;border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:var(--surface);color:var(--muted);cursor:pointer;transition:box-shadow .2s}button.primary{flex:1;display:flex;justify-content:center;align-items:center;gap:9px;background:#2467dc;color:#fff;border-color:#2467dc;box-shadow:0 4px 12px rgb(36 103 220 / .16)}button:hover:not(:disabled){box-shadow:0 4px 14px rgb(36 103 220 / .2)}button:disabled{opacity:.48;cursor:default}button:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}main[data-state="saving"] button.primary:before{content:"";width:14px;height:14px;border:2px solid rgb(255 255 255 / .35);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite}main[data-state="saving"] button.primary{opacity:1}main[data-state="applied"] .actions,main[data-state="cancelled"] .actions{display:none}
#status,#error{font-size:12px;line-height:1.8;margin-top:14px;padding:11px 13px;border-radius:10px;background:var(--soft)}#status.success{color:var(--blue);background:var(--blue-soft)}#error,#blocked{color:light-dark(#b42318,#ffb4ab)}#unchanged,#blocked{font-size:11px;margin-top:12px}#privacy{display:block;font-size:10px;color:var(--muted);line-height:1.8;margin-top:13px;text-align:center}#unchanged:empty,#blocked:empty,#status:empty,#error:empty{display:none}[hidden]{display:none!important}
.success-mark{display:none;width:40px;height:40px;background:var(--blue-soft);color:var(--blue);border-radius:50%;place-items:center;margin-bottom:12px}.success-mark svg{width:22px;height:22px;stroke-dasharray:30;stroke-dashoffset:30;animation:check .45s .12s ease forwards}main[data-state="applied"] .success-mark{display:grid;animation:arrive .3s ease both}.portfolio{animation:arrive .35s ease both}.portfolio-heading{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.portfolio-heading h2{font-size:15px;font-weight:700}.portfolio-heading span{font-size:10px;color:var(--muted)}.portfolio-overview{display:grid;grid-template-columns:1fr auto;align-items:end;gap:12px;padding:18px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(120deg,var(--blue-soft),var(--soft));margin-bottom:16px}.portfolio-overview small{font-size:10px;color:var(--muted);display:block}.portfolio-overview strong{display:block;font-size:27px;font-weight:750;letter-spacing:-.8px;margin-top:3px}.portfolio-count{text-align:end;color:var(--blue);font-size:12px}.portfolio-count b{font-size:22px;display:block;font-weight:700}.portfolio-list{max-height:420px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--line);border-radius:14px}.portfolio-holding{padding:14px;border-bottom:1px solid var(--line);animation:arrive .3s ease both;animation-delay:var(--delay,0ms)}.portfolio-holding:last-child{border-bottom:0}.portfolio-identity{display:flex;align-items:center;gap:9px;margin-bottom:12px}.portfolio-identity bdi{font-size:14px;font-weight:750}.portfolio-identity small{display:block;font-size:10px;color:var(--muted)}.portfolio-identity .ticker-avatar{width:31px;height:31px;font-size:10px;border-radius:9px}.portfolio-symbol{flex:1;min-width:0;overflow-wrap:anywhere}.updated-tag{font-size:9px;color:var(--blue);background:var(--blue-soft);border-radius:5px;padding:3px 6px}.portfolio-numbers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.portfolio-numbers small{font-size:9px;color:var(--muted);display:block;margin-bottom:3px}.portfolio-numbers bdi{font-size:13px;font-weight:650;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.portfolio-note{font-size:10px;color:var(--muted);line-height:1.8;margin-top:11px}.portfolio-empty{padding:18px;font-size:12px;color:var(--muted)}#toggle-review{border:0;background:none;padding:8px 0;min-height:40px;color:var(--blue);font-size:11px;margin-top:8px}main[data-state="applied"] #review{margin-top:18px}main[data-state="applied"] #status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);padding:0;margin:0}main[data-state="applied"] .intro{display:none}main[data-state="cancelled"] .intro{display:none}
.trade-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:var(--blue-soft);border:1px solid var(--line);border-radius:14px 14px 0 0;color:var(--blue)}.trade-banner span{font-size:12px;font-weight:600}.trade-banner bdi{font-size:20px;font-weight:750}.trade-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:16px;border:1px solid var(--line);border-top:0;border-radius:0 0 14px 14px;margin:0}.trade-facts div{min-width:0}.trade-facts dt{font-size:10px;color:var(--muted);margin-bottom:4px}.trade-facts dd{font-size:15px;font-weight:650;margin:0;overflow-wrap:anywhere}.trade-facts .trade-total{grid-column:1/-1;padding-top:12px;border-top:1px solid var(--line)}.trade-facts .trade-total dd{font-size:24px;color:var(--blue);letter-spacing:-.5px}#transaction-details{margin-bottom:20px}#trade-warning:empty{display:none}
@keyframes arrive{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes check{to{stroke-dashoffset:0}}
@media(max-width:420px){.content{padding:22px 16px 17px}.topbar{padding:16px 16px 0}.steps{padding:16px 16px 0}h1{font-size:26px}.holding-stat{padding-inline:12px;gap:6px}.holding-identity{padding:13px}.comparison-value{padding:7px 6px}.after bdi{font-size:20px}.holding-total{padding-inline:13px}.portfolio-overview{padding:15px}.portfolio-overview strong{font-size:24px}}
@media(max-width:340px){h1{font-size:24px}.holding-stat{grid-template-columns:minmax(0,.8fr) minmax(0,1.7fr)}.stat-label{font-size:10px}.comparison{gap:3px;grid-template-columns:minmax(0,1fr) 10px minmax(0,1fr)}.after bdi{font-size:18px}.before bdi{font-size:14px}.holding-kind{font-size:9px}.portfolio-numbers{gap:5px}.portfolio-numbers bdi{font-size:11px}.private-note{font-size:9px}.portfolio-overview{gap:6px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}.success-mark svg{stroke-dashoffset:0}}
</style></head><body><main aria-label="סקירת סנכרון">
<div class="topbar"><span class="brand" dir="ltr"><span class="brand-mark" aria-hidden="true"><img src="${CHAT_SYNC_BRAND_ICON_DATA_URI}" width="26" height="26" alt="" /></span>LiveStocks</span><span class="private-note"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>התיק האישי שלך</span></div>
<ol class="steps" aria-label="שלבי העדכון"><li id="step-review" class="active" aria-current="step"><b>01</b>בודקים</li><li id="step-save"><b>02</b>מעדכנים</li><li id="step-portfolio"><b>03</b>התיק שלך</li></ol>
<div class="content"><header class="card-header"><div class="success-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></div><p id="eyebrow" class="eyebrow">מהצילום לתיק שלך</p><h1 id="headline">נעדכן את התיק?</h1><p id="intro" class="intro">אלה השינויים מהצילום. כדאי לעבור עליהם רגע — אחרי האישור נציג כאן את התיק המעודכן.</p><p id="description">רק רגע, טוענים את הפרטים…</p></header>
<section id="portfolio" class="portfolio" aria-label="התיק אחרי העדכון" hidden><div class="portfolio-heading"><h2>זה מה שיש לך עכשיו</h2><span id="portfolio-time"></span></div><div id="portfolio-overview" class="portfolio-overview" hidden><div><small>סך עלות הקנייה</small><strong><bdi id="portfolio-total"></bdi></strong></div><div class="portfolio-count"><b id="portfolio-count"></b>החזקות</div></div><div id="portfolio-list" class="portfolio-list"></div><p id="portfolio-note" class="portfolio-note"></p></section>
<button id="toggle-review" aria-expanded="false" aria-controls="review" hidden>מה השתנה בעדכון הזה?</button>
<div id="review" hidden><section id="transaction-details" aria-label="פרטי העסקה" hidden><div class="trade-banner"><span id="trade-side"></span><bdi id="trade-symbol"></bdi></div><dl id="trade-facts" class="trade-facts"></dl><p id="trade-warning" class="portfolio-note"></p></section><div class="review-summary"><span id="summary-count" class="summary-count"></span><span id="summary-state" class="summary-state">ממתין לאישור שלך</span></div><div class="table-wrap"><table role="table"><caption>השינויים המוצעים</caption><thead class="sr-only" role="rowgroup"><tr role="row"><th role="columnheader" scope="col">מניה</th><th role="columnheader" scope="col">כמות מניות לפני ואחרי</th><th role="columnheader" scope="col">מחיר קנייה ממוצע בדולר לפני ואחרי</th><th role="columnheader" scope="col">סך עלות הקנייה</th></tr></thead><tbody id="rows" role="rowgroup"></tbody></table></div><p id="unchanged" class="muted"></p><p id="blocked" role="alert"></p><div class="review-help"><small class="date-note">אפשר להשלים תאריך רכישה בצ׳אט.</small><details><summary>מה עוד כדאי לדעת?<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg></summary><p>סכומי הקנייה מחושבים לפי הכמות והמחיר הממוצע, כולל העמלות שנמסרו. זה לא השווי של המניות היום. העדכון שומר את העסקאות הקודמות ולא מבצע קנייה או מכירה בבורסה. אם חסר תאריך קנייה, אפשר להוסיף אותו בצ׳אט גם אחר כך. תאריך משוער יסומן ככזה; בלי היסטוריה מלאה אי אפשר לחשב רווח כולל ומס בצורה מדויקת.</p></details></div></div>
<p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>
<div class="actions"><button id="confirm" class="primary" disabled>כן, לעדכן את התיק</button><button id="cancel" disabled>לא עכשיו</button></div>
<small id="privacy" class="muted">מעדכנים רק את מה שמופיע כאן. שאר התיק נשאר כמו שהוא.</small>
</div></main><script>
(function(){
'use strict';
var data=null, confirmationSecret='', ready=false, busy=false, completed=false, nextId=1, generation=0;
var pending=new Map();
var el=function(id){return document.getElementById(id);};
var number=function(value){return typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('he-IL',{maximumFractionDigits:4}):'—';};
function text(id,value){el(id).textContent=value;}
var money=function(value,digits){return typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('he-IL',{style:'currency',currency:'USD',maximumFractionDigits:digits||2}):'—';};
function node(tag,className,value){var item=document.createElement(tag);if(className)item.className=className;if(value!==undefined)item.textContent=value;return item;}
function phase(state){
  var main=document.querySelector('main');main.dataset.state=state;main.setAttribute('aria-busy',state==='saving'?'true':'false');
  ['review','save','portfolio'].forEach(function(name,index){var item=el('step-'+name),active=state==='applied'?true:state==='saving'?index<2:index===0;item.classList.toggle('active',active);if((state==='applied'&&index===2)||(state==='saving'&&index===1)||(!['applied','saving'].includes(state)&&index===0))item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
}
function showPortfolio(portfolio){
  el('portfolio').hidden=false;el('portfolio-list').replaceChildren();el('portfolio-overview').hidden=true;text('portfolio-time','');
  if(!portfolio||portfolio.status!=='available'||!Array.isArray(portfolio.holdings)){
    text('portfolio-note','העדכון נשמר, אבל לא הצלחנו לטעון עכשיו את כל התיק. אפשר לבקש בצ׳אט ״תראה לי את התיק״.');return;
  }
  var holdings=portfolio.holdings,changed=new Set(data&&data.plan&&Array.isArray(data.plan.changes)?data.plan.changes.map(function(row){return row.symbol+'|'+data.plan.location;}):[]),total=0,complete=true;
  holdings.forEach(function(row,index){
    var cost=typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&typeof row.averageCostUsd==='number'&&Number.isFinite(row.averageCostUsd)?row.quantity*row.averageCostUsd:null;
    if(cost===null||!Number.isFinite(cost)||row.costComplete===false)complete=false;else total+=cost;
    var card=node('article','portfolio-holding');card.style.setProperty('--delay',Math.min(index,7)*35+'ms');card.setAttribute('aria-label',String(row.symbol));
    var identity=node('div','portfolio-identity');identity.appendChild(node('span','ticker-avatar',String(row.symbol).slice(0,2)));
    var info=node('div','portfolio-symbol');info.appendChild(node('bdi','',String(row.symbol)));info.appendChild(node('small','',row.sourceName||'מקור השקעה לא ידוע'));identity.appendChild(info);
    if(changed.has(row.symbol+'|'+row.location))identity.appendChild(node('span','updated-tag','עודכן עכשיו'));
    card.appendChild(identity);var stats=node('div','portfolio-numbers');[['מניות',number(row.quantity)],[row.costComplete===false?'מחיר ממוצע · עמלה חסרה':'מחיר קנייה ממוצע',money(row.averageCostUsd,4)],[row.costComplete===false?'עלות ידועה · בלי עמלה חסרה':'סך עלות הקנייה',money(cost)]].forEach(function(item){var block=node('div','');block.appendChild(node('small','',item[0]));block.appendChild(node('bdi','',item[1]));stats.appendChild(block);});card.appendChild(stats);el('portfolio-list').appendChild(card);
  });
  if(!holdings.length)el('portfolio-list').appendChild(node('p','portfolio-empty','כרגע אין מניות פתוחות בתיק.'));
  el('portfolio-overview').hidden=false;text('portfolio-total',complete?money(total):'חסרים נתוני קנייה או עמלות');text('portfolio-count',number(holdings.length));
  var date=new Date(portfolio.fetchedAt);if(Number.isFinite(date.getTime()))text('portfolio-time','נבדק ב־'+date.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}));
  text('portfolio-note','כל ההחזקות הפתוחות, מכל החשבונות שלך. הסכומים כאן הם עלות הקנייה, ולא שווי השוק היום.'+(complete?'':' הסכום הכולל לא מוצג כי חסרים נתוני קנייה.'));
}
function transaction(){return data&&data.kind==='transaction';}
function confirmLabel(){return transaction()?(data.input.side==='SELL'?'כן, לשמור את המכירה':'כן, לשמור את הקנייה'):'כן, לעדכן את התיק';}
function tradeDetails(value){
  var input=value.input||{},sell=input.side==='SELL';el('transaction-details').hidden=false;el('trade-facts').replaceChildren();
  text('headline',sell?'נרשום את המכירה?':'נרשום את הקנייה?');text('eyebrow','עדכון קטן, והתיק מסודר');text('intro','אלה הפרטים שסיפרת לנו. אחרי האישור נשמור את העסקה ונציג כאן את התיק המעודכן.');text('trade-side',sell?'מכירה שביצעת':'קנייה שביצעת');text('trade-symbol',input.symbol||'');
  var gross=input.quantity*input.priceUsd,known=typeof input.commissionUsd==='number'&&Number.isFinite(input.commissionUsd),net=known?gross+(sell?-1:1)*input.commissionUsd:null;
  [['כמות מניות',number(input.quantity)],['מחיר למניה',money(input.priceUsd,4)],['מתי זה היה?',String(input.executedOn||'').split('-').reverse().join('.')],['עמלה',known?money(input.commissionUsd):'לא נמסרה'],[sell?'סכום המכירה לפני עמלה ומס':'סכום הקנייה לפני עמלה',money(gross)],[sell?'תמורה אחרי עמלה, לפני מס':'סך הקנייה כולל עמלה',known?money(net):'הסכום הסופי תלוי בעמלה']].forEach(function(item,index){var block=node('div',index===5?'trade-total':'');block.appendChild(node('dt','',item[0]));var amount=node('dd','');amount.appendChild(node('bdi','',item[1]));block.appendChild(amount);el('trade-facts').appendChild(block);});
  var warnings=Array.isArray(value.plan.warnings)?value.plan.warnings.filter(function(item){return typeof item==='string';}):[];
  text('trade-warning',(known?'':'העמלה לא נמסרה. נשמור את זה כמידע חסר, ואפשר להשלים בהמשך. ')+warnings.filter(function(item){return known||item.indexOf('לא נמסרה עמלה')===-1;}).join(' '));text('privacy','רק רושמים כאן עסקה שכבר עשית. אחרי האישור היא תתווסף להיסטוריית התיק.');
}
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
  if(expired&&!completed){phase('expired');text('summary-state','צריך צילום מצב חדש');text('status','עבר זמן מאז שהכנו את העדכון. אפשר לבקש בצ׳אט להכין אותו שוב.');}
}
function accept(result){
  if(!result||typeof result!=='object')return;
  var value=result.structuredContent;
  if(!value||typeof value!=='object')return;
  if(value.applied===true||value.status==='applied'){
    if(typeof value.proposalId!=='string'||(data&&value.proposalId!==data.proposalId))return;
    phase('applied');text('headline','התיק שלך מעודכן');text('eyebrow','הכול נשמר');text('summary-state','השינויים שנשמרו');el('review').hidden=true;el('toggle-review').hidden=!(data&&data.plan);el('toggle-review').setAttribute('aria-expanded','false');if(!completed||value.portfolio)showPortfolio(value.portfolio);completed=true;confirmationSecret='';text('error','');text('confirm','עודכן');text('status',transaction()?'העסקה נשמרה. הנה התיק שלך אחרי העדכון.':'השינויים נשמרו. שאר התיק והעסקאות הקודמות נשארו כמו שהם.');text('privacy','');el('status').className='success';controls();size();return;
  }
  if(value.status==='cancelled'){
    if(typeof value.proposalId!=='string'||(data&&value.proposalId!==data.proposalId))return;
    phase('cancelled');text('headline','השארנו הכול כמו שהיה');text('eyebrow','העדכון בוטל');text('summary-state','לא שינינו כלום');completed=true;confirmationSecret='';text('error','');text('status','לא עדכנו שום דבר בתיק. אפשר להכין בקשה חדשה בצ׳אט.');controls();size();return;
  }
  if(value.status==='unchanged'||value.status==='needs_details'){
    generation+=1;data=null;confirmationSecret='';busy=false;completed=true;phase(value.status);el('review').hidden=true;el('portfolio').hidden=true;el('toggle-review').hidden=true;text('error','');el('status').className='';text('headline',value.status==='unchanged'?'הכול כבר תואם':'חסר לנו עוד פרט');
    text('description',value.status==='unchanged'?'היתרות כבר תואמות.':'יש להשלים רק את הפרטים החסרים בצ׳אט.');
    text('status',value.status==='unchanged'?'לא נדרש שינוי.':((value.plan&&Array.isArray(value.plan.blocked))?value.plan.blocked.map(function(row){return row.symbol+' — '+(row.reason==='missing_cost'?'חסר מחיר קנייה ממוצע':row.reason==='observation_precedes_recorded_events'?'יש בתיק עסקאות חדשות יותר מהצילום':'צריך לבדוק את הנתונים שכבר בתיק');}).join('. '):''));controls();size();return;
  }
  if(!value.plan||typeof value.proposalId!=='string')return;
  // Host globals can replay the original prepare after an action. An immutable
  // pending review must not erase its receipt/error or restore its capability.
  var sameProposal=data&&data.proposalId===value.proposalId;
  if(sameProposal&&value.status==='pending'&&(completed||busy||(data.status==='pending'&&confirmationSecret)))return;
  if(!sameProposal){generation+=1;busy=false;}else if(busy)return;
  data=value;completed=false;phase('pending');el('portfolio').hidden=true;el('toggle-review').hidden=true;text('headline','נעדכן את התיק?');text('eyebrow','מהצילום לתיק שלך');text('intro','אלה השינויים מהצילום. כדאי לעבור עליהם רגע — אחרי האישור נציג כאן את התיק המעודכן.');el('transaction-details').hidden=true;text('privacy','מעדכנים רק את מה שמופיע כאן. שאר התיק נשאר כמו שהוא.');text('summary-state','עוד לא שינינו כלום');var changeCount=Array.isArray(value.plan.changes)?value.plan.changes.length:0;text('summary-count',changeCount===1?'מניה אחת לעדכון':number(changeCount)+' מניות לעדכון');
  // Only the hidden result metadata supplies the mutation capability.
  confirmationSecret=result._meta&&typeof result._meta.confirmationSecret==='string'?result._meta.confirmationSecret:'';
  el('review').hidden=false;el('rows').replaceChildren();text('error','');text('status','');el('status').className='';text('confirm','כן, לעדכן את התיק');
  var location=typeof value.plan.sourceName==='string'?value.plan.sourceName:'';
  var observedDate=String(value.plan.observedAt||'').split('-');
  text('description',location+' · צילום מ־'+(observedDate.length===3?observedDate.reverse().join('.'):String(value.plan.observedAt||'')));
  if(value.kind==='transaction'){tradeDetails(value);text('confirm',confirmLabel());text('summary-count','ככה זה ישפיע על התיק');text('description',location+' · עסקה מ־'+String(value.input.executedOn||'').split('-').reverse().join('.'));}
  (Array.isArray(value.plan.changes)?value.plan.changes:[]).forEach(function(row){
    var tr=document.createElement('tr');tr.className='holding-card';tr.setAttribute('role','row');
    var identity=document.createElement('td');identity.className='holding-identity';identity.setAttribute('role','cell');
    var avatar=document.createElement('span');avatar.className='ticker-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=String(row.symbol).slice(0,2);identity.appendChild(avatar);
    var info=document.createElement('span');info.className='ticker-info';var symbol=document.createElement('bdi');symbol.className='ticker-symbol';symbol.textContent=String(row.symbol);info.appendChild(symbol);
    var date=document.createElement('small');date.className='acquisition-date';date.hidden=value.kind==='transaction';date.textContent=row.acquiredOn?'נקנה ב־'+String(row.acquiredOn).split('-').reverse().join('.'):row.estimatedAcquiredOn?'תאריך משוער: '+String(row.estimatedAcquiredOn).split('-').reverse().join('.'):'תאריך הקנייה לא ידוע';info.appendChild(date);identity.appendChild(info);
    var kind=document.createElement('span');kind.className='holding-kind';kind.textContent=row.quantity===0?'יוצאת מהתיק':row.previousQuantity===0?'חדשה בתיק':'מתעדכנת';identity.appendChild(kind);tr.appendChild(identity);
    function stat(label,before,after){
      var cell=document.createElement('td');cell.className='holding-stat';cell.setAttribute('role','cell');var title=document.createElement('span');title.className='stat-label';title.textContent=label;cell.appendChild(title);
      var comparison=document.createElement('span');comparison.className='comparison';
      [['before','בתיק',before],['after',value.kind==='transaction'?'אחרי העסקה':'מהצילום',after]].forEach(function(item,index){
        if(index){var arrow=document.createElement('span');arrow.className='change-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='←';comparison.appendChild(arrow);}
        var part=document.createElement('span');part.className='comparison-value '+item[0];var hint=document.createElement('small');hint.textContent=item[1];var amount=document.createElement('bdi');amount.textContent=item[2];part.appendChild(hint);part.appendChild(amount);comparison.appendChild(part);
      });cell.appendChild(comparison);return cell;
    }
    tr.appendChild(stat('כמות מניות',number(row.previousQuantity),number(row.quantity)));
    tr.appendChild(stat('מחיר קנייה ממוצע · $',number(row.previousAverageCostUsd),row.quantity===0?'—':number(row.averageCostUsd)));var total=document.createElement('td');total.className='holding-total';total.setAttribute('role','cell');var totalLabel=document.createElement('span');totalLabel.textContent=value.plan.costComplete===false?'עלות ידועה · חסרים נתוני עמלה':'סך עלות הקנייה אחרי העדכון';var totalAmount=document.createElement('bdi');totalAmount.textContent=typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&(row.quantity===0||(typeof row.averageCostUsd==='number'&&Number.isFinite(row.averageCostUsd)))?money(row.quantity===0?0:row.quantity*row.averageCostUsd):'—';total.appendChild(totalLabel);total.appendChild(totalAmount);tr.appendChild(total);el('rows').appendChild(tr);
  });
  var unchanged=Array.isArray(value.plan.unchanged)?value.plan.unchanged.length:0;
  text('unchanged',unchanged?unchanged+' מניות כבר תואמות לצילום ולא צריכות עדכון.':'');
  var blocked=Array.isArray(value.plan.blocked)?value.plan.blocked:[];
  text('blocked',blocked.length?'חסרים פרטים כדי לעדכן את: '+blocked.map(function(row){return row.symbol;}).join(', '):'');
  if(value.status==='superseded')text('status','יש כבר עדכון חדש יותר. כדאי לעבור לכרטיס האחרון בצ׳אט.');
  if(!confirmationSecret&&value.status==='pending')text('status','כדי לעדכן מכאן, צריך לחבר את LiveStocks עם הרשאה לעדכון מהצילום.');
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
  var confirming=name==='confirm_screenshot_sync'||name==='confirm_chat_transaction';if(confirming&&el('confirm').disabled)return;
  var proposalId=data.proposalId,secret=confirmationSecret,actionGeneration=generation;
  busy=true;phase('saving');text('confirm',confirming?'מעדכנים את התיק…':'מבטלים…');text('summary-state','שומרים את השינויים');text('error','');text('status',confirming?'רק רגע, שומרים ואז נטען את התיק המעודכן.':'מבטלים את העדכון…');controls();
  try{
    var result=await call(name,{proposalId:proposalId,confirmationSecret:secret});
    if(data&&data.proposalId===proposalId&&generation===actionGeneration){accept(result);if(!completed)throw new Error('לא התקבל אישור שמירה. נסו שוב או בקשו לבדוק את מצב ההצעה.');}
  }catch{if(data&&data.proposalId===proposalId&&generation===actionGeneration){text('status','');text('error',confirming?'לא הצלחנו לוודא שהעדכון נשמר. אפשר לנסות שוב — הוא לא יישמר פעמיים.':'לא הצלחנו לוודא שהעדכון בוטל. אפשר לנסות שוב או לבדוק בצ׳אט.');if(confirming)text('confirm','ניסיון חוזר');}}
  finally{if(generation===actionGeneration){busy=false;if(!completed){phase('pending');text('summary-state','לא התקבל אישור שמירה');if(!confirming)text('confirm',confirmLabel());}controls();size();}}
}
el('toggle-review').addEventListener('click',function(){el('review').hidden=!el('review').hidden;this.setAttribute('aria-expanded',String(!el('review').hidden));size();});
el('confirm').addEventListener('click',function(){void action(transaction()?'confirm_chat_transaction':'confirm_screenshot_sync');});
el('cancel').addEventListener('click',function(){void action(transaction()?'cancel_chat_transaction':'cancel_screenshot_sync');});
window.addEventListener('message',function(event){
  if(event.source!==window.parent||!event.data||event.data.jsonrpc!=='2.0')return;
  var message=event.data;
  if(message.id!==undefined&&pending.has(message.id)){
    var work=pending.get(message.id);clearTimeout(work.timer);pending.delete(message.id);
    if(message.error)work.reject(new Error(message.error.message||'החיבור למארח לא הושלם.'));else work.resolve(message.result);
    return;
  }
  if(message.method==='ui/notifications/tool-result')accept(message.params);
  if(message.method==='ui/notifications/tool-cancelled'){text('status','הבקשה בוטלה במארח. לא התקבל אישור שמירה.');busy=false;if(!completed){phase('pending');text('confirm',confirmLabel());}controls();}
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
  rpc('ui/initialize',{appInfo:{name:'LiveStocks screenshot review',version:'1.0.0'},appCapabilities:{availableDisplayModes:['inline']},protocolVersion:'2026-01-26'}).then(function(){ready=true;notify('ui/notifications/initialized',{});controls();size();}).catch(function(){if(!ready){text('status','כרגע אי אפשר לאשר מהכרטיס הזה. לא שינינו כלום בתיק.');controls();}});
}else if(!ready){text('status','אפשר לאשר את העדכון מתוך הכרטיס ב־ChatGPT.');}
setInterval(controls,1000);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(size).observe(document.body);
})();
</script></body></html>`;

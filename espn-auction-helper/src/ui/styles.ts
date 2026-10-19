export const PANEL_CSS = `
:host { all: initial; }
.panel {
  --bg: #0c111c; --surface: #131a29; --raised: #1a2336; --line: #232d42; --text: #e6e9f1; --muted: #8890a4;
  --bid: #34d399; --bidup: #a3e635; --let: #f87171; --pass: #94a3b8; --lead: #60a5fa; --warn: #fbbf24; --hot: #fb923c;
  width: 360px; max-height: 85vh; overflow: auto; background: var(--bg); color: var(--text);
  font: 12.5px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; font-variant-numeric: tabular-nums;
  border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 32px rgba(0, 0, 0, .45);
}
header { position: sticky; top: 0; z-index: 1; display: flex; gap: 8px; align-items: center; padding: 8px 8px 8px 12px; background: var(--surface); border-bottom: 1px solid var(--line); cursor: move; }
header strong { font-size: 13px; }
.health { font-size: 11px; }
.health.live { color: var(--bid); }
.health.waiting { color: var(--muted); }
.badges { margin-left: auto; display: flex; gap: 4px; }
.badge { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: var(--raised); color: var(--muted); border: 1px solid var(--line); white-space: nowrap; }
.badge.Hot { color: var(--hot); }
.badge.Warm { color: var(--warn); }
.badge.Neutral { color: var(--text); }
.badge.Cold { color: var(--lead); }
.collapse, .reset { width: 22px; height: 22px; padding: 0; line-height: 22px; text-align: center; }
.reset { background: none; color: var(--muted); }
.reset:hover { color: var(--let); }
section, .picker, .banner, .alert { display: block; padding: 8px 12px; border-top: 1px solid var(--line); }
header + * { border-top: 0; }
.banner { background: #7c2d12; }
.alert { display: flex; gap: 6px; align-items: flex-start; background: #78350f; color: #fde68a; }
.alert span { flex: 1; }
.alert button { background: none; color: inherit; padding: 0 2px; }
.picker { color: var(--muted); }
.picker.compact { display: flex; align-items: center; gap: 8px; }
.picker.compact select { width: auto; flex: 1; }

.now { --k: var(--pass); margin: 8px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--k) 40%, var(--line)); border-radius: 10px; background: color-mix(in srgb, var(--k) 9%, var(--surface)); }
.now + section { border-top: 0; }
.now.idle { --k: var(--line); }
.now.BID { --k: var(--bid); }
.now.BID_UP { --k: var(--bidup); }
.now.LET_THEM { --k: var(--let); }
.now.PASS { --k: var(--pass); }
.now.LEADING { --k: var(--lead); }
.call { font-size: 20px; font-weight: 750; letter-spacing: -.2px; color: var(--k); }
.who { display: flex; justify-content: space-between; gap: 8px; margin-top: 1px; color: var(--muted); }
.who b { color: var(--text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who span { white-space: nowrap; }
.idle-text { color: var(--muted); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 6px; }
.now .stats { margin-top: 8px; }
.stat { display: flex; flex-direction: column; padding: 5px 8px; border-radius: 7px; background: var(--surface); min-width: 0; }
.now .stat { flex-direction: column-reverse; background: rgba(0, 0, 0, .2); }
.stat b { font-size: 15px; font-weight: 650; }
.stat .k { display: flex; align-items: center; gap: 4px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); white-space: nowrap; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.dot.value { background: var(--text); }
.dot.avg { background: var(--warn); }
.dot.max { background: var(--k); }
.bar { position: relative; height: 6px; margin: 12px 0 4px; border-radius: 999px; background: rgba(255, 255, 255, .08); }
.bar .fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 999px; background: var(--k); opacity: .8; }
.bar .fill.over { background: var(--let); }
.bar .tick { position: absolute; top: -3px; width: 2px; height: 12px; margin-left: -1px; border-radius: 1px; box-shadow: 0 0 0 1px var(--bg); }
.tick.value { background: var(--text); }
.tick.avg { background: var(--warn); }
.tick.max { background: var(--k); }
.note { margin-top: 6px; font-size: 11.5px; color: var(--muted); }
.warn { color: #fca5a5; }

.turn { color: var(--muted); padding-bottom: 2px; }
.turn .call { font-size: 13px; font-weight: 700; color: var(--bid); }
.turn + .nominate { border-top: 0; padding-top: 2px; }
.nominate .label, h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); font-weight: 600; }
.nominate .label { margin-right: 6px; }
.nominate b { font-weight: 600; }
.pill { margin-left: 6px; padding: 0 6px; border-radius: 999px; font-size: 10px; background: var(--raised); color: var(--muted); }
.why { margin-top: 2px; font-size: 11.5px; color: var(--muted); }

h4 { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 4px; }
h4 .cols { font-weight: 400; text-transform: none; letter-spacing: 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2px 4px; white-space: nowrap; }
td:first-child { max-width: 170px; overflow: hidden; text-overflow: ellipsis; padding-left: 0; }
td.num { text-align: right; color: var(--muted); }
td.num:last-child { color: var(--text); padding-right: 0; }
tr.over td:last-child, .over-key { color: var(--warn); }
tr.over td:last-child { font-weight: 650; }

.sale { display: grid; grid-template-columns: minmax(0, 1fr) auto 34px 50px; gap: 8px; align-items: center; padding: 1px 0; }
.sale .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sale.bargain .name::before { content: '⭐ '; }
.sale .team { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--muted); }
.price { text-align: right; font-weight: 650; }
.price.under { color: var(--bid); }
.price.over { color: var(--let); }
.val { text-align: right; font-size: 11px; color: var(--muted); }
.empty { color: var(--muted); }

.look { display: grid; grid-template-columns: minmax(0, 1fr) auto 34px 34px; gap: 8px; align-items: baseline; padding: 1px 0; }
.look .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.look.value .name { color: var(--bid); }
.look .tags { font-size: 10.5px; color: var(--muted); white-space: nowrap; }
.look .price { color: var(--text); }
.note.flag.value { color: var(--bid); }
.note.flag.overpay { color: var(--warn); }
.note.profile { color: var(--text); }
.note.injury.prone { color: var(--let); }
.note.injury.recent { color: var(--warn); }
.inj { margin-left: 5px; padding: 0 4px; border-radius: 3px; font-size: 9.5px; font-weight: 700; letter-spacing: .3px; vertical-align: 1px; }
.inj.prone { color: var(--let); background: color-mix(in srgb, var(--let) 16%, transparent); }
.inj.recent { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
.memo { margin-left: 4px; font-size: 10px; cursor: help; }
.note.mine { color: var(--text); }
.tabs { display: flex; gap: 2px; min-width: 0; }
.tabs button { padding: 1px 7px; border-radius: 999px; background: none; color: var(--muted); font: inherit; text-transform: inherit; letter-spacing: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabs button[aria-selected="true"] { background: var(--raised); color: var(--text); }
.tabs button:disabled { opacity: .45; cursor: default; }

button { font: inherit; background: var(--raised); color: inherit; border: 0; border-radius: 5px; padding: 2px 6px; cursor: pointer; }
input, select { font: inherit; background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; margin: 2px 0; width: 100%; box-sizing: border-box; }
`

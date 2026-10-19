/** Page styles; the panel keeps its own (Shadow DOM, 340 px wide, fixed top right). */
export const SIM_CSS = `
:root { color-scheme: dark; }
body { margin: 0; background: #0b1020; color: #e5e7eb; font: 13px/1.45 system-ui, sans-serif; }
.sim { margin-right: 372px; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
header { font-size: 15px; }
.muted { color: #9ca3af; }
.error { color: #fca5a5; }
button { background: #1f2937; color: inherit; border: 1px solid #374151; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
button.on { background: #2563eb; border-color: #2563eb; }
button:disabled { opacity: .5; cursor: default; }
input, select { background: #111827; color: inherit; border: 1px solid #374151; border-radius: 6px; padding: 3px 6px; }
input[type=number] { width: 72px; }
input.bots { width: 380px; }
.controls .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.team { display: flex; flex-direction: column; padding: 6px 8px; border: 1px solid #1f2937; border-radius: 8px; background: #111827; }
.team.mine { border-color: #2563eb; }
.team.clock { box-shadow: 0 0 0 2px #f59e0b; }
.block { padding: 12px; border-radius: 10px; background: #111827; min-height: 90px; }
.player { font-size: 18px; font-weight: 600; }
.price { font-size: 22px; margin: 4px 0; }
.countdown { font-size: 14px; color: #f59e0b; margin-left: 8px; }
.actions { display: flex; gap: 6px; align-items: center; }
.nominate ul { list-style: none; padding: 0; margin: 6px 0 0; }
.nominate li { margin: 3px 0; }
.feed .mine, .standings .mine { color: #93c5fd; }
.tunables { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 12px; margin-top: 6px; }
.tunables label { display: flex; justify-content: space-between; gap: 6px; }
.tunables label.changed { color: #fbbf24; }
code { display: block; margin-top: 6px; padding: 6px; background: #111827; border-radius: 6px; word-break: break-all; }
table.standings { border-collapse: collapse; }
.standings th, .standings td { padding: 2px 6px; text-align: right; }
.standings td:nth-child(2), .standings th:nth-child(2) { text-align: left; }
h3 { margin: 8px 0 4px; font-size: 13px; }
`

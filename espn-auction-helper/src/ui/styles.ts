export const PANEL_CSS = `
:host { all: initial; }
.panel { width: 340px; max-height: 85vh; overflow: auto; background: #111827; color: #e5e7eb; font: 12px/1.4 system-ui, sans-serif; border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .4); }
header { display: flex; gap: 8px; align-items: center; padding: 8px 10px; background: #1f2937; cursor: move; border-radius: 10px 10px 0 0; }
.health.live { color: #34d399; }
.health.manual { color: #9ca3af; }
.temp { margin-left: auto; color: #fbbf24; }
section, .picker, .banner, form, footer { display: block; padding: 6px 10px; border-top: 1px solid #374151; }
.banner { background: #7c2d12; }
.call { font-size: 18px; font-weight: 700; }
.call.BID { color: #34d399; }
.call.BID_UP { color: #a3e635; }
.call.LET_THEM { color: #f87171; }
.call.PASS { color: #9ca3af; }
.call.LEADING { color: #60a5fa; }
.muted { color: #9ca3af; }
.warn { color: #fca5a5; }
h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #9ca3af; }
table { width: 100%; border-collapse: collapse; }
td { padding: 1px 4px; }
button { font: inherit; background: #374151; color: inherit; border: 0; border-radius: 4px; padding: 2px 6px; cursor: pointer; }
input, select { font: inherit; background: #1f2937; color: inherit; border: 1px solid #4b5563; border-radius: 4px; padding: 2px 4px; margin: 2px 0; width: 100%; box-sizing: border-box; }
.row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.pin { background: none; color: #fbbf24; padding: 0; }
.fix { background: none; color: #9ca3af; padding: 0 2px; }
`

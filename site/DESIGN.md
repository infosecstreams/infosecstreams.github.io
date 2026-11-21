---
name: InfoSec Streams
description: Who in infosec is live on Twitch right now, read off a server rack at night.
colors:
  void: "#0b0e12"
  carbon: "#121519"
  graphite: "#1a1d21"
  line: "#2a2d31"
  line-hi: "#3a3d42"
  bone: "#e4e4e4"
  silver: "#bababb"
  steel: "#8a8b8e"
  led: "#00d892"
  led-mid: "#00845a"
  led-dim: "#0f3d30"
  led-fill: "#002923"
  led-fill-hi: "#00402f"
  amber: "#f5b83d"
  fault: "#ff6285"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2rem, 1.6rem + 1.6vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline-handle:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "clamp(1.8rem, 1.4rem + 1.6vw, 2.6rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  handle:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: 1.55
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.55
  terminal:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.08em"
  micro:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.66rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
rounded:
  r: "2px"
  led: "50%"
spacing:
  hair: "2px"
  xs: "0.35rem"
  sm: "0.6rem"
  md: "1rem"
  row-gap: "1.25rem"
  gutter: "1.5rem"
  section: "2.75rem"
  page-end: "3.5rem"
components:
  panel:
    backgroundColor: "{colors.carbon}"
    rounded: "{rounded.r}"
  panel-header:
    textColor: "{colors.silver}"
    typography: "{typography.label}"
    height: "2.5rem"
    padding: "0 1rem"
  sort-header:
    textColor: "{colors.steel}"
    typography: "{typography.label}"
    height: "2.25rem"
  sort-header-active:
    textColor: "{colors.led}"
  row:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.bone}"
    height: "2.75rem"
    padding: "0.3rem 1rem"
  row-hover:
    backgroundColor: "{colors.graphite}"
  row-live:
    padding: "0.75rem 1rem"
  status-pill:
    backgroundColor: "{colors.void}"
    textColor: "{colors.led}"
    typography: "{typography.micro}"
    rounded: "{rounded.r}"
    padding: "0.2rem 0.4rem"
  status-pill-ready:
    textColor: "{colors.amber}"
  button-outline:
    textColor: "{colors.silver}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    height: "2.4rem"
    padding: "0 0.85rem"
  button-outline-hover:
    textColor: "{colors.bone}"
  nav-link:
    textColor: "{colors.steel}"
    typography: "{typography.label}"
    height: "3.5rem"
    padding: "0 0.6rem"
  nav-link-current:
    textColor: "{colors.led}"
  chip:
    textColor: "{colors.silver}"
    typography: "{typography.data}"
    rounded: "{rounded.r}"
    padding: "0.25rem 0.55rem"
  terminal:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.silver}"
    typography: "{typography.terminal}"
    rounded: "{rounded.r}"
    height: "14.25rem"
---

# Design System: InfoSec Streams

## Overview

**Creative North Star: "The Rack at Night"**

The site is a server rack in a dark machine room, read from the front panel. Near-black flat surfaces, 1px hairlines, square corners, and colour that behaves only like status LEDs: green means online, amber means getting ready, and nothing else glows. The reference points are Oxide, Depot and Axiom: engineered hardware and a working terminal, not a hacker costume. It must not read as cheesy or AI-made.

Density is operational. One table holds every streamer: whoever is live comes first, then everyone sorted by streamed hours over the last 30 days. The hero is equipment: a terminal replaying realistic security tool sessions beside a Rive-drawn rack with one sled per streamer. Clicking a sled slides it out in 3D and opens it into a full-window rack-mount KVM console. Everything technical (navigation, labels, handles, figures, buttons) is set in mono. Anything human (headings, stream titles, prose) is set in a plain sans.

Trust is a visual rule as much as a data rule. When the data is unsure, the interface shows nothing: no speculative next-stream text, no countdowns, no placeholder dashes in empty cells, schedules only for streamers with a proven record, and "getting ready" for at most 20 minutes. Empty means absent, never a guess.

**Key Characteristics:**
- Flat, tonal near-black layers separated by 1px hairlines; 2px corners everywhere.
- LED semantics: green = live, amber = getting ready, red only for faults and falling figures.
- Mono for machine facts, sans for human words; tabular numerals throughout.
- One sortable table, live first, then 30-day hours. No toolbar, search or filters.
- Hardware hero: terminal plus Rive rack, and a sled that opens into a KVM console.
- Spring motion that respects reduced motion; every page works without JavaScript.
- Dark only; 10 languages, Arabic laid out right to left.

## Colors

A monochrome graphite ramp lit by two status lamps.

### Primary
- **LED Green** (`led`): the online lamp. Live LEDs, the lit lamp in the `[•]` mark, the active sort column, the current nav item, focus rings, the caret, the console screen's power glow, and link hover. It is never decoration: green on screen means something is on.
- **LED Green, mid / dim / fill** (`led-mid`, `led-dim`, `led-fill`, `led-fill-hi`): the same lamp unlit or half lit. Dim is the resting segment of the 30-day load meter and the pinned-row ring. Mid is the middle step of the "usually live" heatmap. Fill and fill-hi are the backgrounds behind green text (the skip link, text selection).

### Secondary
- **Standby Amber** (`amber`): "getting ready" only, meaning the category or title switched within the last 20 minutes and the stream is not yet live. It appears on the LED, the thumbnail pill and the console status line.

### Tertiary
- **Fault Red** (`fault`): a failed line in the terminal replay and a falling figure on the streamer page. It is never a status lamp and never marks "live".

### Neutral
- **Void** (`void`): the page ground, theme colour and scrollbar track.
- **Carbon** (`carbon`): panels, the terminal and dropdowns, one step above the ground.
- **Graphite** (`graphite`): row hover, pinned rows, thumbnail wells and unlit meter segments.
- **Line** (`line`): every hairline: panel borders, row dividers, header rules.
- **Line Hi** (`line-hi`): hover borders, unlit LEDs, the unlit lamp, scrollbar thumb.
- **Bone** (`bone`): headings, handles, stream titles and figures. The brightest text.
- **Silver** (`silver`): body text and panel headings.
- **Steel** (`steel`): secondary text, column labels, meta lines and idle icons.

### Named Rules
**The Status Lamp Rule.** Green and amber are signals, not brand colours. If nothing is live, the page has almost no green. Never use green or amber for decoration, emphasis or illustration.

**The Brand Hover Rule.** Twitch purple and YouTube red appear only as the hover state of their own logo links. They are never fills, never resting states, and never on anything else.

**The One Ground Rule.** Dark only. There is no light theme, and the system is not designed for one.

## Typography

**Display Font:** system UI sans (system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, …)
**Body Font:** the same system sans
**Label/Mono Font:** JetBrains Mono, self-hosted Latin subset, preloaded, `font-display: optional` so text never reflows (falls back to ui-monospace / SF Mono / Cascadia Mono / Menlo / Consolas)

**Character:** The mono is the machine talking: handles, numbers, labels, status codes and terminal output. The sans is the people talking: page headings, stream titles and prose. The pairing should look like the front of the hardware next to a printed label.

### Hierarchy
- **Display** (400, fluid 2rem–2.75rem, 1.1, −0.025em): one page heading per page (hero, inactive, FAQ, resources). Light and large, never bold.
- **Headline, handle** (mono 500, fluid 1.8rem–2.6rem, 1.1, −0.03em): the streamer page's name. A login is a machine identifier, so it is set in mono even at headline size.
- **Title** (sans 400, 1rem, bone): a live stream's title in its row; the console title scales up fluidly to 1.25rem and clamps at four lines.
- **Body** (sans 400, 15px, 1.55, silver): prose and lede, at most 46–68ch.
- **Handle** (mono 500, 0.9rem, bone): streamer logins in the table and schedule.
- **Data** (mono 400, 0.75–0.85rem, steel): hours, meta lines, timestamps, chips.
- **Terminal** (mono 400, 0.75rem, 1.6): the hero terminal; always left-to-right.
- **Label** (mono 500, 0.72rem, 1, uppercase, 0.06–0.1em tracking): nav, panel headings, column headers, buttons, footer links, key/value terms.
- **Micro** (mono 600, 0.66rem, uppercase, 0.1em): the LIVE / READY pill and viewer count on thumbnails.

### Named Rules
**The Machine/Human Rule.** If it could appear on a terminal or a panel label, it is mono. If a person wrote it as a sentence, it is sans.

**The Tabular Rule.** Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body), so columns of figures never shimmer when sorted or refreshed.

**The Joined Script Rule.** Uppercase tracking is for Latin labels. In Arabic, Hindi and Chinese, letter-spacing is zero so the script keeps its shape.

## Layout

A single centred column (max 64rem, 1.5rem side gutter). The home page is: top bar (3.5rem), hero (terminal and rack side by side at 1fr / 1.12fr, 2.5rem apart, stacked below 52rem), a "Live now" panel that exists only while someone is live, the full table panel, the proven-schedule panel, then a three-column about block that wraps at 17rem.

Panels stack 1.25rem apart. Inside, everything sits on a 1rem inline inset: panel headers 2.5rem tall, column headers 2.25rem, rows at least 2.75rem. Live rows grow to fit a 176px 16:9 preview (112px on phones). Below 40rem the 30-day meter drops, the hours column header shortens, the nav wraps under the logo, and live rows put the logo links under the title. The streamer page is a two-column panel grid that becomes one column below 48rem.

The console is laid out by container queries on its own screen width (stacked below 900px and 640px), so it reads the same at any window size.

**The Stillness Rule.** Nothing moves the page after first paint. The terminal has a fixed height, the rack has a fixed aspect ratio with a static SVG until Rive has drawn, the list stays hidden until the first live status arrives (or 2.5s), streamer stats reserve their space, and the mono font is `optional`. Target CLS is 0.

## Elevation & Depth

The page is flat. Depth comes from tonal steps (void → carbon → graphite) and 1px hairlines, never from drop shadows on page surfaces. Light exists only where hardware emits it: a lit LED glows, and the heatmap's hottest cells glow faintly. The console is the one exception. It is a physical object in 3D space (a CSS perspective of 2400px), so its lid carries bevel highlights, a recessed screen and a long soft cast shadow, its sled has lit chassis faces, and a radial floor shadow sits under it while it flies.

### Shadow Vocabulary
- **LED glow** (`box-shadow: 0 0 0 2px rgb(0 216 146 / 0.15), 0 0 8px rgb(0 216 146 / 0.55)`): a lit status LED only.
- **Heat glow** (`box-shadow: 0 0 6px rgb(0 216 146 / 0.45)`): the hottest "usually live" cell.
- **Pinned ring** (`box-shadow: inset 0 0 0 1px` led-dim): a table row pinned from the rack.
- **Indicator rule** (`box-shadow: inset 0 -1px 0` led): the current nav item and the active terminal tab; a 1px underline drawn inside the box.
- **Console lid** (`inset 0 1px 0 rgb(255 255 255 / 0.09), inset 0 0 0 1px #33373d, inset 0 -2px 0 rgb(0 0 0 / 0.35), 0 40px 90px -30px rgb(0 0 0 / 0.85)`): the KVM bezel only.

### Named Rules
**The Emitted Light Rule.** A glow means a lamp is on. Surfaces do not float; only the console, which is a real object you pulled out, has physical depth.

## Shapes

Square and machined. One radius, 2px (`r`), on panels, buttons, pills, chips, thumbnails, dropdowns and icon hit areas. Circles are reserved for LEDs. Borders are always 1px: `line` at rest, `line-hi` on hover, `led` for focus. The 30-day meter is ten 4×10px rectangular segments with 2px gaps, lit like a load meter. The heatmap is a 7×24 grid of square cells with a 1px radius. The only softer corners are the console's physical parts (5px lid, 3px hinges), because they are hardware.

## Components

### Buttons
Quiet outlined hardware switches.
- **Shape:** 2px radius, 1px `line` border, no fill, 2.4rem tall (2rem for the language toggle).
- **Text:** label type, uppercase, silver or steel.
- **Hover / Focus:** text goes to bone, border to `line-hi`; focus is a 1px green outline offset 2px. There is no filled primary button. The only green "action" is a text link (the console's watch link, the calendar link).
- **Logo links:** the Twitch and YouTube marks in 2rem square hit areas, steel at rest; on hover the logo takes its brand colour over a `line` background. On the streamer page they carry a label ("On Twitch").

### Sortable column headers
The table's only control.
- **Style:** label type, steel, with a small double-chevron that sharpens to one direction when active.
- **State:** click to sort, click again to reverse; the active column is green. The default is live first, then 30-day hours. The UI says "sorted", never "ranked".

### Cards / Containers (Panels)
- **Corner Style:** 2px.
- **Background:** carbon on the void ground.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `line`; header strip and rows divided by `line`.
- **Internal Padding:** 1rem inline. The header strip is a 2.5rem label-type row with a steel count and optional right-aligned note.

### Roster row
A dense one-liner: handle (mono, bone, green on hover), 30-day load meter, hours, logo links. Row hover is graphite and lights the meter's lit segments full green. When the table is sorted another way, live or ready streamers show their LED before the handle.

### Live row
A taller row: a 176px 16:9 thumbnail with the LIVE (green) or READY (amber) micro pill top-left and the viewer count bottom-left on translucent void, then the handle, the stream title in sans, and one quiet mono meta line.

### Chips
- **Style:** 1px `line` border, 2px radius, data type, silver; a steel sub-value inside.
- **State:** static facts (categories, tags). Not filters.

### Navigation
- **Style:** label type, steel, full-height links in a 3.5rem bar with a hairline bottom. The current page is green with a 1px inset underline. The language menu is a native disclosure toggle with a carbon dropdown. Below 40rem the nav wraps to its own scrolling row.
- **Mark:** `[•]` brackets in bone; the lamp in the middle is lit green while anyone is live.

### Terminal (signature)
A carbon panel with a 2.25rem tab bar ("shell" active with the green underline, the path in steel) and a fixed-height body that replays realistic security tool sessions (nmap and the like) in terminal type: green prompt, bone commands, steel output, green for success, fault red for failures, a blinking green block caret. It is decorative to assistive tech and always left-to-right.

### Rack (signature)
A Rive server rack drawn with the low-level renderer from `scripts/rive/build_rack.py` (no Rive CLI, no watermark), with a static SVG of the same rack underneath. One sled per listed streamer in random slots. Each sled has a mono name plate (bone when live, silver when getting ready, dim at rest), an LED for live status and a bar for 30-day hours. There is no parallax. Rive assets are content-hashed and skipped on Save-Data or slow networks, where the SVG stays.

### Console (signature)
Clicking a sled slides it out of the rack in 3D and opens it into a full-window rack-mount KVM console. Rive draws the drawer front and the keyboard tray; the hinged lid is CSS 3D (bezel, chin with panel buttons and a green power LED, hinge barrels, ribbed back shell). The screen powers on as the lid rises. It shows the name, status, the embedded Twitch player when live and the screen is at least 400×300 (otherwise the preview), recent streams, the heatmap and key figures, a green watch link, logo links and a copy-link button. Motion is two springs (fly: stiffness 170, damping 23; unfold: 120 / 15; closing folds the lid first at 300 / 36, then flies home at 320 / 36), so it can reverse mid-flight. Without the runtime the same springs flip the CSS lid in place.

### Heatmap and key/value grid
"Usually live" is a 7×24 grid of LEDs in four steps (graphite, led-dim, led-mid, led with glow). Key figures are a hairline-gapped grid of cells with a label-type term over a bone mono value. A missing value removes its cell; nothing renders a dash.

## Do's and Don'ts

### Do:
- **Do** keep every surface flat on void / carbon / graphite with 1px `line` hairlines and the 2px radius.
- **Do** use green only for "live / on / active" and amber only for "getting ready" (at most 20 minutes).
- **Do** set handles, figures, labels and buttons in JetBrains Mono, and titles and prose in the system sans.
- **Do** keep one table: live first, then 30-day hours, sortable by its column headers, and call the order "sorted".
- **Do** omit a field, cell or panel when the data cannot back it up. Show schedules only for streamers with a proven record.
- **Do** animate with springs, and give every animation a still reduced-motion path (LED breathing, caret blink, lamp fade and console flight all stop or cut).
- **Do** make every page work without JavaScript and reserve space for anything that arrives later (CLS 0).
- **Do** use logical properties so Arabic mirrors correctly; keep the terminal and logo left-to-right.
- **Do** keep it fast: CSS inlined, prerender on hover, a service worker, content-hashed Rive assets, and no Rive on Save-Data or slow networks.

### Don't:
- **Don't** add a toolbar, search box, filters or topic chips above the table.
- **Don't** use the word "ranked", show countdowns or "next stream in…", or render "—" for unknown values.
- **Don't** link a streamer anywhere off-site except through the Twitch and YouTube logo links.
- **Don't** go for a stereotypical hacker look (the green-on-black costume), use red-team / blue-team colour coding, or add anything cheesy or AI-sounding.
- **Don't** add drop shadows, gradients or glows to page surfaces. Physical depth belongs to the console only.
- **Don't** add a light theme, a spotlight hero for one live streamer, or horizontal card strips.
- **Don't** add parallax to the rack.

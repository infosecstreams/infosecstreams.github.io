---
version: 1
slug: "src-views-list-astro"
primary_target: "src/views/List.astro"
related_targets: ["src/components/Roster.astro"]
---

# Surface: home and inactive list (src/views/List.astro)

Mode: Operate. Visitor: an infosec viewer finding who is live and jumping to Twitch.

## Direction contract

THESIS: One sortable board of every streamer, live first, sitting beside Twitch. Refuses the spotlight-hero plus card-strip arrangement and the green-on-black hacker costume.
OWN-WORLD: Twitch dark surfaces (#0e0e10 ground, #18181b bars), Twitch purple only for what you act on (Watch, current page, active sort), red only for LIVE, amber only for "just live" and "getting ready". JetBrains Mono for status codes, figures and tags; system UI sans for everything else. The on-air lamp in the [•] mark lights while anyone is live.
STORY: The visitor sees at once who is live (top rows, preview, uptime, viewers), can sort by status, name, language, viewers or 30-day hours as on the old site, and trusts it because nothing speculative is shown.
FIRST VIEWPORT: Twitch-style top bar; title with a mono live summary; search, language, Live only; topic chips; the table header; live rows with 128-176px previews and a purple Watch button; offline rows as dense one-liners with 30-day hours.
FORM: fused from challengers gate-board (fixed status column, rerank, just-live state) and yellow-wayfinding (committed live band), on the category standard as owner asked; variants A Board, B Band, C Directory under ?variant= for the owner's pick. seed:4416f96fa47a9003
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Viewers into information security: people doing Hack The Box and TryHackMe, learning blue team or red team work, pentesters, bug bounty hunters, CTF players. They come to see who in infosec is streaming on Twitch right now and jump straight to the stream; secondarily, to browse who streams regularly. (Confirmed by the owner, 2026-11-19.)

## Product Purpose

infosecstreams.com is a maintained directory of infosec Twitch streamers. Its job: answer "who's live in security right now?" at a glance and send the viewer to Twitch. Success is a visitor finding a live stream in seconds, and trusting what the page says.

## Positioning

A curated, community-maintained list of security streamers (CSV in the repo, intake via issues), with live status from its own bot (EventSub) rather than scraping Twitch categories. Live first, then ranked by how much each streamer actually streamed in the last 30 days.

## Operating Context

- Live status from the bot API at p.infosecstreams.com/streamstatus/ (status.json every 30 s, schedule.json every 5 min, ics calendar).
- Roster from `streamers.csv` and `inactive_streamers.csv` at the repo root; inactive streamers have their own page.
- The previous Jekyll site (one sortable table, 🟢/🟡 rows at the top) is what regular visitors know.
- Translations managed in Crowdin; 10 languages (en, ar, de, es, fr, hi, it, pt, tr, zh); Arabic is RTL.

## Capabilities and Constraints

- **Order:** live first, then 30-day streamed hours, then everyone else. Sortable by name, language, 30-day hours and viewers, as on the old site.
- **Accuracy over optimism (owner's rule):** never show information that may be wrong.
  - "Getting ready" (category switched to a watched one or title updated, not yet live) shows for at most 20 minutes, then drops.
  - A stream schedule shows only for streamers with a proven record: went live for at least 75% of their last judged scheduled streams, with at least 4 kept. Everyone else's published schedule is ignored. No countdowns or "next stream in 2 weeks" in the list.
- Fast: Lighthouse ≥ 98, CLS 0; works with JavaScript off (the plain ranked list).
- Static Astro site deployed to GitHub Pages; no server code on the site.

## Brand Commitments

- Name: InfoSec Streams. Domain infosecstreams.com.
- The owner rejected: a stereotypical "hacker" look, anything cheesy, red-team/blue-team colour coding, horizontal card strips, a separate spotlight for live streams, and the ruled-catalog look as "generic". It must not read as AI-made.

## Evidence on Hand

- Real roster (~43 active streamers, ~300 inactive), live data and Twitch preview thumbnails.
- Schedule track records from the bot (`track_record.kept/total`).
- No testimonials, viewer numbers, or press; don't invent any.

## Product Principles

1. Live first: the first thing on the page is who is streaming now.
2. Trustworthy: show only what the data can back up; when unsure, show nothing.
3. One list: one place to look, sortable the way regulars expect.
4. Fast and calm: quiet rows, nothing speculative, no clutter.

## Accessibility & Inclusion

WCAG AA contrast, keyboard use (search with `/`), works without JS, RTL for Arabic, reduced motion respected.

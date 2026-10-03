# Screen: Splash

- Route: / (boot — shown on every app load before the first section is usable)
- Purpose: Branded load sequence while the app's data loads; when the device is offline it holds and offers Retry instead.
- Entry points: app open, browser reload, "Retry" on the offline splash (reloads the page)
- Exit points: cross-fades into the start section — Leads in the prototype (its default start room); no user action. Offline: none until "Retry"
- Access: everyone opening the app; it greets the signed-in user
- Layout shell: full-bleed
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: none — the boot screen sits before any section; neutral white (zinc-0) canvas.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Splash layer | everything below, on a white (zinc-0 #ffffff) layer | Fixed, inset 0, z 999, overflow hidden, covers header and app; content is one column centred on both axes, gap 22px | Phone: same centred column — at 390×844 the mark's top sits at y≈322 and the whole block is ≈182px wide. Tablet: as desktop | `role="status"`, `aria-label="Loading Clinozy"`. The app renders underneath at opacity 0 |
| Mark | 64×64 SVG on a 28-unit grid: rounded square (rx 8, zinc-900 #18181b) · "C" stroke (zinc-50 #fafafa, width 2.6, round caps, path length 40) · dot (r 2.3 at 20.2/14, green oklch(0.72 0.14 150)); behind it a halo square inset −10px (84×84), radius 24px, oklch(0.72 0.14 150 / .18) | Centred | Phone: same 64px | Both SVG and halo are `aria-hidden` |
| Wordmark | "clinozy" set as "clin" + ring + "zy": 34px/600, letter-spacing −0.03em, line-height 1, zinc-950 #09090b, no wrap; the "o" is an inline SVG 0.56em (≈19px) — ring r 7.6, stroke 4.2 in zinc-950 on a 20-unit grid, with a centre dot r 3 in oklch(0.6 0.14 150) | Under the mark (22px gap), ≈113×34px | Phone: same size | Body font |
| Greeting block | greeting line, then either the progress block (online) or the offline notice | Under the wordmark, margin-top 2px, column gap 10px, centred | Phone: same | Greeting 15px/500, zinc-900, no wrap |
| Progress block (online only) | bar + ticker | Column, gap 8px. Bar 180×2px, radius 999px, track zinc-150 #efeff1, fill zinc-900 growing from the left. Ticker window 18px tall, overflow hidden, three 18px lines stacked: 6px dot + 12.5px zinc-500 #71717a text, gap 6px, no wrap | Phone: same | Hidden while offline (`data-spl-prog="true"` → display none) |
| Offline notice (offline only) | `role="alert"` column, gap 10px: message 12.5px zinc-600 #52525b no wrap + "Retry" button (36px tall, padding 0 14px, 1px zinc-200 border, radius 8px, white fill, 13px/500 zinc-900, hover zinc-100) | Replaces the progress block; ≈298px wide | Phone: same — the 298px line fits at 390 with ≈46px each side. Tablet: as desktop | "Retry" reloads the page |

## Data display

Primitive: none — n/a, the splash shows no records.

## Forms

n/a — the splash takes no input (the only control is "Retry").

## Popups

n/a — no popup; the offline notice is inline in the centred column.

## Multi-step flow

n/a — a timed sequence with no user steps; its online / offline / reduced-motion variants are mapped in Preview / animated panels.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | 2 — online sequence (ends in a cross-fade) · offline hold (never ends on its own) |
| Switching | automatic — timers start when the app mounts; offline is decided by `navigator.onLine === false` at mount (the notice re-reads it on each render) |
| Surface per input type | Online → frames 1–8 below, app visible from 3700 ms. Offline at mount → frames 1–5 play, the progress block is hidden, the offline notice shows under the greeting, no exit timer runs; only "Retry" (page reload) leaves. `prefers-reduced-motion: reduce` → every frame jumps to its end state (1 ms, no delays): mark, wordmark, greeting, full bar and "All set" show at once; exit starts at 500 ms and the layer is removed at 580 ms |
| Frame sequence | 1 mark scales in · 2 green halo breathes once + "C" draws · 3 dot pops in · 4 wordmark rises out of a blur · 5 greeting block rises · 6 bar fills while the ticker steps "Opening <Weekday>’s schedule" → "Syncing patients and leads" → "All set" · 7 cross-fade: splash out, app in · 8 splash layer removed |
| Frame durations | 1 mark: 700 ms from 50 ms, cubic-bezier(.2,.9,.25,1.05) · 2 halo: 1400 ms from 550 ms, cubic-bezier(.2,.8,.2,1); "C": 700 ms from 550 ms, cubic-bezier(.65,0,.35,1) · 3 dot: 500 ms from 1150 ms, cubic-bezier(.34,1.4,.64,1) · 4 wordmark: 800 ms from 1250 ms, cubic-bezier(.16,1,.3,1) · 5 greeting block: 500 ms from 1900 ms, ease · 6 bar: 1500 ms from 2050 ms, cubic-bezier(.4,0,.2,1); ticker: 1500 ms from 2050 ms — step 1 holds to 2500 ms, slides up 18px 2500–2650 ms, step 2 holds to 3040 ms, slides 3040–3190 ms, step 3 holds from 3190 ms (each slide eased cubic-bezier(.65,0,.35,1)) · 7 at 3700 ms: splash opacity 1→0 over 500 ms ease (pointer-events off at once) while the app's opacity goes 0→1 over 450 ms ease · 8 at 4220 ms the layer is removed. Total ≈ 3.7 s to the app, 4.2 s to removal |
| Progressive reveal | 50 ms mark · 550 ms halo + "C" · 1150 ms dot · 1250 ms wordmark · 1900 ms greeting (and, offline, the notice + "Retry") · 2050 ms bar + ticker step 1 · 2650 ms step 2 · 3190 ms "All set" (green dot) · 3550 ms bar full · 3700 ms app fades in |
| Static fallback | reduced motion as above (end states at once, exit at 500 ms); offline hold as above |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Mark | custom brand SVG (rounded square + "C" + dot) — not Lucide | 64 | no — `aria-hidden`; the layer's `aria-label` "Loading Clinozy" names it |
| Wordmark "o" | custom brand SVG (ring + centre dot) — not Lucide | 0.56em (≈19px at 34px) | no — `aria-hidden` |

No Lucide icons on the splash; "Retry" is a text button.

Library: Lucide · Weight: regular (2px stroke)

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Mark (czsplMark) | opacity 0→1, scale .6→1; delay 50ms | 700ms | cubic-bezier(.2,.9,.25,1.05) |
| Halo (czsplHalo) | 0%: opacity 0, scale .7 · 40%: opacity 1 · 100%: opacity 0, scale 1.25; delay 550ms | 1400ms | cubic-bezier(.2,.8,.2,1) |
| "C" stroke (czsplashC) | stroke-dashoffset 40→0 (dasharray 40); delay 550ms | 700ms | cubic-bezier(.65,0,.35,1) |
| Dot (czsplashDot) | scale 0 → 1.25 (60%) → 1, origin at the dot centre; delay 1150ms | 500ms | cubic-bezier(.34,1.4,.64,1) |
| Wordmark (czsplWord) | opacity 0→1, translateY 8px→0, blur 6px→0; delay 1250ms | 800ms | cubic-bezier(.16,1,.3,1) |
| Greeting block (czsplashUp) | opacity 0→1, translateY 6px→0; delay 1900ms | 500ms | ease |
| Progress bar (czsplBar) | transform scaleX 0→1 from the left; delay 2050ms | 1500ms | cubic-bezier(.4,0,.2,1) |
| Ticker (czsplTick) | translateY 0 (0–30%) → −18px (40–66%) → −36px (76–100%); delay 2050ms | 1500ms | cubic-bezier(.65,0,.35,1) per segment |
| Splash exit | opacity 1→0; starts at 3700ms | 500ms | ease |
| App entrance | opacity 0→1; starts at 3700ms | 450ms | ease |

Reduced-motion: inside the splash every animation runs 1ms with no delay and transitions are off (each element shows its end state, the ticker lands on "All set", the bar is full); the global rule also makes the exit and app fade 1ms; the exit timer drops from 3700ms to 500ms (layer removed at 580ms).

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Splash | the splash is the loading state (`role="status"`, "Loading Clinozy"); ticker "Opening <Weekday>’s schedule" → "Syncing patients and leads" → "All set" | n/a — the splash shows no data | Offline (`navigator.onLine === false` at mount): the splash stays, the bar and ticker are hidden, `role="alert"` line "Can’t reach Clinozy · check the internet connection" + 36px "Retry" (reloads); same layout on phone |

Success: ticker step 3 "All set" with a green dot (oklch(0.52 0.12 150)), the bar full, then the cross-fade into the app.

## Copy

| Key | Exact string |
| --- | --- |
| layer label | "Loading Clinozy" |
| wordmark | "clinozy" (drawn "clin" + ring-with-green-dot "o" + "zy", lowercase) |
| greeting | "Good morning, <first name>" before 12:00 · "Good afternoon, <first name>" 12:00–16:59 · "Good evening, <first name>" from 17:00 — device clock; first name of the signed-in user (prototype: "Riya") |
| ticker step 1 | "Opening <Weekday>’s schedule" — full weekday, curly ’ (e.g. "Opening Saturday’s schedule"); grey dot zinc-300 #d4d4d8 |
| ticker step 2 | "Syncing patients and leads" — grey dot zinc-300 |
| ticker step 3 | "All set" — green dot oklch(0.52 0.12 150) |
| offline message | "Can’t reach Clinozy · check the internet connection" |
| offline button | "Retry" |

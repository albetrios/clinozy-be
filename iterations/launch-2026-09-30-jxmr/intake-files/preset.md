# Preset: Clinozy Zinc Pastel

- Id: clinozy-zinc-pastel
- Scope: full-surface

## Colour tokens

| Token | Light | Dark |
| --- | --- | --- |
| background | oklch(1 0 0) · #ffffff (`--z0`: page, list table card, drawers, popovers, menus); canvas oklch(0.985 0 0) · #fafafa (`--z50`: table header strip, side rails, patient-file and Day close canvas, row hover) | oklch(0.193 0.006 285.8) · #141417; canvas oklch(0.165 0.004 285.9) · #0e0e10 |
| foreground | oklch(0.141 0.004 285.8) · #09090b (`--z950` = `--color-text`) | oklch(0.985 0 0) · #fafafa |
| primary | oklch(0.21 0.006 285.9) · #18181b (`--z900`); hover oklch(0.274 0.005 286) · #27272a (`--z800`) | oklch(0.967 0.001 286.4) · #f4f4f5; hover oklch(0.92 0.004 286.3) · #e4e4e7 |
| primary-foreground | oklch(0.985 0 0) · #fafafa (`--z50`) | oklch(0.165 0.004 285.9) · #0e0e10 |
| accent | oklch(0.967 0.001 286.4) · #f4f4f5 (`--z100`: hover fill on 371 controls, selected option, active Appearance choice) | oklch(0.237 0.008 285.8) · #1e1e22 |
| accent-foreground | oklch(0.141 0.004 285.8) · #09090b (`--z950`) | oklch(0.985 0 0) · #fafafa |
| muted / muted-foreground | oklch(0.967 0.001 286.4) · #f4f4f5 / oklch(0.552 0.014 285.9) · #71717a (`--z100` / `--z500`; the lightest text allowed) | oklch(0.237 0.008 285.8) · #1e1e22 / oklch(0.699 0.013 286.1) · #9d9da6 |
| border · input · ring | oklch(0.92 0.004 286.3) · #e4e4e7 (`--z200` = `--color-divider`, 1px) · same #e4e4e7 at rest, oklch(0.712 0.013 286.1) · #a1a1aa (`--z400`) while a search or picker field is open · oklch(0.21 0.006 285.9) · #18181b (`--ring` = `--z900`, the dark focus ring) | #2c2c31 · oklch(0.295 0.009 285.8) · same #2c2c31 at rest, #5b5b63 · oklch(0.474 0.013 285.9) open · #f4f4f5 · oklch(0.967 0.001 286.4) |
| destructive · success · warning | oklch(0.53 0.2 25) · #c51d28 (`--k5`, text on it `--z0` #ffffff; hover `--k37` oklch(0.52 0.21 25) · #c50220) · oklch(0.52 0.12 150) · #287c42 (`--k8`, text on it #ffffff) · butter tone: ink oklch(0.38 0.085 65) · #613700 on oklch(0.935 0.06 85) · #fce7bc | oklch(0.67 0.2 25) · #f85452 (text on it `--z0` #141417; hover oklch(0.66 0.21 25) · #f84b4b) · oklch(0.66 0.12 150) · #56a76a (text #141417) · ink oklch(0.855 0.064 65) · #edc7a4 on oklch(0.255 0.042 85) · #2c2108 |
| chart-1 … chart-5 | oklch(0.52 0.12 150) · #287c42 · oklch(0.68 0.09 235) · #5da1c8 · oklch(0.74 0.11 75) · #d3a056 · oklch(0.68 0.1 295) · #9d8cd0 · oklch(0.68 0.1 20) · #cf7f7f | oklch(0.66 0.12 150) · #56a76a · chart-2…5 identical to light (the dark block re-declares the same values) |

The prototype authors the neutrals in hex (OKLCH above is converted) and every colour variable (`--k0`…`--k126`) in OKLCH. No brand hex is mandated beyond the ink #18181b. The logo mark is an ink tile (`--z900`, corner radius 8 in a 28-unit box) with a `--z50` "C" stroke and a green dot oklch(0.72 0.14 150) · #5bbd74 (`--k3`); the wordmark's "o" dot is oklch(0.6 0.14 150) · #319751 (`--k4`); both greens are identical in dark. The prototype has no multi-series chart: chart-1 is the green it draws every progress and revenue bar in, chart-2…5 are the section-tone dots it uses for status and series marks.

The prototype also declares shadcn-named variables that nothing reads: `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--accent-bg`, `--border`, `--input`, `--ring`, `--radius` (8px), `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (10px) and `--destructive` (#dc2626). Its own `--color-accent` is the ink `--z900` (with an alias ramp `--color-accent-100`…`900` = `--z100`, `--z200`, `--z300`, `--z400`, `--z600`, `--z800`, `--z900`, `--z950`, `--z950`); the `accent` row above uses shadcn's meaning (hover surface), not that alias.

### Neutral ramp (zinc)

| Variable | Light | Dark | `--color-neutral-*` alias | Used for |
| --- | --- | --- | --- | --- |
| `--z0` | #ffffff · oklch(1 0 0) | #141417 · oklch(0.193 0.006 285.8) | — (`--color-bg`) | page, cards, drawers, popovers; text on fills |
| `--z50` | #fafafa · oklch(0.985 0 0) | #0e0e10 · oklch(0.165 0.004 285.9) | neutral-100 (`--color-surface`) | canvas, table header, row hover, kbd; primary-foreground |
| `--z100` | #f4f4f5 · oklch(0.967 0.001 286.4) | #1e1e22 · oklch(0.237 0.008 285.8) | neutral-200 | hover, muted, segmented-control track, stone tone bg |
| `--z150` | #efeff1 · oklch(0.953 0.003 286.3) | #232327 · oklch(0.258 0.007 285.9) | — (off-scale) | keyboard focus fill, skeleton fill |
| `--z200` | #e4e4e7 · oklch(0.92 0.004 286.3) | #2c2c31 · oklch(0.295 0.009 285.8) | neutral-300 | borders (`--color-divider`), `::selection`, spinner track |
| `--z300` | #d4d4d8 · oklch(0.871 0.005 286.3) | #3a3a40 · oklch(0.351 0.01 285.9) | neutral-400 | scrollbar thumb, non-current score bars, kbd-focus bar |
| `--z400` | #a1a1aa · oklch(0.712 0.013 286.1) | #5b5b63 · oklch(0.474 0.013 285.9) | neutral-500 | disabled-only text, open-field border, scrollbar thumb hover |
| `--z500` | #71717a · oklch(0.552 0.014 285.9) | #9d9da6 · oklch(0.699 0.013 286.1) | neutral-600 | muted text, placeholders, eyebrows, inactive icons |
| `--z600` | #52525b · oklch(0.442 0.015 285.8) | #b4b4bc · oklch(0.772 0.011 286.1) | neutral-700 | field labels, inactive tab-bar labels |
| `--z700` | #3f3f46 · oklch(0.37 0.012 285.8) | #d0d0d6 · oklch(0.859 0.008 286.2) | neutral-800 | stone tone ink, stepper glyphs |
| `--z800` | #27272a · oklch(0.274 0.005 286) | #e4e4e7 · oklch(0.92 0.004 286.3) | — (skipped) | primary hover |
| `--z900` | #18181b · oklch(0.21 0.006 285.9) | #f4f4f5 · oklch(0.967 0.001 286.4) | neutral-900 | primary, toast, tooltip, ring, logo tile |
| `--z950` | #09090b · oklch(0.141 0.004 285.8) | #fafafa · oklch(0.985 0 0) | — (`--color-text`) | body text |

The `--z` numbers are Tailwind zinc names (`--z50` = zinc-50 … `--z950` = zinc-950) plus `--z0` white and the off-scale `--z150`. The `--color-neutral-*` aliases sit one step lower (neutral-100 = `--z50` … neutral-800 = `--z700`) and neutral-900 jumps to `--z900`; the previous spec printed the alias numbers as zinc steps, so every step it listed was one off and #27272a was missing.

### Panels that stay light in dark mode

In dark mode the Bulk actions toolbar and the Photo viewer re-declare the light ramp (`--z0` #ffffff … `--z950` #09090b) with one change: `--z900` is #27272a there, not #18181b. The bulk bar paints `--z900` with `--z50` text — #fafafa on #18181b in light, #fafafa on #27272a in dark. The Photo viewer keeps #fafafa names and #a1a1aa meta on its rgb(9 9 11 / .94) backdrop in both modes. Without the re-pin the bulk bar would flip to a light #f4f4f5 bar, and the Photo viewer's text would turn #0e0e10 on its #0a0a0c backdrop (1.03:1). The rule applies to screen only.

### Status and soft fills

| Role | Light | Dark | Used for |
| --- | --- | --- | --- |
| destructive fill / hover | `--k5` #c51d28 / `--k37` #c50220, text `--z0` #ffffff | #f85452 / #f84b4b, text `--z0` #141417 | Delete buttons in drawer footers (36px, radius 8) |
| destructive text | `--k5` #c51d28 | #f85452 | required-field `*`, the save-error line "Not saved · your changes are kept" with its 6px dot, trash icons, "Log out" |
| danger soft | bg `--k6` oklch(0.97 0.02 25) · #fff0ee, text `--k29` oklch(0.55 0.18 25) · #c53637 | oklch(0.22 0.014 25) · #211817 / oklch(0.69 0.18 25) · #f76560 | hover on remove "×" buttons |
| success fill | `--k8` #287c42, text `--z0` #ffffff | #56a76a, text #141417 | "P" patient badge on avatars, count badges, progress fills, 6–7px status dots |
| success soft | bg `--k35` oklch(0.97 0.02 150) · #ecf9ee (hover `--k36` oklch(0.93 0.04 150)), text sage ink #1a4b28 | #161c17 / #b6ddbd | quantity −/+ steppers in pick lists |
| warning | butter tone (bg `--k21`, ink `--k22`, line `--k19`); softer bg `--k56` oklch(0.955 0.04 85) · #fdefd2 with border `--k57` oklch(0.87 0.07 80) · #edd0a0 | butter dark; `--k56` #241d0e, `--k57` #584423 | "Due ₹…" chips, the lead follow-up status |
| search highlight | `--k34` oklch(0.94 0.08 95) · #fcebae, radius 2px, text inherits | oklch(0.25 0.056 95) · #2a2100 | matched characters in picker search results |
| one hard-coded destructive | "Remove lead": #dc2626, hover #b91c1c, focus outline 2px #fca5a5 offset 2px, text `--z0` | same hex (not themed) | lead drawer footer |

### Section tones

One tone per section, never shared. A tone is bg / ink / line / dot; text sits in ink on bg. A selected state on a tone is an ink fill with `--z0` text (selected time slot, active hour label). Chips: bg + ink, selected adds a 1px ink ring (`0 0 0 1px` ink). Tab tint hover: `color-mix(in oklch, bg 45%, --z0)` with an inset 1px `color-mix(in oklch, ink 16%, transparent)`. Status dots carry a 3px halo `color-mix(in oklch, dot 18%, transparent)`. Dropdown options with no tone of their own hash to one of sky · sage · lav · butter · blush · mint.

Light:

| Tone | Section | bg | ink | line | dot | ink on bg · `--z0` on ink |
| --- | --- | --- | --- | --- | --- | --- |
| butter | Today | oklch(0.935 0.06 85) · #fce7bc | oklch(0.38 0.085 65) · #613700 | oklch(0.85 0.08 80) · #eac992 | oklch(0.74 0.11 75) · #d3a056 | 8.42 · 10.22 |
| lav | Leads | oklch(0.925 0.045 295) · #e8e1ff | oklch(0.37 0.09 295) · #44346a | oklch(0.83 0.06 295) · #cac0eb | oklch(0.68 0.1 295) · #9d8cd0 | 8.56 · 10.80 |
| sky | Appointments | oklch(0.925 0.04 235) · #ceebfe | oklch(0.37 0.08 235) · #004564 | oklch(0.83 0.055 235) · #a5cee6 | oklch(0.68 0.09 235) · #5da1c8 | 8.32 · 10.32 |
| sage | Patients | oklch(0.925 0.045 150) · #d2efd7 | oklch(0.37 0.08 150) · #1a4b28 | oklch(0.83 0.06 150) · #acd3b3 | oklch(0.66 0.1 150) · #63a471 | 8.20 · 10.09 |
| blush | Medical | oklch(0.925 0.04 20) · #ffdcdb | oklch(0.38 0.1 20) · #6e282b | oklch(0.83 0.06 20) · #ecb8b7 | oklch(0.68 0.1 20) · #cf7f7f | 8.25 · 10.49 |
| mint | Clinic stock | oklch(0.93 0.04 190) · #cbf1ee | oklch(0.37 0.07 195) · #004b4b | oklch(0.83 0.055 190) · #9ed3cf | oklch(0.68 0.08 190) · #57a8a3 | 8.23 · 9.96 |
| peach | Payments | oklch(0.93 0.045 55) · #ffe1cc | oklch(0.4 0.1 50) · #713408 | oklch(0.84 0.07 55) · #efbf9f | oklch(0.72 0.12 55) · #de8f57 | 7.69 · 9.56 |
| plum | Tasks | oklch(0.925 0.04 330) · #f6ddf3 | oklch(0.38 0.1 330) · #5f2c5b | oklch(0.83 0.06 330) · #debada | oklch(0.68 0.1 330) · #bb81b6 | 8.29 · 10.51 |
| lime | Offerings | oklch(0.935 0.055 120) · #e4f0c7 | oklch(0.38 0.08 125) · #394914 | oklch(0.85 0.07 120) · #c7d5a2 | oklch(0.72 0.11 120) · #9caf5d | 8.23 · 9.83 |
| slate | Users | oklch(0.925 0.02 255) · #dee7f4 | oklch(0.37 0.04 255) · #314155 | oklch(0.83 0.03 255) · #bbc9db | oklch(0.66 0.05 255) · #7e94b1 | 8.35 · 10.41 |
| stone | How data connects; fallback | `--z100` #f4f4f5 | `--z700` #3f3f46 | `--z200` #e4e4e7 | `--z300` #d4d4d8 | 9.50 · 10.44 |

Dark (bg L = 1.19 − light L, chroma × 0.7; ink L = 0.87 − (light L − 0.35) × 0.5, chroma × 0.75; line L 0.4, chroma × 0.8; dot unchanged):

| Tone | bg | ink | line | dot | ink on bg · `--z0` on ink |
| --- | --- | --- | --- | --- | --- |
| butter | oklch(0.255 0.042 85) · #2c2108 | oklch(0.855 0.064 65) · #edc7a4 | oklch(0.4 0.064 80) · #5a441b | #d3a056 | 10.02 · 11.65 |
| lav | oklch(0.265 0.032 295) · #262233 | oklch(0.86 0.068 295) · #d4c9fa | oklch(0.4 0.048 295) · #49435f | #9d8cd0 | 9.96 · 11.85 |
| sky | oklch(0.265 0.028 235) · #172831 | oklch(0.86 0.06 235) · #abd8f3 | oklch(0.4 0.044 235) · #2f4c5c | #5da1c8 | 10.00 · 12.12 |
| sage | oklch(0.265 0.032 150) · #1a2a1d | oklch(0.86 0.06 150) · #b6ddbd | oklch(0.4 0.048 150) · #354f3a | #63a471 | 10.10 · 12.32 |
| blush | oklch(0.265 0.028 20) · #322020 | oklch(0.855 0.075 20) · #fdbcbb | oklch(0.4 0.048 20) · #5f3d3d | #cf7f7f | 9.60 · 11.46 |
| mint | oklch(0.26 0.028 190) · #132827 | oklch(0.86 0.053 195) · #a9dcdc | oklch(0.4 0.044 190) · #294f4d | #57a8a3 | 10.26 · 12.22 |
| peach | oklch(0.26 0.032 55) · #302015 | oklch(0.845 0.075 50) · #f5bfa1 | oklch(0.4 0.056 55) · #5f3f29 | #de8f57 | 9.57 · 11.25 |
| plum | oklch(0.265 0.028 330) · #2d202c | oklch(0.855 0.075 330) · #ecbee7 | oklch(0.4 0.048 330) · #573e54 | #bb81b6 | 9.66 · 11.46 |
| lime | oklch(0.255 0.038 120) · #202610 | oklch(0.855 0.06 125) · #c6d7ac | oklch(0.4 0.056 120) · #444c29 | #9caf5d | 10.19 · 12.01 |
| slate | oklch(0.265 0.014 255) · #21262c | oklch(0.86 0.03 255) · #c4d2e5 | oklch(0.4 0.024 255) · #3f4955 | #7e94b1 | 9.94 · 11.99 |
| stone | `--z100` #1e1e22 | `--z700` #d0d0d6 | `--z200` #2c2c31 | `--z300` #3a3a40 | 10.82 · 11.97 |

### Dark mode

Theme lives in the user menu › Appearance radio group "Light" · "Dark" · "System"; default Light, saved per device (`cz.theme`); System follows `prefers-color-scheme`. Dark sets `html[data-theme="dark"]` with `color-scheme: dark` and swaps the whole `--z` ramp and every `--k` variable; it applies under `@media screen` only, so print stays light. Shadows, backdrops (rgb(9 9 11 / x)) and the brand greens do not change.

Places the prototype does not theme (as drawn, dark mode):

| Surface | What dark mode does | Measured |
| --- | --- | --- |
| Segmented controls (tab and radio groups with 2–3px padding) | hover and press fills are hard-coded rgb(255 255 255 / .55) and / .85 under `--z900` text | #f4f4f5 on #9a9a9c 2.56:1; on #ddddde 1.23:1 |
| Photo tiles (patient Photos, appointment-form photos) | caption name and the edit/delete icons use `--z50` over the black scrim | #0e0e10 on #232325 1.23:1 (the date stays rgb(255 255 255 / .8), 10.48:1) |
| Photo thumbnail category pill (patient file) | rgb(255 255 255 / .92) pill with `--z700` text | #d0d0d6 on #ececec 1.30:1 |
| Appointments calendar | grid lines (#fafafa half-hour, #f4f4f5 hour) and the past-time veil rgb(244 244 245 / .75) are hard-coded light | bright 1px lines and a #bcbcbe veil over #141417 |
| "Remove lead" button | #dc2626 fill, hover #b91c1c, `--z0` text | #141417 on #dc2626 3.81:1, hover 2.84:1 |

## Contrast

Ratios are WCAG 2.x, computed from the OKLCH values (OKLab → linear sRGB → 8-bit hex → relative luminance), not copied.

| Pair | Mode | Ratio | Passes AA (4.5:1)? |
| --- | --- | --- | --- |
| primary / primary-foreground | light | 16.97 — #fafafa on #18181b | yes |
| primary / primary-foreground | dark | 17.54 — #0e0e10 on #f4f4f5 | yes |
| accent / accent-foreground | light | 18.10 — #09090b on #f4f4f5 | yes |
| accent / accent-foreground | dark | 15.92 — #fafafa on #1e1e22 | yes |
| foreground / background | light | 19.90 — #09090b on #ffffff | yes |
| foreground / background | dark | 17.61 — #fafafa on #141417 | yes |
| muted-foreground / background | light | 4.83 — #71717a on #ffffff | yes |
| muted-foreground / background | dark | 6.84 — #9d9da6 on #141417 | yes |
| muted-foreground / canvas | light | 4.63 — #71717a on #fafafa | yes |
| muted-foreground / canvas | dark | 7.17 — #9d9da6 on #0e0e10 | yes |
| muted-foreground / muted (unselected segmented label, meta on a hovered row) | light | 4.40 — #71717a on #f4f4f5 | no |
| muted-foreground / muted | dark | 6.18 — #9d9da6 on #1e1e22 | yes |
| field label (`--z600`) / background | light | 7.73 — #52525b on #ffffff | yes |
| field label (`--z600`) / background | dark | 8.93 — #b4b4bc on #141417 | yes |
| keyboard-focus text (`--z900`) / focus fill (`--z150`) | light | 15.43 — #18181b on #efeff1 | yes |
| keyboard-focus text / focus fill | dark | 14.25 — #f4f4f5 on #232327 | yes |
| destructive / text on it | light | 5.87 — #ffffff on #c51d28 | yes |
| destructive / text on it | dark | 5.59 — #141417 on #f85452 | yes |
| destructive hover / text on it | light | 6.17 — #ffffff on #c50220 | yes |
| destructive hover / text on it | dark | 5.34 — #141417 on #f84b4b | yes |
| destructive as text / background | light | 5.87 — #c51d28 on #ffffff | yes |
| destructive as text / background | dark | 5.59 — #f85452 on #141417 | yes |
| danger soft text / bg | light | 4.79 — #c53637 on #fff0ee | yes |
| danger soft text / bg | dark | 5.78 — #f76560 on #211817 | yes |
| success / text on it | light | 5.18 — #ffffff on #287c42 | yes |
| success / text on it | dark | 6.24 — #141417 on #56a76a | yes |
| success soft text / bg | light | 9.30 — #1a4b28 on #ecf9ee | yes |
| success soft text / bg | dark | 11.60 — #b6ddbd on #161c17 | yes |
| warning (butter ink / butter bg) | light | 8.42 — #613700 on #fce7bc | yes |
| warning (butter ink / butter bg) | dark | 10.02 — #edc7a4 on #2c2108 | yes |
| section tone ink / tone bg, all 11 | light | 7.69 (peach #713408 on #ffe1cc) to 9.50 (stone #3f3f46 on #f4f4f5) | yes |
| section tone ink / tone bg, all 11 | dark | 9.57 (peach #f5bfa1 on #302015) to 10.82 (stone #d0d0d6 on #1e1e22) | yes |
| selected tone (`--z0` on tone ink), all 11 | light | 9.56 (#ffffff on peach #713408) to 10.80 (#ffffff on lav #44346a) | yes |
| selected tone (`--z0` on tone ink), all 11 | dark | 11.25 (#141417 on peach #f5bfa1) to 12.32 (#141417 on sage #b6ddbd) | yes |
| Bulk actions bar (`--z50` on `--z900`) | light | 16.97 — #fafafa on #18181b | yes |
| Bulk actions bar (re-pinned) | dark | 14.27 — #fafafa on #27272a | yes |
| Photo viewer meta (`--z400` on rgb(9 9 11 / .94)) | light | 6.92 — #a1a1aa on #18181a | yes |
| Photo viewer meta (re-pinned) | dark | 7.72 — #a1a1aa on #0a0a0c | yes |
| toast undo (`--z300` on `--z900`) | light | 11.99 — #d4d4d8 on #18181b | yes |
| toast undo | dark | 10.28 — #3a3a40 on #f4f4f5 | yes |
| disabled-only text (`--z400`) / background | light | 2.56 — #a1a1aa on #ffffff | no — disabled text is exempt; disabled buttons also drop to opacity .5 |
| disabled-only text / background | dark | 2.73 — #5b5b63 on #141417 | no — exempt (disabled) |
| ring (`--z900`) / background — non-text, needs 3:1 | light | 17.72 — #18181b on #ffffff | yes |
| ring (`--z900`) / background — non-text | dark | 16.73 — #f4f4f5 on #141417 | yes |
| painted field-focus border (`--z400`) / background — non-text | light | 2.56 — #a1a1aa on #ffffff | no (under 3:1) |
| painted field-focus border / background — non-text | dark | 2.73 — #5b5b63 on #141417 | no (under 3:1) |
| keyboard-focus fill (`--z150`) / background — non-text | light | 1.15 — #efeff1 on #ffffff | no (under 3:1) |
| keyboard-focus fill / background — non-text | dark | 1.17 — #232327 on #141417 | no (under 3:1) |
| chart-1 / background — non-text | light | 5.18 — #287c42 on #ffffff | yes |
| chart-1 / background — non-text | dark | 6.24 — #56a76a on #141417 | yes |
| chart-2 · 3 · 4 · 5 / background — non-text | light | 2.84 · 2.35 · 2.96 · 3.00 (#5da1c8 · #d3a056 · #9d8cd0 · #cf7f7f on #ffffff) | no · no · no · yes |
| chart-2 · 3 · 4 · 5 / background — non-text | dark | 6.48 · 7.82 · 6.21 · 6.12 (same hex on #141417) | yes |
| brand mark dot / its ink tile — logo | light | 7.57 — #5bbd74 on #18181b | yes (logo, exempt anyway) |
| brand mark dot / its ink tile — logo | dark | 2.13 — #5bbd74 on #f4f4f5 | no (logo, exempt) |

The brand colour that carries text is the ink #18181b, and it passes everywhere (16.97:1 with #fafafa). The mark's green oklch(0.72 0.14 150) · #5bbd74 fails as text (2.34:1 on #ffffff), so it keeps its true value on non-text only — the logo dot (the wordmark dot is oklch(0.6 0.14 150) · #319751, 3.70:1). Every green that carries text uses the darkened oklch(0.52 0.12 150) · #287c42 (5.18:1 under #ffffff), or the sage ink oklch(0.37 0.08 150) · #1a4b28 for green text. Non-text tokens: ring keeps the true ink (#18181b light, #f4f4f5 dark); chart-1 is #287c42, the green the prototype draws data in, because the true #5bbd74 is 2.34:1 against white — under the 3:1 minimum for graphics. Chart-2…4 are under 3:1 in light; the prototype only shows them as 6–10px dots or thin bars next to a text label that carries the meaning.

## Typography

| Field | Value |
| --- | --- |
| Heading family + weights | Inter 600 (`--font-heading`, `--font-heading-weight: 600`). Page h1 20px / line-height 1.2 / letter-spacing −0.015em; tablet 18px; phone hides the page h1 and shows the section name in the header as a 28px-tall tone chip, 14px / 600 / −0.01em. Drawer title 18px / 600 / −0.01em, subtitle 13px `--z500`. Today greeting 23px / 600 / line-height 1.1 / −0.02em; "How data connects" h2 23px / 600 / −0.02em. KPI numerals 26px (Today lane counts) and 32px (Day close opening cash), 600, −0.02em, tabular. Wordmark Inter 600, −0.03em: 19px in the header, 34px on the splash |
| Body family + weights | Inter 400 / 500 / 600 / 700 (700 only for avatar initials, 5.5–10px badge letters, 12px check-mark glyphs and the printed prescription). `body` sets `font-feature-settings: "cv11", "ss01"` and letter-spacing −0.005em; antialiased. Body copy 13px (paragraphs line-height 1.45–1.55); field values 13.5px; table cells 13px with 12–12.5px secondary lines; buttons 13px / 500; field labels 12px / 500 `--z600`; section eyebrows 11px / 600 / uppercase / +0.05em `--z500`; table header 11px / 600 / uppercase / +0.03em `--z500`; chips 12px / 500; tooltip 11.5px / 500 / line-height 1.3; phone tab-bar labels 10.5px (500, active 600); counts, money, dates and times use `tabular-nums` |
| Mono family | JetBrains Mono 400 / 500 (`--font-mono`): kbd hints "esc", "Esc", "⌘K", "↵ add" at 10–11px; lead id "#…" 12px / 500; contact id 11.5px / 500 |
| Type scale | 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 15 · 16 · 18 · 20 · 23 px; the main steps 11.5 → 13 → 15 → 18 → 20 → 23 step by about 1.15. Off-scale: avatar initials and tiny badges 5.5–9.5px, display numerals 26 and 32px. Line heights 1 (single-line controls), 1.2 (headings), 1.3 (tooltips, compact text), 1.45–1.55 (paragraphs) |
| Self-hosted or CDN? | CDN — Google Fonts `Inter:wght@400;500;600;700` and `JetBrains+Mono:wght@400;500`, `display=swap`, with a preconnect to fonts.googleapis.com. Fallbacks: `ui-sans-serif, system-ui, sans-serif` and `ui-monospace, monospace` |

## Shape, density, motion

| Field | Value |
| --- | --- |
| Radius (base + per-component overrides) | Base 8px: buttons (36, 32 and 44px), text fields, pickers, nav tabs, list cards, toasts. 6px: inner controls (24–30px icon buttons, steppers, tags, tab triggers inside a segmented track, tooltip, CSS skeleton blocks). 4px: kbd, inline skeleton bars. 2px: search-highlight mark. 10px: phone tab-bar buttons. 12px: boxes, panels, popovers, menus, the list table card, the command menu, the uploads tray, the floating drawer "×". 16px 16px 0 0: phone bottom sheets. 999px: chips (24px), count badges, the "Previewing as" pill, the phone floating action button and tab-bar active pill (46 × 28px), switch tracks, progress tracks. 50%: avatars and status dots. 0: drawers; on phone also the list table card |
| Spacing / density scale | 2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 px, with 3 / 5 / 7 / 9 px optical nudges and 64px top / 72px bottom on empty states. Controls 36px (32 compact, 24–30 icon buttons, 44 large); chips 24px; header 60px (phone 52px); drawer header 76px (phone 60px); phone tab bar 58px + safe-area inset; phone search field 40px; phone drawer-footer buttons and Close 44px; phone floating action button 52px. Table rows have 10px vertical padding; side padding follows the viewport (table below). The table model also has a compact row (5px vertical), but no control in the prototype switches to it |
| Elevation / shadows | `--shadow-sm` 0 1px 2px rgb(0 0 0 / .05) (secondary buttons). List table card 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06). `--shadow-md` 0 4px 6px −1px rgb(0 0 0 / .08), 0 2px 4px −2px rgb(0 0 0 / .06) (small hover cards). `--shadow-lg` 0 10px 15px −3px rgb(0 0 0 / .1), 0 4px 6px −4px rgb(0 0 0 / .08) (menus, toast). Dropdown panels 0 16px 40px −12px rgb(0 0 0 / .22), 0 4px 12px −4px rgb(0 0 0 / .08). Command menu 0 24px 64px rgb(0 0 0 / .22), 0 4px 12px rgb(0 0 0 / .08). Drawers −16px 0 40px rgb(0 0 0 / .16) (lead panes .14). "Previewing as" pill 0 12px 32px −8px rgb(0 0 0 / .35). Uploads tray 0 12px 32px rgb(0 0 0 / .14). Floating drawer "×" 0 4px 14px rgb(0 0 0 / .18). Sticky row-actions cell −8px 0 8px −8px rgb(0 0 0 / .08). Selected segment 0 1px 2px rgb(0 0 0 / .08), 0 0 0 1px rgb(0 0 0 / .05). Phone floating action button 0 10px 28px −8px rgb(0 0 0 / .45); on phone, drawers lose their shadow and left border. Backdrops rgb(9 9 11 / .45) behind drawers, / .35 behind the command menu, / .4 behind phone pickers, / .94 behind the Photo viewer. Shadows are the same in dark |
| Border vs hairline vs shadow separation | 1px solid `--z200` between regions and around cards, panels and the 12px list table card; 1px `--z100` between table rows; rows carry a 3px left border, transparent unless a screen gives it a tone ink. Shadow only on floating layers (popovers, drawers, toasts, the phone floating action button) and the table card's soft lift |
| Motion durations + easing | 120ms ease (opacity, colour, focus fill, tooltip) · 150ms (field border and ring, hover fills, chevron rotation, switch knob, photo-tile action bar) · 160ms cubic-bezier(.2,.8,.2,1) (every popover `czddin` / `czddup`, command menu, "Previewing as" pill; nav-tab colour 160ms ease) · 200ms (progress widths; floating "×" `czpop` after a 200ms delay) · 220ms (search expand cubic-bezier(.2,.8,.2,1); bulk bar cubic-bezier(.32,.72,0,1)) · 240ms cubic-bezier(.2,.8,.2,1) (drawer sections `czacc`) · 260ms cubic-bezier(.32,.72,0,1) (phone bottom sheets `czsheet`) · 340ms cubic-bezier(.32,.72,0,1) (drawers `czdrawer`, backdrops `czbd`, lead panes) · 450 / 500ms ease (app fade-in / splash fade-out). Full list below |
| Focus treatment | Keyboard focus (`:focus-visible`) on buttons, links, tabs, options and `[tabindex]`: no outline, background `--z150` (#efeff1 / #232327) with `--z900` text, 120ms ease. Search pill and an open picker field: border `--z400` plus a 3px halo `0 0 0 3px rgb(161 161 170 / .25)`. Plain text inputs show only the caret (`--z900`); outline and shadow are suppressed. A keyboard-highlighted row gets an inset 2px left bar `--z300` on `--z50`. Mouse focus shows nothing. Declared ring token: `--z900`. Exception: "Remove lead" uses a 2px #fca5a5 outline, offset 2px |

### Density by viewport

The app has three viewport modes — phone < 760px, tablet 760–1099px, desktop ≥ 1100px (layout: shell.md). Padding follows a second switch: compact whenever the window is narrower than 1440px or shorter than 800px. Every tablet and every desktop 1100–1439px wide therefore uses the compact column; phone replaces it with its own.

| Surface (view-model key) | Desktop, ≥ 1440 wide and ≥ 800 tall | Compact: < 1440 wide or < 800 tall | Phone < 760 |
| --- | --- | --- | --- |
| App header side padding (`pg`) | 20px | 12px | 12px |
| App header min-height | 60px | 60px | 52px (gap 8px) |
| List-page toolbar and patient-file top bar padding (`hp`) | 16px 20px | 12px 12px | 8px 12px |
| Margin around the list table card (`bm`) | 0 20px 20px | 0 12px 12px | 0 (card full-bleed: radius 0, no side borders, no shadow) |
| Table side padding (`tx`) | 20px | 16px | 14px |
| Table left padding after the 3px bar (`tx3`) | 17px | 13px | 11px |
| Table row padding | 10px 20px 10px 17px | 10px 16px 10px 13px | 12px 14px 12px 11px; gap 6px 12px |
| Drawer header padding (`dh`) | 14px 24px | 12px 20px | 10px 16px |
| Drawer header height (`hh`) | 76px | 76px | 60px |
| Drawer side inset for strips and sections (`dx`) | 24px | 20px | 16px |
| Drawer body padding (`db`) | 20px 24px 28px | 16px 20px 20px | 14px 16px 20px |
| Drawer form grid gap, row × column (`fg`) | 16px 12px | 12px 10px | 12px 10px; the 88px label column stacks above its field with a 6px gap |
| Step-group (accordion) padding | 14px 16px | 12px 14px | 12px 14px |
| Drawer footer | padding 12px 24px, gap 10px, 36px buttons | padding 12px 20px, gap 10px, 36px buttons | wraps; 10px 12px plus the safe-area inset; buttons 44px tall, padding 0 12px, gap 8px; footer hint moves under the buttons at 12px |
| Row-action buttons | icon buttons 30 × 30px, labelled buttons 32px tall | desktops 1100–1439 as desktop; tablet at least 36 × 36px | at least 40 × 36px ("More actions" 40 × 36px with a 1px border on `--z0`; labelled actions 36px tall, padding 0 12px 0 10px), on their own right-aligned line |
| Page h1 | 20px | tablet 18px | hidden |

### Motion catalogue

| Element | Animation | Duration | Delay | Easing | Change |
| --- | --- | --- | --- | --- | --- |
| Every popover, dropdown, menu, filter panel, people/status/contact card, command menu panel | `czddin` | 160ms | 0 | cubic-bezier(.2,.8,.2,1), fill both | opacity 0 → 1, translateY(−4px) scale(.985) → none; transform-origin at the anchored corner |
| Same, opening upward; "Previewing as" pill | `czddup` | 160ms | 0 | cubic-bezier(.2,.8,.2,1), both | opacity 0 → 1, translateY(4px) scale(.985) → none; origin bottom |
| Uploads tray | `czddin` | 160ms | 0 | ease | as above |
| Right drawers, Day close, Preview, delete confirm | `czdrawer` | 340ms | 0 | cubic-bezier(.32,.72,0,1), both; will-change transform | translate3d(100%,0,0) → 0 |
| "How records connect" drawer | `czdrawer` | 320ms | 0 | cubic-bezier(.2,.8,.2,1) | as above |
| Drawer backdrop | `czbd` | 340ms | 0 | cubic-bezier(.32,.72,0,1), both | background rgb(9 9 11 / 0) → its own dim (/ .45); the panel itself never fades |
| Lead drawer panes and phone lead bar | transition | 340ms | visibility flips at 0s opening, .34s closing | cubic-bezier(.32,.72,0,1) | transform translate3d(panel width + 40px, 0, 0) → 0 |
| Floating "×" beside a drawer | `czpop` | 200ms | 200ms | cubic-bezier(.2,.8,.2,1) (two instances: ease) | opacity 0 → 1, scale(.9) → 1 |
| Bulk actions bar | `czbulk` | 220ms | 0 | cubic-bezier(.32,.72,0,1) | translateY(100%) → 0 |
| Drawer form sections, revealed blocks | `czacc` | 240ms (some 200ms or 240ms ease) | 0 | cubic-bezier(.2,.8,.2,1) | opacity 0 → 1, translateY(−4px) → 0 |
| Command-menu backdrop, Photo viewer, owner hover card | `czfade` | 150ms | 0 | ease | opacity 0 → 1 |
| "Signed out" screen | `czfade` | 300ms | 0 | ease, both | opacity 0 → 1 |
| Phone bottom sheets (picker list, filter panels, All sections, Patient file sections) | `czsheet` | 260ms | 0 | cubic-bezier(.32,.72,0,1), both | translateY(28px) and opacity 0 → none and opacity 1; origin bottom centre |
| Search pill expand / collapse | transition | 220ms (background 120ms) | 0 | cubic-bezier(.2,.8,.2,1) | flex-basis, max-width, min-width 36px ↔ full |
| Text fields | transition | 150ms | 0 | ease | border-color, box-shadow |
| Segmented-control triggers | transition | 150ms | 0 | ease | background, colour, box-shadow |
| Header nav tabs | transition | 160ms | 0 | ease | background, colour, box-shadow |
| Phone tab-bar active pill | transition | 160ms | 0 | ease | background |
| Chevrons | transition | 150ms | 0 | ease | rotate(0) ↔ rotate(180deg) |
| Switch knob | transition | 150ms | 0 | ease | left (16px knob) |
| Row checkbox reveal | transition | 120ms | 0 | ease | opacity 0 → 1 on row hover (always 1 on touch devices) |
| Keyboard focus fill | transition | 120ms | 0 | ease | background-color |
| Tooltip | transition | 120ms | 160ms hover delay | ease | opacity 0 → 1, translateY(2px) → 0; on touch it shows at once and hides after 1400ms; hidden on phone |
| Photo-tile action bar (hover devices) | transition | 150ms | 0 | ease | opacity 0 → 1, translateY(4px) → 0 |
| Photo viewer zoom and pan | transition | 120ms (none while dragging) | 0 | ease | transform |
| Progress and stock-level bars | transition | 200ms | 0 | ease | width, left |
| Score ring | transition | 400ms | 0 | ease | stroke-dasharray |
| "How data connects" pager | transition | 400ms | 0 | ease | transform |
| Spinner (14px, 2px `--z200` ring, `--z900` top) | `czspin` | 700ms, infinite | 0 | linear | rotate 360° |
| Skeletons (page, table, drawer, section, block fetch) | `czsk` | 1.1s, infinite | 0 | ease | background-position 100% → −100% on a flat `--z150` fill, so no sweep is visible |
| Inline list skeletons; dropdown and contact-card loading rows | `czsk` / `czddsk` / `czshim` | 1.2s, infinite | 0 | ease-in-out / ease / ease | same flat `--z150` fill |
| Toast | none | auto-dismiss 4500ms | 0 | — | appears and leaves without animation |
| Splash mark | `czsplMark` | 700ms | 50ms | cubic-bezier(.2,.9,.25,1.05), both | opacity 0 → 1, scale(.6) → 1 |
| Splash halo | `czsplHalo` | 1400ms | 550ms | cubic-bezier(.2,.8,.2,1), both | 0%: opacity 0, scale(.7); 40%: opacity 1; 100%: opacity 0, scale(1.25) |
| Splash "C" stroke | `czsplashC` | 700ms | 550ms | cubic-bezier(.65,0,.35,1), forwards | stroke-dashoffset 40 → 0 |
| Splash green dot | `czsplashDot` | 500ms | 1150ms | cubic-bezier(.34,1.4,.64,1), forwards | scale 0 → 1.25 (60%) → 1 |
| Splash wordmark | `czsplWord` | 800ms | 1250ms | cubic-bezier(.16,1,.3,1), both | opacity 0 → 1, translateY(8px) → 0, blur(6px) → none |
| Splash greeting | `czsplashUp` | 500ms | 1900ms | ease, both | opacity 0 → 1, translateY(6px) → 0 |
| Splash progress bar | `czsplBar` | 1500ms | 2050ms | cubic-bezier(.4,0,.2,1), both | scaleX 0 → 1 |
| Splash step ticker | `czsplTick` | 1500ms | 2050ms | cubic-bezier(.65,0,.35,1), both | translateY 0 (0–30%) → −18px (40–66%) → −36px (76–100%) |
| Splash out / app in | transition | 500ms / 450ms | 0 | ease | opacity |

Reduced motion (`prefers-reduced-motion: reduce`): every animation and transition drops to 1ms (a second rule says .01ms), delays go to 0, iteration count to 1 and `scroll-behavior` to auto; on the splash, animations run 1ms with no delay and transitions are off. Keyframes declared but never used: `czdrin`, `czsplIn`, `czsplBeat`, `czsplGone`, `czsplGrow`, `czsplTrack`, `czsplLet`, `czsplRip`, `czbreath`.

## Ambient effects

| Effect | Value | Dark mode |
| --- | --- | --- |
| Fills | Flat everywhere: backgrounds, headers, chips, skeletons, rings, the logo tile | same |
| Photo caption scrim | `linear-gradient(to top, rgb(9 9 11 / .78), rgb(9 9 11 / .35) 70%, transparent)` behind the name, date and edit/delete buttons on patient photo tiles and appointment-form photo thumbnails; on hover devices the bar fades in (150ms) | scrim unchanged; caption text turns dark (see Dark mode) |
| Calendar grid | SVG tile 8 × 88px repeated behind the Appointments day columns (88px per hour): 1px line at 43px #fafafa (half hour), 1px line at 87px #f4f4f5 (hour); past time veiled with rgb(244 244 245 / .75) | hard-coded light (see Dark mode) |
| Splash halo | oklch(0.72 0.14 150 / .18) rounded square (radius 24px) 10px outside the 64px mark | same |
| Backdrops | rgb(9 9 11 / .45) drawers, / .35 command menu, / .4 phone pickers, / .94 Photo viewer (header strip / .6); no backdrop blur anywhere | same |
| Scrollbars | thin everywhere; WebKit 10px track, transparent, pill thumb `--z300` with a 3px transparent border, `--z400` on hover; Firefox `scrollbar-width: thin`, `--z300` (`--z500` while the container is hovered); `scrollbar-gutter: stable` on every overflow container and inside modal dialogs; table-header strips hide their scrollbar | follows the ramp |
| Text selection | `::selection` `--z200` | #2c2c31 |

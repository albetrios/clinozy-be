# Clinozy — design brief preset (answer to `design-brief-prompt.md`)

## MY PRODUCT

- Name: `Clinozy`
- Brand color: `#18181b (zinc-900 ink: primary actions and the logo tile); logo dot green #5bbd74 = oklch(0.72 0.14 150), non-text only`
- What it does: `Runs a skin, hair and aesthetic clinic end to end — leads, appointments, patient files, prescriptions, the medical store, clinic stock, payments, tasks and offerings — in one app.`
- Who uses it: `Front desk, doctors, therapists, counsellors, the pharmacist, the accountant, marketing and the owner of a one- or multi-branch clinic — at the counter on desktop, in the consult room on tablet, and on phones.`
- Content density: `data-dense`
- Feel: `calm, clinical, precise`

## Preset JSON

```json
{
  "preset": {
    "id": "clinozy-zinc-pastel",
    "label": "Clinozy Zinc Pastel",
    "scope": "full-surface",
    "rationale": "A shadcn-style zinc surface keeps a data-dense clinic app calm and legible, while ten deep-pastel section tones (one per section) give wayfinding without loud fills. An ink primary, 1px borders and soft popover shadows read clinical and precise, in light and in a full dark mode."
  },
  "axes": {
    "accentColor": "emerald",
    "baseColor": "zinc",
    "harmony": "triadic",
    "intensity": "muted",
    "contrast": "normal",
    "density": "cozy",
    "typeScale": "compact",
    "headingFont": "inter",
    "bodyFont": "inter",
    "radius": "default",
    "shape": "uniform",
    "elevation": "soft",
    "separation": "border",
    "focus": "ring",
    "motion": "smooth",
    "menu": "default",
    "iconLibrary": "lucide",
    "iconWeight": "thin",
    "layoutWidth": "full"
  },
  "tokens": {
    "light": {
      "--color-primary": "oklch(0.21 0.006 285.9)",
      "--color-primary-foreground": "oklch(0.985 0 0)",
      "--color-accent": "oklch(0.967 0.001 286.4)",
      "--color-accent-foreground": "oklch(0.141 0.004 285.8)",
      "--color-ring": "oklch(0.21 0.006 285.9)",
      "--color-chart-1": "oklch(0.52 0.12 150)",
      "--color-chart-2": "oklch(0.68 0.09 235)",
      "--color-chart-3": "oklch(0.74 0.11 75)",
      "--color-chart-4": "oklch(0.68 0.1 295)",
      "--color-chart-5": "oklch(0.68 0.1 20)"
    },
    "dark": {
      "--color-primary": "oklch(0.967 0.001 286.4)",
      "--color-primary-foreground": "oklch(0.165 0.004 285.9)",
      "--color-accent": "oklch(0.237 0.008 285.8)",
      "--color-accent-foreground": "oklch(0.985 0 0)",
      "--color-ring": "oklch(0.967 0.001 286.4)",
      "--color-chart-1": "oklch(0.66 0.12 150)",
      "--color-chart-2": "oklch(0.68 0.09 235)",
      "--color-chart-3": "oklch(0.74 0.11 75)",
      "--color-chart-4": "oklch(0.68 0.1 295)",
      "--color-chart-5": "oklch(0.68 0.1 20)"
    }
  },
  "accessibility": {
    "verifiedPairs": [
      {
        "pair": "primary / primary-foreground",
        "mode": "light",
        "resolvedHex": "#fafafa on #18181b",
        "ratio": 16.97,
        "pass": true
      },
      {
        "pair": "primary / primary-foreground",
        "mode": "dark",
        "resolvedHex": "#0e0e10 on #f4f4f5",
        "ratio": 17.54,
        "pass": true
      },
      {
        "pair": "accent / accent-foreground",
        "mode": "light",
        "resolvedHex": "#09090b on #f4f4f5",
        "ratio": 18.1,
        "pass": true
      },
      {
        "pair": "accent / accent-foreground",
        "mode": "dark",
        "resolvedHex": "#fafafa on #1e1e22",
        "ratio": 15.92,
        "pass": true
      },
      {
        "pair": "foreground / background",
        "mode": "light",
        "resolvedHex": "#09090b on #ffffff",
        "ratio": 19.9,
        "pass": true
      },
      {
        "pair": "foreground / background",
        "mode": "dark",
        "resolvedHex": "#fafafa on #141417",
        "ratio": 17.61,
        "pass": true
      },
      {
        "pair": "muted-foreground / background",
        "mode": "light",
        "resolvedHex": "#71717a on #ffffff",
        "ratio": 4.83,
        "pass": true
      },
      {
        "pair": "muted-foreground / background",
        "mode": "dark",
        "resolvedHex": "#9d9da6 on #141417",
        "ratio": 6.84,
        "pass": true
      },
      {
        "pair": "muted-foreground / muted (unselected segmented label, meta on a hovered row)",
        "mode": "light",
        "resolvedHex": "#71717a on #f4f4f5",
        "ratio": 4.4,
        "pass": false
      },
      {
        "pair": "muted-foreground / muted",
        "mode": "dark",
        "resolvedHex": "#9d9da6 on #1e1e22",
        "ratio": 6.18,
        "pass": true
      },
      {
        "pair": "destructive oklch(0.53 0.2 25) / its text",
        "mode": "light",
        "resolvedHex": "#ffffff on #c51d28",
        "ratio": 5.87,
        "pass": true
      },
      {
        "pair": "destructive oklch(0.67 0.2 25) / its text",
        "mode": "dark",
        "resolvedHex": "#141417 on #f85452",
        "ratio": 5.59,
        "pass": true
      },
      {
        "pair": "success oklch(0.52 0.12 150) / its text",
        "mode": "light",
        "resolvedHex": "#ffffff on #287c42",
        "ratio": 5.18,
        "pass": true
      },
      {
        "pair": "success oklch(0.66 0.12 150) / its text",
        "mode": "dark",
        "resolvedHex": "#141417 on #56a76a",
        "ratio": 6.24,
        "pass": true
      },
      {
        "pair": "warning: butter ink / butter bg",
        "mode": "light",
        "resolvedHex": "#613700 on #fce7bc",
        "ratio": 8.42,
        "pass": true
      },
      {
        "pair": "warning: butter ink / butter bg",
        "mode": "dark",
        "resolvedHex": "#edc7a4 on #2c2108",
        "ratio": 10.02,
        "pass": true
      },
      {
        "pair": "section tone ink / tone bg, weakest of 11 (peach)",
        "mode": "light",
        "resolvedHex": "#713408 on #ffe1cc",
        "ratio": 7.69,
        "pass": true
      },
      {
        "pair": "section tone ink / tone bg, weakest of 11 (peach)",
        "mode": "dark",
        "resolvedHex": "#f5bfa1 on #302015",
        "ratio": 9.57,
        "pass": true
      },
      {
        "pair": "selected tone: --z0 text on tone ink, weakest of 11 (peach)",
        "mode": "light",
        "resolvedHex": "#ffffff on #713408",
        "ratio": 9.56,
        "pass": true
      },
      {
        "pair": "selected tone: --z0 text on tone ink, weakest of 11 (peach)",
        "mode": "dark",
        "resolvedHex": "#141417 on #f5bfa1",
        "ratio": 11.25,
        "pass": true
      },
      {
        "pair": "Bulk actions bar (re-pinned light ramp)",
        "mode": "dark",
        "resolvedHex": "#fafafa on #27272a",
        "ratio": 14.27,
        "pass": true
      }
    ],
    "nonTextExemptions": {
      "--color-ring": "Focus indicator, WCAG 1.4.11 (3:1): #18181b on #ffffff 17.72:1 light, #f4f4f5 on #141417 16.73:1 dark — passes. This is the prototype's declared ring (--ring = --z900). What the prototype paints is weaker: keyboard focus is a #efeff1 / #232327 fill (1.15:1 / 1.17:1) and an open search or picker field gets a #a1a1aa / #5b5b63 border with a 3px rgb(161 161 170 / .25) halo (2.56:1 / 2.73:1) — both under 3:1.",
      "--color-chart-1": "Non-text data fill (progress and revenue bars): #287c42 on #ffffff 5.18:1 light, #56a76a on #141417 6.24:1 dark — passes 3:1. It is the darkened brand green; the true logo green #5bbd74 is 2.34:1 on #ffffff.",
      "--color-chart-2": "Non-text: #5da1c8 on #ffffff 2.84:1 light (under 3:1), #5da1c8 on #141417 6.48:1 dark. Used only as status dots and thin bars beside a text label.",
      "--color-chart-3": "Non-text: #d3a056 on #ffffff 2.35:1 light (under 3:1), #d3a056 on #141417 7.82:1 dark. Used only as status dots and thin bars beside a text label.",
      "--color-chart-4": "Non-text: #9d8cd0 on #ffffff 2.96:1 light (under 3:1), #9d8cd0 on #141417 6.21:1 dark. Used only as status dots and thin bars beside a text label.",
      "--color-chart-5": "Non-text: #cf7f7f on #ffffff 3.00:1 light, #cf7f7f on #141417 6.12:1 dark — passes 3:1."
    }
  },
  "notes": "1) Dark mode is designed: user menu › Appearance — Light · Dark · System, default Light, saved per device; System follows prefers-color-scheme; print stays light. Dark surfaces: background #141417, canvas #0e0e10, text #fafafa, muted text #9d9da6, borders #2c2c31; the ten section tones get computed dark variants (bg L 0.255–0.265, ink L 0.845–0.86). 2) Brand rule applied: the text-bearing brand colour is the ink #18181b and passes everywhere. The logo's green oklch(0.72 0.14 150) = #5bbd74 fails as text (2.34:1 on #ffffff), so it keeps its true value on non-text only (the logo dot); every green that carries text uses the darkened oklch(0.52 0.12 150) = #287c42 (5.18:1 under #ffffff) or the sage ink oklch(0.37 0.08 150). --color-ring keeps the true ink; --color-chart-1 deliberately uses the darkened green because that is what the prototype draws data in and the true green is under the 3:1 graphics minimum. 3) accentColor 'emerald' is the nearest enum to the brand hue 150 (enum emerald 160, lime 130); the prototype has no green accent surface. --color-accent here is the zinc hover surface (shadcn meaning); the prototype's own --color-accent variable is the ink and is not used for this. 4) harmony 'triadic': chart tokens are given explicitly; chart-2…5 are the section-tone dots at hues 235, 75, 295 and 20 around the 150 anchor, a wide spread that only 'triadic' approximates ('monochromatic' would turn them into five greens). 5) contrast 'normal', not 'crisp': the prototype's surfaces are stock zinc (#ffffff, text #09090b, border #e4e4e7); crisp would darken borders to L 0.8. separation 'border', not 'hairline': every divider is 1px #e4e4e7. shape 'uniform', not 'mixed': buttons, fields and nav tabs are 8px; pills are only chips, badges, the preview pill, the phone floating action button and the phone tab-bar pill. iconWeight 'thin': the Lucide icons are drawn at stroke-width 1.6 (2 only on 12–14px chevrons, sort arrows and plus/minus); thin (1.5) is nearest. 6) density 'cozy' is the desktop value; the prototype tightens paddings when the window is under 1440 × 800 (every tablet and desktops 1100–1439 wide) and again on phone (< 760) — preset.md lists every value. 7) Unmet: muted-foreground on muted is 4.40:1 in light (#71717a on #f4f4f5: unselected segmented-control labels, meta text on a hovered row). The painted focus treatments are under 3:1 (see --color-ring). Kept as the prototype has them; not silently changed. 8) Places the prototype leaves unthemed in dark: segmented-control hover/press fills are hard-coded white (#f4f4f5 text on #9a9a9c 2.56:1, on #ddddde 1.23:1); photo-tile captions use --z50 over a black scrim (#0e0e10 on #232325 1.23:1); the patient-file photo-thumbnail category pill is white with --z700 text (1.30:1); the calendar grid lines and past-time veil are hard-coded light; the 'Remove lead' button is hard-coded #dc2626 with --z0 text (3.81:1, hover 2.84:1). 9) The Bulk actions bar and the Photo viewer re-pin the light zinc ramp in dark (--z900 = #27272a there), so their light-on-dark text holds (14.27:1). 10) Section colour-coding (11 tones: bg / ink / line / dot), status soft fills, typography, radius, shadows, motion and the per-viewport padding table are outside the --color-* set and live in preset.md; nothing is invented as a token here. Fonts: Inter 400/500/600/700 and JetBrains Mono 400/500, loaded from Google Fonts in the prototype."
}
```

# Veyl — Style Lock

## Direction (superseded 2026-08-16 — full pivot, user-directed)
**Previous direction (riso/print olive) is retired.** User supplied a real reference set (Cryptox-style crypto trading template screenshots) and real asset files — `design/assets/hero_bg.mp4` (orange/black vortex loop), `design/assets/trading.png` (glass dashboard 3-card mockup), `design/assets/chart.webp`, `design/assets/risk_management.svg` — and asked for the whole landing page rebuilt to match, using those exact assets. This is now the locked direction. Palette below is extracted from the real asset files (`scripts/extract_palette.py`), not eyeballed from the screenshots.

Mood: premium fintech / "ember vortex" — near-black ground, warm dark-grey glass cards, a single vivid orange-red accent used sparingly for CTAs, live indicators, and glow. Video hero background (looping, muted, watermark removed via ffmpeg delogo).

## Color contract (checked via check_contrast.py --matrix)
- bg `#0A0A0A` (near-black ground)
- surface `#1C1B1A` (glass card surface)
- surface-2 `#262524` (nested/hover card variant — not in the strict matrix, kept close in lightness to surface so text contrast carries over)
- text `#F5F1ED` (warm off-white)
- muted `#A69C93` (secondary text — checked separately: 7.35:1 on bg, 6.39:1 on surface)
- primary `#FF5A2E` (vivid ember orange — CTAs, live/active state, glow accents)
- accent `#B23A17` (deeper ember — gradient partner to primary, decorative glows)
- border `#33302E` (hairline on dark surfaces)
- on-primary `#0A0A0A` (near-black — text ON primary-fill buttons; the reference template uses white-on-orange but that pairing fails contrast (2.77:1) — using near-black text on the orange fill instead, which passes at 6.37:1 and still reads as bold/punchy)

Legal pairings:
- Text-safe (>=4.5): text/bg, text/surface, text/border, text/on-primary, bg/primary, primary/on-primary, surface/primary, text/accent
- UI-safe (>=3.0): primary/border, bg/accent, accent/on-primary
- Decorative only (<3.0): surface/accent, text/primary (do not put text-colored text on a raw primary fill — use on-primary instead), accent/border, primary/accent, bg/border, border/on-primary, surface/border, bg/surface, surface/on-primary, bg/on-primary

## Type pairing
- Display: bold rounded/geometric sans (reference uses a rounded grotesque) — using next/font/google "Plus Jakarta Sans" at weight 700-800 for headlines, close match to the reference's rounded bold display type
- Body/UI: "Inter" (already loaded) — running copy, nav, buttons, data
- Mono: existing "Space Mono" (--font-mono-ui) — unchanged, still used for addresses/hashes

Note: the old Anton + Instrument Serif pairing (riso direction) is dropped for the primary brand voice but the font loads can stay in the codebase unused, or be removed in a later cleanup pass — not blocking.

## Texture / asset system
- Hero background: `design/assets/hero_bg_clean.mp4` — looping, muted, autoplay, playsInline, watermark removed via ffmpeg `delogo` filter (box x=1130 y=565 w=90 h=75 at 1280x720 source), poster = `hero_bg_poster.jpg`
- Dashboard mockup: `design/assets/trading.png` (3-card glass panel) — used in hero as the "proof" visual, floating below/beside the headline per the reference layout
- Feature/mechanism illustration: `design/assets/risk_management.svg` — recolor-compatible (already orange-gradient), used in the "how it works" section
- Chart fragment: `design/assets/chart.webp` — small supporting visual for a stat/balance-style card
- Icons: existing Iconify carbon-set icons (locked, shuffle, rocket, timer, shield-alert, arrow-right) — kept, recolored to the new primary orange instead of the old terracotta (same hex family, no refetch needed)
- Card glass effect: `surface` bg + 1px `border` + soft radial glow using `primary`/`accent` at low opacity, rounded corners (20-24px, matches reference)

## Structure (Step 2.5)
Macrostructure: **Bento/Dashboard Showcase** hero (video bg + floating glass dashboard cards) → feature grid with connector illustration → "why choose" icon-card grid → app embed → close. Different shape from the prior long-scroll-narrative poster-collage (which is retired), matching the reference's product-showcase rhythm instead of a scroll-story.

Beats (6, updated 2026-08-16 — see below):
1. Hook — video-bg hero, headline + one CTA, floating `trading.png` dashboard mockup as the single hero visual
2. Positioning — "what category is this": a terminal-category card + a privacy-category card, merged into a "Veyl is both" result card. Added because user tested the live page and couldn't tell if Veyl was a launchpad, a wallet, or a terminal — the page never said so explicitly.
3. How it works — split into two explicitly tagged tracks (was one ambiguous 3-step flow ending in "or launch", which is exactly what caused the positioning confusion): "Trade privately" (tag: Everyday) and "Launch a token" (tag: Occasional), each its own 3 steps, sharing `risk_management.svg` as one connector illustration
4. Why Veyl — icon-card grid (4 cards: cryptographic privacy, real STRK20 mainnet, sealed-bid fair launch, no custody) — glass cards, icon badges in primary-orange rounded squares
5. App embed — the real wallet panel, restyled to the ember/glass theme
6. Close — credit stamp footer

**2026-08-16 revision note:** content/structure only, no palette or type change. New icons added: `terminal`, `merge` (merge fetched but not used — a plain "+" character read cleaner between the two positioning cards than the git-merge glyph; kept the file on disk, not wired in).

## Dark mode
Locked dark-only — same as before, now for a different reason (this identity is a near-black ember ground, not the olive one).

## App shell chrome (2026-08-25 — `/dashboard`, via the tastemaker skill)
The dashboard was originally built without this skill (a single `uni.module.css` `.panel` —
floating rounded card, heavy drop shadow, 520px centered width — dropped into an otherwise
empty page). User called it out directly ("no professional launchpad uses that worthless
modal ui") with real launchpad/trading-terminal references. Rebuilt as a first-class App
shell per `component-patterns.md`, reusing the exact locked tokens above, no new palette:

- **Sidebar**: `surface` bg, persistent, flat list (3 destinations: Overview/Terminal/
  Launches — under the "~7 items" threshold for grouping).
- **Content area**: `bg`, the quietest surface, per the rule.
- **Topbar**: shares content `bg` + a `border` hairline underneath, contextual only
  (network/wallet chip, no nav duplication).
- **Active nav item**: `primary`-colored 2px left-border accent + `surface` fill — the one
  dedicated Primary treatment outside a button, per the rule. Hover is a distinct, lighter
  `surface-2` shift so active/hover never read the same weight (this was wrong before the
  rebuild — both states used identical `surface`).
- **Density**: tighter than the marketing page's own card padding (stat tiles 14px not
  18px+, table cells 9px/12.5px type) — a shell reads correctly denser than its own landing
  page per the rule, not a cut corner.
- **`WalletAccountV6Tag` now takes a `chrome` prop** so its shell is a choice, not a hardcode:
  `"shell"` (flush, full-width, no shadow, left-aligned tabs) is what `/dashboard` uses
  everywhere now. `"embed"` (the original 520px floating card) stays as the default for
  backward compatibility, but checked against actual usage, nothing currently renders this
  component outside `/dashboard` — the landing page's "app embed" beat (`style-lock.md`'s
  Structure section above) turned out to be the static `trading.png` mockup, not a live
  embed of this component. Kept the `embed` variant rather than deleting it since it's a
  real, working alternate skin the component still owns, just currently unused — this is
  the honest state, not "still used by the landing page" as an earlier draft of this note
  claimed.
- **Workspace shape**: a real trading-terminal split (content column + a 400px sticky right
  rail holding the terminal), not a stacked single column — matches the Coinbase
  Prime-style reference the user linked (chart/table on the left, order ticket fixed on the
  right) more than the purple-portfolio reference (which stacks a chart above a table above
  a widget); picked the terminal-split shape since Veyl's core action *is* the terminal, not
  a secondary widget.
- **Motion**: App shell track (per `animation-guidelines.md`) — staggered card entrance on
  data-load (`prefers-reduced-motion`-gated), no scroll-timeline (nothing to scroll-tell in
  a shell).
- Anti-slop + motion scans (`anti_slop_scan.py`, `audit_motion.py`) both pass clean on
  `src/app/dashboard/`.

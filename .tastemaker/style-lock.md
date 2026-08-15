# Veyl — Style Lock

## Direction
Riso-print / zine-poster nostalgia, adapted for a serious mainnet trading product. Source: user-pasted poster reference (dark olive ground, dusty-rose display type, halftone illustration, film grain, condensed grotesque + brush-script pairing, rotated sticker labels, pill-outline annotations, doodle arrow, bottom credit stamp). Grammar kept; content swapped from "personal creative zine" to "clearing-engine mechanics" — stickers become ticket/status stamps (SEALED, CLEARED, LIVE), annotation bubbles carry real protocol facts instead of jokes.

Mood: technical + elegant hybrid (not a stock mood — mixed deliberately: olive/grain/print texture reads *serious/analog/trustworthy*, the brush-script accent reads *considered, not corporate*).

## Color contract (checked via check_contrast.py --matrix)
- bg `#33421F` (deep olive ground)
- surface `#2A3519` (card/panel, darker olive)
- text `#F2E9D8` (warm cream)
- primary `#D9A79B` (dusty rose — headline type, primary actions)
- accent `#C97B5F` (burnt terracotta — stickers, live indicators)
- border `#5C6B3E` (muted olive line)
- on-primary `#1C1C1C` (near-black, for text on rose/terracotta fills)

Legal pairings:
- Text-safe (>=4.5): text/on-primary, text/surface, text/bg, primary/on-primary, surface/primary, accent/on-primary, bg/primary, text/border
- UI-safe (>=3.0): surface/accent, bg/accent
- Decorative only (<3.0, hairlines/large-scale only): border/on-primary, primary/border, text/accent, surface/border, bg/border, accent/border, text/primary, bg/on-primary, primary/accent, surface/on-primary, bg/surface

## Type pairing
- Display/condensed grotesque: "Anton" (Google Fonts) — headline blocks, sticker labels, stat numbers
- Script/brush accent: "Instrument Serif" italic (Google Fonts) — single emphasis words inside headlines only, never body copy
- Body/UI: "Inter" — all running copy, nav, buttons, data

## Texture system
- Film grain: SVG feTurbulence overlay, fixed, low opacity, screen-blend
- Halftone: CSS radial-gradient dot-matrix pattern (code-native — no photography needed, this is a graphic/print style not a photo style)
- Sticker labels: rotated -3deg to 4deg, solid accent/primary fill, on-primary text, hard drop shadow (no blur) to read as cut paper
- Annotation bubbles: 2px border, bg color, pill radius, hand-drawn feel via slight border-radius asymmetry

## Structure (Step 2.5)
Macrostructure: Long-Scroll Narrative (poster-collage sections stacked, not card-grid) — matches the reference's scrapbook composition better than a feature-grid template.

**Updated 2026-08-15 for the private-launch/trading-terminal pivot** (was: generic batch-clearing exchange copy). Palette/type/texture system unchanged — only the beats' content:
1. Hook — hero: claim + mechanism in one line ("trade without being watched"), halftone illustration of the shield → shadow-wallet → trade flow
2. How it works — 3-step visual (Shield → Unlinkable execution wallet → Trade/Launch), annotated like a diagram, sticker-stamped with real protocol facts
3. Proof — two mechanics side by side (spot trading identity / sealed-bid fair launches), spec stamps — no invented volume/usage numbers, this is pre-launch
4. Close — built-on-STRK20 technical credibility block + CTA, bottom "cleared on starknet mainnet" credit stamp

## App shell (WalletAccountV6Tag panel — Step 4, skips Step 2.5)
Existing tabbed component (Shield/Send/Unshield/Echo/Balances), logic untouched, restyled only. Dark olive surface cards, tab-switch transition + result-card entrance per the App shell motion track (no scroll-timeline — this isn't a scrolled screen).

## Assets
- Icons: Iconify, technical mood set, tinted to accent — fetched below
- Illustration: code-native SVG (halftone shapes), not unDraw — the reference style is print/graphic, not illustrator-figure based
- Motion: GSAP + ScrollTrigger, scroll-storytelling timeline (this is a marketing/landing screen)

## Dark mode
Locked dark-only (the entire brand is the olive-ground print aesthetic; no light variant makes sense for this identity).

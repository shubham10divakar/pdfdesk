---
name: artifact-design
description: Design guidance and fundamentals for Artifacts. Load before writing any artifact, including a skill-instructed Markdown one - Markdown is never a shortcut past the design pass.
---

<!--
Copied into this repo for reference: this is the design guidance Claude loaded before building the
ResearchDesk prototype (2026-11-03). It was delivered by the Artifact tool rather than read from disk,
so this copy is transcribed from the session. Parts specific to publishing on claude.ai (page skeleton,
CDN allowlist, viewer frame limits) are kept because they explain choices in prototype/ (e.g. PDF.js
from cdnjs, no print button, localStorage wrapped in try/catch).
-->

# Artifact design

## Page contract (claude.ai Artifact rules)

**Format**: Always author the page as `.html`. Publish a `.md` file only when a loaded skill explicitly instructs it. When the user shares a markdown document or asks to turn one into an artifact, author an HTML page based on its content: preserve its substance and design the page as you would any other artifact rather than transcribing the markdown one-to-one.

**Skeleton**: The file is wrapped in a `<!doctype html>…<head>…</head><body>` skeleton at publish time, so write the page content directly, with no `<!DOCTYPE>`, `<html>`, `<head>` or `<body>` tags. The head carries only a charset and viewport meta (with `viewport-fit=cover`) plus a small reset: light `color-scheme`, `:root` padded top and bottom by the phone's safe-area insets, zero body margin with a 14px system font, `img{max-width:100%}`, and `[hidden]{display:none!important}` (toggle visibility with `el.hidden`, not `style.display`). Put your own `<title>` and `<style>` at the top of the file and keep the `:root` padding. Put `<meta name="claude:viewport-fit-sides" content="cover">` beside the title only together with side gutters written as `padding-left: max(16px, env(safe-area-inset-left, 0px))` / `padding-right: max(16px, env(safe-area-inset-right, 0px))`. Anything fixed to a screen edge adds that edge's `env(safe-area-inset-*)` to its padding; a sticky header uses `top: env(safe-area-inset-top, 0px)` with a fixed `body::before` painting the band above it.

**Title**: Put a `<title>` in the first 8KB. Write a name, not a summary: a short noun phrase, typically two to four words, specific enough to pick the page out among many. Use the user's own name for the thing if they have one. Never use a generic category label alone, and never append an explainer after a dash or colon. The explanation goes in the one-sentence publish `description`.

**External resources (CSP)**: scripts load only from cdnjs.cloudflare.com (preferred), cdn.jsdelivr.net/npm/, unpkg.com, cdn.tailwindcss.com and code.jquery.com; stylesheets only from fonts.googleapis.com (fonts from fonts.gstatic.com, always with a fallback stack). Everything else is blocked silently, including fetch/XHR/WebSocket and a library's runtime fetches. Inline other CSS/JS and embed assets as data: URIs. Load libraries as UMD builds pinned to an exact version at least two weeks old, placed before the inline script that uses them. Downloads started by the page (`<a download>`, script saves) are inert. `mailto:`/`tel:` links are unreliable: show the address as selectable text. Mermaid renders natively. `alert()`, `confirm()` and `prompt()` don't show; build confirmations into the page.

**What the viewer's frame allows**: no `window.print()`; forms work as UI but submissions go nowhere (handle `submit` with `preventDefault()`); `navigator.clipboard.writeText` works inside a click handler (catch rejection, fall back to selecting text); reading the clipboard never works; camera, mic, location etc. are refused unless a runtime capability grants them; wake lock may be granted; fullscreen and pointer lock are optional; sound only after interaction; no third-party iframes, `<object>` or `<embed>`, link out instead; `window.open` mostly returns null; Web Workers from own files or blob: URLs work, service workers and WebRTC don't; only a plain `#name` hash survives; route on it only when the page has several views worth linking.

**Browser storage**: localStorage, sessionStorage and IndexedDB work per artifact origin, per viewer browser. They can come back empty or throw, so wrap every read and write in try/catch and render correctly without them. Use them only for per-viewer conveniences, never for state that must persist reliably, be shared, or be read back by Claude.

**Size**: 16MB max including data: URIs.

**Responsive**: must work at about 400px; the body never scrolls horizontally. Keep a 16px+ side gutter (the `max()` form above) on body or one outer wrapper, with vertical padding via `padding-block`. Use relative units; let rows wrap or stack; give flex/grid children holding text, code or tables `min-width: 0`; `max-width: 100%` on images and aspect-ratio boxes; no `min-width` wider than the screen. Only tables, diagrams and code blocks may be wider, each inside its own `overflow-x: auto` container.

**Theme-aware**: three states: explicit `data-theme="dark"`/`"light"` on the root, or nothing (system). Define every color as a token:

```css
:root { --bg: …; --fg: …; --accent: … }  /* every token, light values */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: …; --fg: …; --accent: …; color-scheme: dark } }
:root[data-theme="dark"] { --bg: …; --fg: …; --accent: …; color-scheme: dark }
body { background: var(--bg); color: var(--fg) }
```

Every token is first defined on bare `:root`; the dark blocks only redefine. No component uses a literal color that works in one theme only. `body` always has an explicit token background. A dark-first design mirrors the shape; a deliberate single-look design may drop the dark blocks but still sets every color explicitly.

**Icon**: one short generic word on first publish (e.g. "chart", "book"), kept for the artifact's life.

## Stance

Work the way the design lead at a small, versatile studio would: give each client a visual identity at the level of treatment the task calls for. Make deliberate choices about palette, typography and layout that are specific to this subject, and avoid templated designs.

## Read the request first

Decide the treatment; designing is a given. A doc gets the same craft as a landing page; only the treatment differs. Many requests call for a utilitarian treatment (a plan, a memo, a demo): polished, with real typographic hierarchy, considered spacing and a proper palette, without over-designing. Some call for an editorial treatment (a landing page, a game, an app or tool people keep or share). If unsure, a well-composed page is always acceptable; an over-designed identity sometimes isn't.

## Fundamentals for every artifact

**Respect what already exists.** Look for an existing design system first (CLAUDE.md, a tokens or theme file, existing styles) and apply it. Precedence: the user's words, then the project's system, then your choices.

**Ground it in the subject.** Define one concrete subject, its audience and the page's single job. Distinctive choices come from the subject's own world: its materials, instruments and vernacular. Include at least one detail only this subject would have (real units, document conventions, terms of art) as content, not ornament. Use real content, never lorem ipsum.

**Pair typefaces.** Link Google Fonts directly with a real fallback stack. Keep running text near 65 characters wide. Set a type scale and keep to it. Headings get `text-wrap: balance`; body text gets comfortable spacing; uppercase labels get a little letter-spacing.

**Load libraries instead of inlining them.** UMD build from cdnjs, exact version, before the script that uses it. Only use a library when it does substantial work.

**Choose neutrals deliberately.** A grey with a slight hue bias toward the accent looks intentional; a pure mid-grey looks unconsidered.

**Design both themes.** Structure CSS at the token level for all three theme states (see above). Give the second theme the same care as the first: don't simply invert; keep contrast and keep the accent working on both backgrounds.

**Use layout for spacing.** Flex or grid with `gap`, not per-element margins. Side gutter as above. Size a one-screen app with `height: 100%` on html and body instead of `100vh`. Use `font-variant-numeric: tabular-nums` wherever digits line up.

**Make repeated elements consistent.** Same edges, baselines and padding across sibling cards, rows and badges. Let content set heights; pick column counts the items fill. Text that can outgrow its track wraps or scrolls; clipped text is a bug.

**Use card styling selectively.** Border, fill, radius and shadow mark separate objects; apply them by role. Open with big-number tiles only when the figures are the point.

**Draw charts to scale.** One scale for marks, ticks and labels; labels name values the chart reaches; chart text from theme tokens; nothing overlapping or outside bounds; explicit fills in SVG.

**Make the page complete at rest.** Everything meant to be read is visible on load without scrolling triggers; animate from a visible resting state. Size a hero to content, not the viewport. A tool opens in a realistic working state: real data, or example rows clearly marked as examples. An empty shell shows nothing.

**Avoid AI-generated design.** Common defaults to avoid unless asked: warm cream with a serif display and terracotta accent; near-black with one acid-green or vermilion pop; broadsheet hairline rules with dense columns; purple-to-blue gradient hero on white; Inter or Space Grotesk as the safe face; emoji section markers; everything centered; `rounded-lg` everywhere; accent rails on rounded cards.

**Build cleanly.** No overlapping elements, cascade collisions or silent font fallbacks. Close elements, double-quote attributes, visible focus states, respect `prefers-reduced-motion`, stable `id` on every form control. Use Canvas/WebGL for generative graphics instead of long hand-written SVG paths.

**CSS rules.** Watch selector specificity so type-based and element-based rules don't cancel each other's spacing.

**Writing the copy.** Words are design material. Name things the way users recognise them, not how the system is built. Active voice; controls say exactly what happens ("Publish", then "Published"). Errors explain what went wrong and how to fix it. Specific over clever. Plain sentences; avoid em-dash asides, "not X, but Y", colon reveals, scare quotes and stock phrases.

**Name the page like a product; don't caption it.** See Title above.

**Structure is information.** Numbering, eyebrows, dividers and labels must encode something true about the content. Use 01/02/03 only for real sequences.

**When the page is a UI (dashboard, tool).** It's scanned and operated, so the craft shifts to information design. Summary before detail. Encode state in form as well as numbers (pill, chip, severity stripe). Semantic colours (good/warning/critical) are separate from the accent. Give sparklines and charts the same care as type. Interactive elements should look interactive.

## Process

Start from what the viewer should be able to do on the page. If it needs to keep shared state, live data or ask Claude, load the `artifact-capabilities` skill first.

Before writing, settle a short design plan and write it into the file as the `:root` block:
- **Color**: 4–6 named colour tokens.
- **Type**: tokens for 2+ roles: a characterful display face used with restraint, a complementary body face, and a utility face for data if needed.
- **Layout**: the layout concept as a one-line comment above the tokens.

Build everything from those tokens.

**Write, check once, publish.** At most one preview or screenshot before publishing, one pass of fixes, then publish. A logic-heavy page may get one syntax check or one sample run. No loops of re-checking; further polish is for the user to request.

**Open viewers.** Published changes reach open viewers automatically. Pages with state worth keeping can register `window.claude?.hot?.snapshot(...)` and boot through `window.claude?.hot?.ready`.

## When the request is editorial

Take one real aesthetic risk where it serves the work. Check the plan against the subject and revise anything generic before writing code.

- The hero states the thesis: open with the most characteristic thing in the subject's world.
- Typography sets the personality: pair faces deliberately, avoid families you'd use anywhere, set a clear scale.
- Use motion deliberately: one orchestrated moment beats scattered effects; often less is more.
- Match complexity to the vision: maximalist needs elaborate execution, minimal needs precision.
- Put boldness in one place and keep everything around it quiet.

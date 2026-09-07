---
name: Neologism Engine
description: Dark, spacious interface for exploring, saving, and comparing names.
colors:
  bg: "#0A0A0C"
  surface: "#141418"
  surface-2: "#1C1C22"
  text: "#F2F2F5"
  muted: "#A1A1AE"
  accent: "#6D56E8"
  border: "#2C2C35"
  on-accent: "#FFFFFF"
  active-ink: "#C8BAFF"
  focus: "#BAADFF"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  flat: "0px"
  action: "6px"
  control: "8px"
  field: "10px"
  card: "12px"
  pill: "999px"
spacing:
  "4": "4px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "28": "28px"
  "40": "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.field}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "#5B43D4"
  button-compare:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-quiet-hover:
    backgroundColor: "{colors.surface-2}"
  button-card-action:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "8px 7px"
  button-card-action-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
  input-brief:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "14px 18px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0px 14px"
  navigation-item-current:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
  chip-disclosure:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0.32rem 0.85rem"
  chip-disclosure-active:
    textColor: "{colors.active-ink}"
  discovery-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "24px 22px 16px"
  comparison-cell:
    textColor: "{colors.text}"
    padding: "20px 16px"
---

# Design System: Neologism Engine

## Overview

**Creative North Star: "Dark, spacious name exploration"**

This is a descriptive label for the user-approved existing system, not a new metaphor. A near-black ground, slightly lighter surfaces, restrained violet, and generous spacing keep names easy to read. Space Grotesk gives names and headings a clear identity; Inter carries the interface.

The system recorded here covers the current application header, Create discovery, Saved names, Details drawer, and Compare dialog. English interface copy and the existing local fonts are binding choices. Names remain selectable text, and the hierarchy places each name before its construction hint and actions.

**Key Characteristics:**

- Dark tonal surfaces with fine borders.
- Large names with readable, explicitly labelled actions.
- A centered, spacious frame that adapts from three columns to one.
- Flat cards, with shadows reserved for overlapping panels.
- Visible keyboard focus and reduced-motion support.

Recorded on 2026-09-07 from [ui.css](web/src/ui.css), inherited rules in [index.css](web/src/index.css), [font imports](web/src/main.tsx), and the current components. [PRODUCT.md](PRODUCT.md) is the product authority. This document does not promote the unreviewed legacy Lab, AI Studio, landing, or Settings styling into the core system.

The retained [measurements](docs/uiux-2026-09-07/measurements.json) report one, two, and three columns at the sampled widths, no document overflow, and no small targets in the measured set. They also record contrast for specific Create elements and reduced-motion behavior. The [finish review](docs/uiux-2026-09-07/finish-review.md) has a ship disposition for its scored fixes; it explicitly does not certify the whole surface. The 500-card measurement is a rendering fixture, not evidence of name quality. The sidecar's synthesized tonal ramps are preview aids; the application uses the discrete colors in this frontmatter.

## Colors

One violet accent sits within cool, near-neutral layers. The frontmatter owns the exact palette; the descriptions below explain where to use it.

### Primary

- **Violet accent** (accent): Generate and Compare fills, plus native comparison-checkbox selection.
- **Light violet ink** (active-ink): saved-card action text and active Details disclosures. It is an emphasis color within the same accent family.
- **Focus violet** (focus): the global focus-visible ring. See Components for the retained inherited focus exceptions.

### Neutral

- **Near-black ground** (bg): document, application header, and sticky Create controls.
- **Card surface** (surface): discovery cards, inputs, quiet buttons, and dialogs.
- **Raised surface** (surface-2): active navigation, popovers, undo feedback, and neutral hover states.
- **Primary text** (text): names, headings, input values, and principal action labels.
- **Muted text** (muted): construction hints, supporting copy, and secondary labels.
- **Fine border** (border): card outlines, fields, header divisions, and table separators.
- **White action text** (on-accent): text over filled violet actions.

**The Color Role Rule.** Use violet for primary actions and the implemented selected states. Use neutral text and surfaces for the main reading hierarchy.

Card hover and saved borders have component-specific values in the sidecar. They are states of the card, not additional brand accents. The older green score, amber favorite, and red pass/check treatments remain confined to inherited detail or tool content; they are not a second core palette.

## Typography

**Display Font:** Space Grotesk, with a sans-serif fallback.

**Body Font:** Inter, with a sans-serif fallback.

The pairing is direct and readable. Names and headings share a medium display weight; supporting text uses the quieter body family. The observed hierarchy is role-based, not a mathematically uniform type scale.

### Hierarchy

- **Display:** discovery names use the display token; below the mobile breakpoint they use the headline size (32px). Long names wrap rather than shrink.
- **Headline:** page introductions and Details titles use the headline token. Page introductions reduce to the title size (28px) on mobile; Details titles retain their size.
- **Title:** comparison column names use the title token.
- **Body:** introduction copy uses the body token and a readable maximum width (65ch). Detailed explanatory text uses the label size with increased leading (1.6–1.7). The structural-estimate line also uses 14px at full opacity, with muted text and a line height of 1.8.
- **Label:** controls and form labels use at least the label size (14px). Generate uses a slightly larger semibold label (15px, 600); input text is 16px in the brief and 15px in Saved search.
- **Supporting metadata:** static counts and provenance use smaller type (12–13px). This is not the action-label scale.

The local bundle imports Inter at 400, 500, and 600, and Space Grotesk at 500 and 700. The current wordmark requests 600 in CSS; that request is not a separately bundled font weight. Dynamic counts use tabular numerals.

**The Readable Names Rule.** Keep discovery names at the implemented desktop and mobile sizes, keep action labels at least 14px, and allow long names to wrap.

## Layout

The application uses a horizontal sticky header and a centered content frame with a maximum outer width (1160px). At desktop sizes, the page has side padding (24px), top padding (40px), and bottom padding (80px). Below 700px those become 16px, 28px, and 56px.

The discovery and Saved grids use three equal columns from 1100px, two from 700px through 1099px, and one below 700px. Their gap is 16px. The CSS implements these transitions with maximum-width queries at 1099px and 699px.

The header has a minimum height of 72px, reducing to 64px below 700px. Create's command area sticks directly below it. Discovery scroll offsets account for the two sticky regions (210px desktop, 250px mobile). The command field and Generate action sit in one row at desktop widths and stack below 700px. Expanded options use four columns, reducing to two on mobile; the reference-name field spans two columns.

The spacing tokens summarize reused distances. Small state and icon gaps mix 4px, 8px, and 10px; control interiors use 12px and 16px; groups and panels use 20px through 40px. Keep the observed component padding rather than forcing every distance onto a new uniform grid.

Details opens as a right-edge drawer, at most 520px wide and 100dvh high. Compare uses a centered dialog up to 1100px wide with 24px viewport clearance on each side. Below 700px, Compare becomes a full-height, edge-to-edge dialog. Its table retains a minimum width of 620px inside a keyboard-focusable horizontal scroll region; the document itself does not need to widen.

Below 360px, the wordmark icon and saved count hide, and navigation spacing tightens. Labels for Create, Saved, and Tools remain visible.

## Elevation & Depth

Most separation comes from tonal surfaces and borders. Discovery cards have no resting shadow and do not lift on hover; only their border changes. Shadows identify elements that overlap other content.

### Shadow Vocabulary

- **Popover:** 0 12px 36px #0008. Shared by Tools and Export menus.
- **Dialog:** -12px 0 40px #0005. Applied by the base dialog, including the centered comparison variant.
- **Backdrop:** #0009. Dims the underlying page while a native modal dialog is open.

The sticky header uses a border and opaque ground rather than blur. Its stacking level is above the sticky command area; menus and modal dialogs remain visible over their relevant content.

**The Flat Cards Rule.** Keep discovery cards flat at rest and on hover. Reserve shadows for the implemented popovers and dialogs.

## Shapes

The core uses restrained rounded rectangles. Small card actions use the action radius; navigation, quiet buttons, compact fields, and the close button use the control radius. The main brief field and Generate use the field radius. Discovery cards and the Tools popover use the card radius.

The Details drawer meets the viewport with square corners. Desktop Compare has a larger, component-specific radius (16px) and loses it on mobile. Why and Name checks retain rounded pill disclosures; this pill shape does not make ordinary navigation or primary buttons pill-shaped.

Most boundaries use a single fine border (1px). Icons are inline, stroke-based SVGs with rounded line ends where applicable. Card action icons are visually small (16px) inside full action targets; close uses a 20px mark inside a 44px square button.

## Components

### Buttons

Filled primary actions carry the accent; quieter actions stay close to the surface.

- **Generate:** field-radius rectangle, minimum size 152px by 54px, semibold label, and the primary component padding. It becomes at least 48px high on mobile. Hover uses the recorded darker fill plus inherited opacity (0.88); press inherits a subtle scale (0.96).
- **Compare:** control-radius rectangle, minimum size 128px by 48px. The current implementation has no separate hover fill. It is disabled until at least two names are selected.
- **Quiet:** fine border, surface fill, label-size text, and at least 44px height. Hover moves to the raised surface.
- **Card actions:** transparent at rest, labelled Save/Saved or Remove, Copy/Copied, and Details. Each is at least 44px high. Hover adds the raised surface; saved state also uses a filled SVG star and visible label.
- **Disabled:** most buttons inherit opacity 0.6 and a default cursor. Generate retains its more specific inherited opacity 0.45 and not-allowed cursor.

The global focus-visible ring is 2px with a 4px offset. The existing command field/action and inherited Details controls retain a more specific older violet ring with a 2px offset. The sidecar reproduces those current states; the older color is a compatibility exception, not an additional core palette token.

### Chips

Why and Name checks are disclosure controls in Details, with a fine border, pill radius, and at least 44px height and width. Active text uses light violet ink, and the drawn chevron turns when expanded. Their inherited color and border transitions take 150ms; pressing scales to 0.96 over the inherited transform transition (80ms). Escape and keyboard focus must remain usable in disclosures.

### Cards / Containers

The discovery card is a quiet frame for a name, one line of construction evidence, and visible actions. It uses the card surface, fine border, card radius, and recorded padding. Its minimum height is 212px on desktop and 198px on mobile.

The construction hint reserves a line even when empty and clamps to one visible line. Details carries the fuller explanation. Actions align at the card bottom. Hover changes the border over 160ms with ease-out; the saved state has its own muted violet border.

Saved reuses the discovery card with room above the name for a Compare checkbox and label. The checkbox itself is 18px, within a label target at least 44px high. A saved entry may show a small provenance line below the card. The undo banner uses the raised surface and keeps Undo and Dismiss visible.

### Inputs / Fields

The brief field is a single-line, labelled input with the card surface, fine border, field radius, and a minimum height of 54px. Its placeholder matches the muted text token, and the typed text uses the main text token. The label is visually hidden, not omitted.

Saved search uses the control radius and at least 48px height. Option fields use the control radius, a minimum height of 44px, and visible labels. Supporting errors appear as text; they are not conveyed by color alone.

### Navigation

The header contains the existing wordmark, Create, Saved, and a Tools disclosure. Its buttons and summary use at least 44px height and label-size type. Current navigation uses raised surface and main text; hover uses the card surface and main text.

Tools is a compact anchored popover with full-width labelled actions and smaller descriptive lines. Its SVG chevron is a drawn icon. Escape closes the disclosure and restores summary focus; an outside pointer action also closes Tools. The mobile header retains this same information order.

### Details and comparison

Details and Compare share a native modal dialog with a sticky title/close header, a scrollable body, and a visible close target (44px square). Opening locks the page scroll; closing restores focus to the trigger or main content fallback. Escape and a backdrop click close the dialog.

Details removes the inherited NameCard's outer card frame and uses separators between expanded sections. Compare uses a semantic table with row and column headers, and keeps the name headings visually stronger than the evidence rows. The mobile table scrolls within its labelled region.

### Motion

The new discovery cards appear without entrance animation. Motion is limited to small state changes: the discovery border transition, inherited button presses, and disclosure-chevron rotation. Reduced motion removes animations and transition duration and restores automatic scroll behavior throughout the page. Do not introduce staggered legacy card entrances into discovery.

## Do's and Don'ts

### Do:

- **Do** preserve the approved dark palette, English interface, Inter, and Space Grotesk.
- **Do** keep names visually dominant, selectable, and able to wrap.
- **Do** preserve the 1160px frame and the three/two/one-column transitions at 1100px and 700px.
- **Do** keep core action labels at least 14px and their targets at least 44px.
- **Do** preserve visible focus, native dialog behavior, and the reduced-motion override.
- **Do** retain visible labels and explanations alongside state colors and icons.

### Don't:

- **Don't** promote legacy Lab, AI Studio, landing, or Settings styling into the core system without a separate review.
- **Don't** reuse emoji or text glyphs as control icons where the current system uses drawn SVGs.
- **Don't** turn structural scores or snapshot-check colors into a visual quality or availability guarantee.
- **Don't** add elevation or entrance animation to the discovery-card pattern.
- **Don't** shrink names or widen the document to fit the mobile comparison table.

Not canonized: legacy decorative eyebrows, glyph icons, secondary accent palettes, staggered card animation, and older focus-color exceptions. They are outside the approved core or remain inherited limitations; recording this system does not endorse them for new surfaces.

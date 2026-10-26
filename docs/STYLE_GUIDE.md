# WEB2 – Style Guide (source: Figma file WEB2, frame "Style", node 505:1514)

Brand: **CaraVeso**. These rules come directly from the Figma style frame. When the design and this file disagree, the Figma file wins; ask the user before inventing values that are not listed here.

## General rules for Claude Code

- Adapt to the project's existing stack and styling system. Do not install Tailwind unless the user asks.
- Define every value below once as a design token (CSS variable, theme key or equivalent) and reference the token. No hardcoded hex, font size, font weight or spacing in components.
- Reuse existing components and tokens before creating new ones.
- Do not invent values missing from this file (body text size, spacing scale, radius, shadows, breakpoints). Ask the user or check Figma first.

## Typography

- Font family: **Inter** (all UI text, headings and body).
- Logo wordmark only: **Italiana** Regular, 48px, centered, black. Do not use Italiana anywhere else.
- Headings are all Inter **Medium (500)**, color black:

| Token | Size |
|---|---|
| H1 | 36px |
| H2 | 24px |
| H3 | 20px |
| H4 | 16px |
| H5 | 14px |

- Line height token: `line-height/50_6` = **50.6px**. In Figma it is applied to every heading and weight sample (each in a 66px-tall box). Smaller headings with a 50.6px line height look very loose, so confirm with the user before applying it to H3–H5 in dense layouts.
- Label/caption text in the style frame is Inter Regular 20px with `normal` line height.

## Font weights (Inter)

| Name | Weight |
|---|---|
| Light | 300 |
| Regular | 400 |
| Medium | 500 |
| Semi Bold | 600 |
| Bold | 700 |

## Colors

Figma gives hex values only (no names). Suggested token names:

| Token | Hex | Notes |
|---|---|---|
| `color-primary` | `#0B3056` | Navy, the only brand color |
| `color-black` | `#000000` | Default text color |
| `color-gray-light` | `#D9D9D9` | Neutral |
| `color-gray` | `#C4C4C4` | Neutral |
| `color-white` | `#FFFFFF` | Page background |

## Layout grid

- Columns: **12**
- Margin: **80px** (left and right of the page)
- Gutter: **24px**
- Implement the grid with the project's layout system (CSS grid or equivalent), not absolute positioning.

## Icons

Icons live in Figma frame "ICON COMPONENT" (node 423:1333). Use the exact asset from Figma for each slot; never redraw or substitute an icon.

| Icon | Size (px) |
|---|---|
| Header-acount (account) | 34×34 |
| header-cart | 31×31 |
| header-favourite | 20×20 |
| ep:map-location | 22×22 |
| lucide/search | 24×24 |
| Logout | 26×26 |
| Group 503 | 35×35 |
| Vector (unnamed icons) | ~22×22 and 23×19 |

- Keep each SVG's own width and height; do not stretch it with `100%` sizing.
- Name files in kebab-case after the Figma layer (e.g. `header-cart.svg`).
- Store icons in the project's assets folder and reference them locally, never by temporary Figma URLs.

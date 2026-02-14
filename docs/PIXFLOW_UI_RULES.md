# Pixflow UI Rules (Feb 2026)

## Purpose
Keep the UI consistent and predictable across all Pixflow categories. These rules are the source of truth for layout, navigation, and state feedback.

## Layout
- Desktop: Inputs left, outputs right. Two-column layout must be `grid-cols-1 xl:grid-cols-2`.
- Mobile: Single column with inputs first, outputs second.
- Forms: Use `grid-cols-1 sm:grid-cols-2` for dense field groups.
- Long lists/grids: keep padding and card radius consistent (`rounded-lg` + surface background).

## Navigation
- Top-level category navigation: `PrimaryTabBar`.
- In-page mode switches: `SegmentedTabs`.
- Actions are always `Button` (no action inside tab sets).
- If a control changes the view/state, it is a tab. If it triggers work, it is a button.

## Steps
- Wizard-like flows use `StepHeader` for numbering + titles.
- Keep step labels short and action-oriented.

## Status and Feedback
- Status chips: `StatusPill` (queued/generating/completed/failed/neutral).
- Banners: `StatusBanner` only. Do not introduce custom banners.
- Empty state: `EmptyState`.
- Loading: `LoadingState` or a page-specific grid placeholder if needed.
- Progress: `ProgressBar`.

## Buttons
- Use shared `Button` variants for all actions.
- Avoid raw `<button>` unless the element is a card overlay or complex hit-target.

## Responsive & Touch Standards
- **Touch targets:** All interactive elements (buttons, slider thumbs, modal close) must be at least 44×44px CSS (WCAG 2.2 AAA). Use `min-h-[44px] min-w-[44px]` guard classes on custom hit areas.
- **Responsive padding:** Content areas use `p-4 sm:p-6 xl:p-8` — never a fixed `p-8` at all widths.
- **Sidebar:** Auto-collapses at `<lg` (1024px). Expanded at `≥lg` if the user hasn't manually toggled.
- **Modals:** Use `max-w-[min(<desired>,calc(100vw-2rem))]` to cap width while preventing horizontal overflow on narrow viewports. Never stack two `max-w-*` utilities — the later one wins.
- **Text overflow:** Use `truncate` or `line-clamp-*` on any user-generated or variable-length text (prompt previews, file names, error messages). Never allow unbounded text to break layout.
- **Breakpoint ladder:** Use at least `sm:` + `xl:` where layout shifts. Avoid relying on `xl:` alone.

## Accessibility Baseline
- Tabs must be keyboard navigable (ArrowLeft/ArrowRight/Home/End).
- Buttons need clear labels and visible focus states.
- Avoid color-only status; pair with text (`StatusPill` labels).

## Do Not
- No bespoke tab/button styles for modes.
- No custom banner components.
- No “action tabs” (Upload, Generate, Save inside tab rows).

## Component Map
- `PrimaryTabBar`: top nav categories
- `SegmentedTabs`: in-page mode toggles
- `StepHeader`: step-based flows
- `StatusPill`: per-item status
- `StatusBanner`: inline warnings/errors/info
- `EmptyState`: empty outputs
- `LoadingState`: neutral loading placeholder
- `ProgressBar`: generation or upload progress

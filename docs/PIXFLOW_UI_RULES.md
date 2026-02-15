# Pixflow UI Rules (Feb 2026)

Last updated: 2026-02-15

## Purpose
Keep the UI consistent and predictable across all Pixflow categories. These rules are the source of truth for layout, navigation, and state feedback.

## Layout
- Desktop: Inputs left, outputs right. Two-column layout must be `grid-cols-1 xl:grid-cols-2`.
- Mobile: Single column with inputs first, outputs second.
- Forms: Use `grid-cols-1 sm:grid-cols-2` for dense field groups.
- Long lists/grids: keep padding and card radius consistent (`rounded-lg` + surface background).
- Result grids: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4` — not page-specific column counts.

## Navigation
- Top-level category navigation: `SideNav` (collapsible icon/label sidebar).
- In-page mode switches: `SegmentedTabs`.
- Actions are always `Button` (no action inside tab sets).
- If a control changes the view/state, it is a tab. If it triggers work, it is a button.
- Tab switch scrolls content to top automatically.
- Active category set (current): Prompt Factory, Asset Monster, Img2Engine, Avatar Studio, Captions, The Machine, Lifetime, Library, Competitor Report.

## Steps
- Wizard-like flows use `StepHeader` for numbering + titles.
- Keep step labels short and action-oriented.
- **Never use custom step circles or ad-hoc numbering.** Migrate to `StepHeader`.

## Status and Feedback
- Status chips: `StatusPill` (queued/generating/completed/failed/neutral).
- Banners: `StatusBanner` only. Do not introduce custom banners.
- Empty state: `EmptyState` component — never ad-hoc text.
- Loading: `LoadingState` component — never raw `Loader2` spinners.
- Progress: `ProgressBar`.

## Buttons
- Use shared `Button` variants for all actions.
- **Generate/Regenerate buttons:** Let auto-lime detection handle variant. Never manually set `variant="success"` or `variant="warning"` on generate actions.
- Avoid raw `<button>` unless the element is a card overlay or complex hit-target.

## Destructive Actions
- All destructive actions (delete, clear, remove) require `ConfirmationDialog` before execution.
- Use `variant="ghost-danger"` for destructive trigger buttons.
- Never delete/clear data on single click without confirmation.

## Error Hierarchy
- **Validation errors:** Toast via `notify.error()` — transient, 3s.
- **API/network errors:** `StatusBanner variant="error"` — persistent inline, user-dismissible.
- **Blocking errors:** Inline alert with retry action.
- Do not mix — each severity has one display mechanism.

## Responsive & Touch Standards
- **Touch targets:** All interactive elements (buttons, slider thumbs, modal close) must be at least 44×44px CSS (WCAG 2.2 AAA). Use `min-h-[44px] min-w-[44px]` guard classes on custom hit areas.
- **Responsive padding:** Content areas use `p-4 sm:p-6 xl:p-8` — never a fixed `p-8` at all widths.
- **Sidebar:** Auto-collapses at `<lg` (1024px). Expanded at `≥lg` if the user hasn't manually toggled.
- **Modals:** Use `max-w-[min(<desired>,calc(100vw-2rem))]` to cap width while preventing horizontal overflow on narrow viewports. Never stack two `max-w-*` utilities — the later one wins.
- **Text overflow:** Use `truncate` or `line-clamp-*` on any user-generated or variable-length text (prompt previews, file names, error messages). Never allow unbounded text to break layout.
- **Breakpoint ladder:** Use at least `sm:` + `xl:` where layout shifts. Avoid relying on `xl:` alone.

## Visual Tokens
- **Secondary text:** `text-surface-400` = hint/disabled, `text-surface-500` = secondary, `text-surface-600` = label.
- **Borders:** `border-surface-200/50` for card edges. `border-surface-100` for section dividers.
- **Icon sizes:** `w-4 h-4` inline, `w-5 h-5` section headers, `w-6 h-6` hero/page icons. Never use arbitrary sizes.
- **Animation durations:** `duration-150` (fast, hover/focus), `duration-300` (medium, transitions), `duration-500` (slow, page enter).

## Accessibility Baseline
- Tabs must be keyboard navigable (ArrowLeft/ArrowRight/Home/End).
- Buttons need clear labels and visible focus states.
- Avoid color-only status; pair with text (`StatusPill` labels).

## Do Not
- No bespoke tab/button styles for modes.
- No custom banner components.
- No "action tabs" (Upload, Generate, Save inside tab rows).
- No raw `<Loader2>` spinners — use `LoadingState`.
- No ad-hoc empty text — use `EmptyState`.
- No single-click destructive actions — use `ConfirmationDialog`.

## Component Map
- `SideNav`: top-level category navigation
- `SegmentedTabs`: in-page mode toggles
- `StepHeader`: step-based flows
- `StatusPill`: per-item status
- `StatusBanner`: inline warnings/errors/info
- `EmptyState`: empty outputs
- `LoadingState`: neutral loading placeholder
- `ProgressBar`: generation or upload progress
- `ConfirmationDialog`: destructive action confirmation

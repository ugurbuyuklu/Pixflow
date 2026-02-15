# Pixflow UI Interaction Standardization Plan (Feb 2026)

Last reviewed: 2026-02-15

Note:
- This document captures the original standardization plan and baseline audit.
- Some component/file references are historical (for traceability).
- Current category naming uses `Img2Engine` (previously `Img2Video`).

## Goal
Standardize category-level interaction patterns across Pixflow so users see the same mental model everywhere:
- If it is navigation between peer views, it must be a `Tab`.
- If it is an action, it must be a `Button`.
- If it is step progress, it must use a consistent `Step` pattern.

This plan focuses on renderer category pages and shared layout navigation.

## Audit Findings (Current State)

### 1) Same concept, multiple visual patterns
- Global category nav uses an underline text tab style:
  - `src/renderer/components/layout/TopNav.tsx:50`
- Product selection uses pill chips:
  - `src/renderer/components/layout/ProductSelector.tsx:9`
- Category mode switches vary widely:
  - Prompt Factory uses `Button`-based switch in image mode:
    - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx:145`
  - Prompt Factory uses raw button segmented style in concept mode:
    - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx:461`
  - Avatar Studio uses `Button` pair for tabs:
    - `src/renderer/components/avatar-studio/AvatarStudioPage.tsx:15`
  - Img2Video uses raw tab buttons:
    - `src/renderer/components/img2video/Img2VideoQueuePage.tsx:55`
  - Asset Monster uses custom `ModeSelector`:
    - `src/renderer/components/asset-monster/AssetMonsterPage.tsx:428`
    - `src/renderer/components/asset-monster/AssetMonsterPage.tsx:568`

### 2) Semantic mismatch: action rendered as tab
- Avatar selection "Mode Toggle" mixes stateful modes (`Gallery`, `Generate New`) with one-shot action (`Upload`) in same segmented row:
  - `src/renderer/components/avatar-studio/shared/AvatarSelectionCard.tsx:81`
This breaks the rule that tabs represent persistent view state.

### 3) Multiple nested tab groups without shared primitive
- Talking Avatar has two independent tab-like controls with different sizes/styles:
  - Script mode switch:
    - `src/renderer/components/avatar-studio/TalkingAvatarPage.tsx:134`
  - Video source tabs:
    - `src/renderer/components/avatar-studio/TalkingAvatarPage.tsx:238`

### 4) Step UX inconsistency between categories
- Asset Monster and Avatar flows use `StepHeader`:
  - `src/renderer/components/asset-monster/StepHeader.tsx:7`
- Machine page renders its own step badges and numbering style:
  - `src/renderer/components/machine/MachinePage.tsx:174`

### 5) Component usage inconsistency (design-system drift)
Approximate usage count by category:
- `prompt-factory`: raw `<button>` 4, `<Button>` 20
- `asset-monster`: raw `<button>` 12, `<Button>` 10
- `img2video`: raw `<button>` 26, `<Button>` 24
- `avatar-studio`: raw `<button>` 28, `<Button>` 16
- `machine`: raw `<button>` 5, `<Button>` 6
- `library`: raw `<button>` 3, `<Button>` 5

Interpretation:
- Raw buttons are legitimate for some card overlays/complex hit-targets.
- But mode/tab controls should not require per-page handcrafted button styles.

## Standardization Decisions

## Decision A: Navigation Primitive Taxonomy
Use three explicit primitives only:
1. `PrimaryTabBar`:
   - For top-level category nav (Prompt Factory, Asset Monster, Img2Video, Avatar Studio, Machine, Library).
2. `SegmentedTabs`:
   - For in-page view modes (2-5 mutually exclusive states).
3. `Button`:
   - For actions (upload, generate, save, retry, download, etc.).

No action is allowed inside a tab set.

## Decision B: Visual and Behavior Rules
Common rules for all tab controls:
- Active state: filled brand or underline variant (chosen by variant prop, not per-page CSS).
- Keyboard support: `ArrowLeft`, `ArrowRight`, `Home`, `End`.
- ARIA: `role=tablist`, `role=tab`, `aria-selected`, `aria-controls`.
- Optional badge/indicator support (counts/spinner).
- Size variants: `sm`, `md`.

## Decision C: Step Pattern
Adopt one shared step header pattern for wizard-like flows:
- Reuse current `StepHeader` API and extend if needed.
- Machine should align with same visual numbering and title style.

## Decision D: Governance
- Add a UI rule: tab/mode switchers must use shared primitives (`SegmentedTabs` or `PrimaryTabBar`).
- No bespoke tab CSS in feature pages unless approved with a documented exception.

## Proposed Component Architecture

Add reusable navigation primitives:
- `src/renderer/components/ui/navigation/SegmentedTabs.tsx`
- `src/renderer/components/ui/navigation/PrimaryTabBar.tsx`

Deprecate feature-specific tab control:
- `src/renderer/components/asset-monster/ModeSelector.tsx` (migrate and remove).

Keep `Button` as action primitive:
- `src/renderer/components/ui/Button.tsx`

## Migration Map (File-by-File)

Priority P0 (highest impact):
1. `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
   - Replace both mode toggles with one `SegmentedTabs` primitive.
2. `src/renderer/components/avatar-studio/AvatarStudioPage.tsx`
   - Replace button pair with `SegmentedTabs`.
3. `src/renderer/components/img2video/Img2VideoQueuePage.tsx`
   - Replace raw tab buttons with `SegmentedTabs`.

Priority P1:
4. `src/renderer/components/avatar-studio/shared/AvatarSelectionCard.tsx`
   - Convert mixed control:
     - `Gallery / Generate New` => tabs
     - `Upload` => separate action button.
5. `src/renderer/components/avatar-studio/TalkingAvatarPage.tsx`
   - Script mode and video source controls -> shared `SegmentedTabs`.
6. `src/renderer/components/asset-monster/AssetMonsterPage.tsx`
   - Replace `ModeSelector` usages with shared `SegmentedTabs`.

Priority P2:
7. `src/renderer/components/machine/MachinePage.tsx`
   - Align step visuals with `StepHeader`.
8. `src/renderer/components/layout/ProductSelector.tsx`
   - Keep as filter chips or move to `SegmentedTabs` variant intentionally (documented choice).

## Phases and Sprints

## Phase 1: Foundation and Decisions (Sprint 6B)
Scope:
- Build `SegmentedTabs` and `PrimaryTabBar` primitives.
- Add accessibility behavior and visual variants.
- Write migration guidelines (`when tab vs button`).

Deliverables:
- New shared components.
- Usage examples in one sandbox/demo page or story-like test page.
- Short design guideline doc.

Acceptance:
- Keyboard + ARIA behaviors implemented.
- No regression in existing top navigation.

Estimated effort:
- 1 sprint (0.5-1 day).

## Phase 2: High-Traffic Category Migration (Sprint 6C)
Scope:
- Prompt Factory, Avatar Studio root, Img2Video root.

Deliverables:
- Three pages migrated to `SegmentedTabs`.
- Visual consistency in spacing, radius, active state.

Acceptance:
- Same tab look/behavior across those three categories.
- No functionality regressions in mode switching.

Estimated effort:
- 1 sprint (1 day).

## Phase 3: Deep Flow Migration (Sprint 6D)
Scope:
- Talking Avatar sub-modes.
- AvatarSelectionCard mixed control refactor.
- Asset Monster mode switches (`promptSource`, `imageSource`) migrate off `ModeSelector`.

Deliverables:
- Nested mode selectors standardized.
- `Upload` action separated from tab semantics.

Acceptance:
- No mixed action/tab rows remain in migrated files.
- `ModeSelector.tsx` no longer referenced.

Estimated effort:
- 1 sprint (1 day).

## Phase 4: Step Consistency and Cleanup (Sprint 6E)
Scope:
- Machine step header alignment.
- Remove dead style fragments and duplicated tab classes.
- Final pass for button-vs-tab semantics.

Deliverables:
- Machine step visuals aligned with shared step style.
- Cleanup PR with deletion of deprecated components/styles.

Acceptance:
- One visible step language across wizard-like pages.
- No custom tab CSS left outside shared primitives.

Estimated effort:
- 1 sprint (0.5-1 day).

## Phase 5: QA and Hardening (Sprint 6F)
Scope:
- Interaction regression pass (manual + smoke).
- Accessibility checks for tab controls.
- Optional UI telemetry event for tab usage consistency.

Deliverables:
- QA checklist completed.
- Known edge-cases documented.

Acceptance:
- All migrated pages pass smoke and manual keyboard navigation checks.

Estimated effort:
- 1 sprint (0.5 day).

## Total Estimate
- 4-5 sprints
- Approx. 3-4.5 engineering days (single developer, focused execution).

## Execution Order Recommendation
1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5

Reason:
- Maximizes early consistency impact while minimizing rework.
- De-risks nested flows after shared primitives are stable.

## Risks and Mitigations
- Risk: Functional regressions in mode-dependent forms.
  - Mitigation: migrate one category at a time; run smoke after each.
- Risk: Over-standardization harming valid special cases.
  - Mitigation: allow explicit documented exceptions.
- Risk: Keyboard/a11y regressions.
  - Mitigation: include tablist behavior tests in Phase 1.

## Definition of Done
- All category mode switches use shared tab primitive.
- Action controls are not embedded as tabs.
- Step headers are visually consistent across multi-step flows.
- CI build/lint/tests/smoke remain green.

## Completion Status (Feb 12, 2026)
Status: Completed.

Delivered:
- `PrimaryTabBar` for top-level navigation.
- `SegmentedTabs` for all in-page mode switches.
- `StepHeader` aligned across wizard-like pages.
- Standard state surfaces: `StatusBanner`, `StatusPill`, `EmptyState`, `LoadingState`, `ProgressBar`.
- Responsive two-column pattern standardized (inputs left, outputs right on desktop; stacked on mobile).
- Deprecated bespoke tab control removed (`ModeSelector`).

# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-18
- Primary product surfaces: `apps/web/src/main.tsx`, `apps/web/src/style.css`, responsible purchase dialog, recommendation/results flow, saved result tracking, integrity/trace details.
- Evidence reviewed:
  - `.omx/plans/prd-lottery-premium-frontend-redesign-20260618T141916Z.md`
  - `.omx/plans/test-spec-lottery-premium-frontend-redesign-20260618T141916Z.md`
  - `.omx/state/ralplan-handoff-lottery-premium-frontend-redesign-20260618T141916Z.json`
  - `apps/web/src/main.tsx`
  - `apps/web/src/style.css`
  - `apps/web/src/ui-source.test.ts`
  - `packages/shared/src/constants.ts`

## Brand
- Personality: Golden Draw Night — refined, ceremonial, clear, responsible, and optimistic.
- Trust signals: visible entertainment-only disclaimer, no odds guarantee, no purchase automation, 19+ official purchase cue, data freshness, trace/integrity disclosure, manual-copy flow.
- Avoid: casino/neon pressure, guaranteed-win language, manipulative scarcity, purchase automation framing, hidden safety copy, unreadable low-contrast luxury styling.

## Product goals
- Goals:
  - Make the lottery assistant feel production-grade and lottery-native.
  - Improve readability, hierarchy, spacing, and confidence in every primary flow.
  - Preserve all implemented recommendation, save, check, trace, freshness, and responsible purchase features.
- Non-goals:
  - No auth, payment, wallet, deposits, purchase clicks, or official purchase integration.
  - No claim that AI improves odds or guarantees outcomes.
  - No new UI dependency unless explicitly approved.
- Success signals:
  - Users can understand the app purpose, generate picks, copy/save/check numbers, and find responsible-use constraints without developer knowledge.
  - The interface reads as a polished lottery draw lounge rather than raw buttons and console text.

## Personas and jobs
- Primary personas:
  - Casual adult Lotto 6/45 player who wants entertainment-only number suggestions.
  - Safety-conscious user who needs clear purchase limits and no-automation boundaries.
  - Operator/developer who needs request, trace, fallback, and freshness diagnostics.
- User jobs:
  - Enter optional lucky numbers and desired count.
  - Reveal recommendations with understandable explanations.
  - Copy or save a recommendation for manual use.
  - Check saved picks after result sync.
  - Verify data freshness and technical integrity when needed.
- Key contexts of use: desktop browsing, mobile quick use, slow API responses, failed LLM/trace paths, result-checking after later sync.

## Information architecture
- Primary navigation: single-page journey with hero, generator, results, saved tracking, responsible guide, and integrity details.
- Core routes/screens: root web app only.
- Content hierarchy:
  1. Hero promise and safety strip.
  2. Ticket-style generator.
  3. Draw/result stage with recommendation tickets.
  4. Saved/result tracking.
  5. Responsible purchase guide.
  6. Collapsible integrity/technical details.
  7. Footer responsible-use reminder.

## Design principles
- Principle 1: Ceremony without deception — reveal animations and ticket styling may create delight, but never imply better odds.
- Principle 2: Trust before excitement — safety, freshness, and no-automation cues stay in the primary journey.
- Principle 3: Readable luxury — premium colors, shadows, and effects must improve clarity rather than obscure content.
- Principle 4: Feature parity is a design requirement — no redesign may remove existing app capabilities.
- Tradeoffs: richer CSS and component structure are acceptable; dependency growth and dark-pattern visual drama are not.

## Visual language
- Color: midnight navy and deep blue-black foundation, champagne/gold accents, warm ivory cards, amber caution, emerald success, red only for true errors.
- Typography: system UI stack with a stronger display scale, high line height, and clear label/helper text.
- Spacing/layout rhythm: spacious responsive shell; desktop two-column hero/generator composition; mobile single-column cards with generous touch targets.
- Shape/radius/elevation: 18–28px radius cards, ticket perforation motifs, glass highlights, soft layered shadows, subtle inner borders.
- Motion: subtle hover/reveal transitions and draw-stage progress accents; all nonessential motion disabled under `prefers-reduced-motion`.
- Imagery/iconography: CSS-only number balls, ticket rails, sparkles, and draw-night radial glows; no external assets required.

## Components
- Existing components to reuse: none formally; current UI is a single React file using repo-native API client and shared constants.
- New/changed components:
  - `Hero`
  - `GeneratorPanel`
  - `ResultsStage`
  - `RecommendationTicket`
  - `NumberBall`
  - `SavedTickets`
  - `ResponsiblePurchaseDialog`
  - `IntegrityDetails`
  - `TrustBadge`/pill primitives via CSS classes.
- Variants and states:
  - Loading/generating, empty results, fallback explanations, saved empty state, checked pick state, warning/success/freshness badges, modal open/closed.
- Token/component ownership: CSS custom properties in `apps/web/src/style.css`; component behavior in `apps/web/src/main.tsx`.

## Accessibility
- Target standard: practical WCAG 2.1 AA alignment for contrast, keyboard, focus visibility, labels, and semantics.
- Keyboard/focus behavior: all controls reachable; visible focus ring; dialog close button available; no keyboard-only dead ends.
- Contrast/readability: body text and small badges must stay legible on dark and ivory surfaces; gold accents are not used as sole text contrast where too low.
- Screen-reader semantics: coherent heading order, labeled inputs, `aria-live` status, descriptive button names, `details/summary` for integrity disclosure.
- Reduced motion and sensory considerations: hover/transition polish is optional; core meaning never depends on motion or color alone.

## Responsive behavior
- Supported breakpoints/devices: mobile around 390px, tablet around 768px, desktop around 1440px.
- Layout adaptations: desktop hero/generator split; result tickets grid; mobile single column without horizontal scrolling.
- Touch/hover differences: minimum comfortable tap targets, hover effects degrade safely on touch devices.

## Interaction states
- Loading: user-readable draw-stage message, CTA disabled while generating, progress shimmer line.
- Empty: premium empty result stage invites the user to reveal recommendations without looking broken.
- Error: API errors are displayed in plain language and keep the user on the page.
- Success: saved/copied/checked feedback is displayed in the status line.
- Disabled: generating CTA is disabled with clear loading copy.
- Offline/slow network, if applicable: fetch failures use the same error message surface; no purchase or payment behavior is attempted.

## Content voice
- Tone: premium, calm, clear, safety-forward, entertainment-only.
- Terminology: Lotto 6/45, draw, ticket, recommendation, lucky anchors, data freshness, integrity details, responsible purchase guide.
- Microcopy rules:
  - Never say or imply “win,” “increase odds,” “guaranteed,” or “jackpot strategy.”
  - Keep `DISCLAIMER`, `RESPONSIBLE_USE_COPY`, and exact no-automation sentence visible.
  - Explain technical details in user-readable language before showing raw IDs.

## Implementation constraints
- Framework/styling system: React 19, Vite, TypeScript, plain CSS.
- Design-token constraints: use CSS custom properties in `:root`; no new dependency by default.
- Performance constraints: CSS-only effects; no heavy images, fonts, or animation libraries.
- Compatibility constraints: preserve current API contracts in `apps/web/src/api-client.ts` and shared schemas.
- Test/screenshot expectations:
  - `pnpm --filter @lotto/web test`
  - `pnpm --filter @lotto/web typecheck`
  - `pnpm --filter @lotto/web build`
  - Manual visual QA for desktop/tablet/mobile when browser tooling is available.

## Open questions
- [ ] Figma target file / owner / needed to create high-fidelity Figma desktop and mobile frames.
- [ ] English-only vs Korean/bilingual production copy / owner / affects localization and tone.
- [ ] Future visual regression tooling / owner / affects repeatable screenshot evidence.

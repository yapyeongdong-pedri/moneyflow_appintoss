# Money Flow Web App Design (AppInToss-ready)

## 1. Goal and Scope

### Goal
Build a 1-person web app that visualizes personal money flow structure, not real transaction tracking.
The app should help users understand:
- where income enters,
- which account/card is connected to which source,
- which expense categories are paid from where,
- and how debt/loan-related payments are positioned in the overall flow.

### In Scope (v1)
- Primary screen: flow map (network graph)
- Hybrid onboarding: quick-start template + manual editing
- Node types with fixed shapes
- Theme palette switching (colors only)
- Share: PNG export + Toss share link
- Runtime support: general web + AppsInToss WebView

### Out of Scope (v1)
- Bank/API sync
- Automatic transaction ingestion
- Exact settlement/reconciliation
- Multi-user collaboration

## 2. Product Principles

- Structure-first: model financial structure and relationships, not statement-level records.
- Low-friction setup: users should get a meaningful graph in under 3 minutes.
- Explainable graph: each node/edge must be human-readable without hidden logic.
- AppInToss-safe by default: avoid common review rejection patterns from day 1.

## 3. Information Architecture

### 3.1 Node Types (fixed shape)

1. Income Source (`income_source`)
- Example: salary, freelance, side income
- Shape: diamond

2. Asset Account (`asset_account`)
- Example: checking account, savings account, investment account, overdraft account
- Shape: circle
- Note: account type and payment purpose are separated.

3. Payment Instrument (`payment_instrument`)
- Example: credit card, debit card
- Shape: rounded rectangle

4. Expense Category (`expense_category`)
- Example: living cost, mortgage principal+interest, insurance, telecom, card bill
- Shape: hexagon

5. Liability Bucket (`liability_bucket`) [optional visible in v1.1, modeled in v1]
- Example: mortgage, overdraft balance, installment plan
- Shape: octagon
- v1 UI can keep this hidden while preserving model compatibility.

### 3.2 Edge Types (flow rules)

Edges represent recurring structural rules, not actual payment events.

- `income_to_account`
- `account_to_card`
- `account_to_expense`
- `card_to_expense`
- `account_to_liability` (future-ready)

Each edge contains:
- source node id
- target node id
- label (purpose)
- optional default amount note (text only in v1)
- optional memo
- active flag

### 3.3 Modeling Rule (critical)

Keep "money container" and "money purpose" separate.

Example:
- Hana Bank account is an `asset_account`.
- Mortgage payment is an `expense_category` (`대출원리금`).
- Relation is expressed by edge: `하나은행통장 -> 대출원리금`.

This rule prevents confusion when one account pays multiple purposes.

## 4. UX Design

### 4.1 Main Screen: Flow Map (highest priority)

Sections:
- Top bar: app title, environment badge (web/toss), share button, theme switch
- Canvas: interactive graph (pan/zoom, node drag, edge highlight)
- Quick panel: selected node/edge detail + edit/delete actions
- Mini legend: fixed shape semantics

Interaction:
- Tap node: highlight incoming/outgoing edges
- Tap edge: show purpose, memo, and origin/target
- Long press / context action: quick add connected node

### 4.2 Onboarding (hybrid)

Step 1: choose template
- Recommended templates:
  - Salary + checking + card + essentials
  - Salary + split accounts (living/saving/investment)
  - Debt-aware setup (mortgage + fixed costs)

Step 2: rename defaults
- Replace generic labels with user-specific bank/card/category names

Step 3: first graph preview
- User sees immediate structure and can edit from canvas

Fallback:
- "Start empty" mode available from same screen.

### 4.3 Editing Model

- Add node from floating action button
- Add edge by source-first connection flow
- Guardrails:
  - disallow invalid type pairs (e.g., expense->income)
  - confirm before deleting node with connected edges
  - keep undo stack for last N actions (recommended N=20)

## 5. Visual System

### 5.1 Shape policy
- Shape is fixed by node type (non-customizable in v1).

### 5.2 Color policy
- Theme palette switcher changes semantic colors globally.
- Example palettes: Calm Mint / Deep Ocean / Warm Sand.
- Ensure contrast ratio targets for readability.

### 5.3 Label policy
- Node label max length rule + ellipsis in canvas
- Full name shown in side panel

## 6. Share and Export

### 6.1 PNG export
- Export current viewport and "full graph" modes
- Include legend toggle (on by default)
- Filename: `money-flow-YYYYMMDD-HHmm.png`

### 6.2 Toss share link (AppsInToss)
- Use `getTossShareLink()` for share URL generation
- Then call `share({ title, text, url })`
- On web environment fallback to native Web Share API or download prompt

## 7. Runtime Architecture

### 7.1 Target environments
- `web`: normal browser
- `sandbox`: AppsInToss sandbox
- `toss`: production Toss container

### 7.2 SDK integration rule
- Use dynamic import for `@apps-in-toss/web-framework` APIs (except TossAds namespace rule)
- Always guard with `isSupported()`
- Provide web fallback path for every Toss-only feature

### 7.3 High-level modules

1. `domain/graph-model`
- Node/edge schema, validators, migration version

2. `domain/graph-ops`
- add/remove/update node/edge, validation, undo/redo state transitions

3. `app/onboarding`
- template packs + rename flow

4. `app/canvas`
- rendering adapter + selection states + layout persistence

5. `app/share`
- PNG export service + Toss/Web share adapter

6. `infra/storage`
- local persistence abstraction (web localStorage, Toss Storage wrapper optional)

7. `infra/environment`
- environment detection + capability flags

## 8. Data Schema (v1)

```ts
export type NodeType =
  | 'income_source'
  | 'asset_account'
  | 'payment_instrument'
  | 'expense_category'
  | 'liability_bucket';

export interface FlowNode {
  id: string;
  type: NodeType;
  name: string;
  meta?: {
    subtype?: string;     // e.g. checking, credit_card, mortgage
    note?: string;
  };
  ui?: {
    x?: number;
    y?: number;
    collapsed?: boolean;
  };
}

export type EdgeType =
  | 'income_to_account'
  | 'account_to_card'
  | 'account_to_expense'
  | 'card_to_expense'
  | 'account_to_liability';

export interface FlowEdge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  label?: string;         // human-readable purpose
  amountHint?: string;    // free text in v1
  memo?: string;
  active: boolean;
}

export interface FlowGraph {
  version: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: {
    theme: 'calm-mint' | 'deep-ocean' | 'warm-sand';
    legendVisible: boolean;
  };
}
```

## 9. Validation Rules

- Unique node IDs and edge IDs
- Node name required, max length 30 (UI-level)
- Edge must connect existing nodes
- Edge type must match allowed source/target type matrix
- No duplicate identical active edge (same source+target+type+label)

## 10. Error Handling

- User input validation: inline error messages, never use `alert()`
- Unsupported SDK in web: graceful fallback and clear message
- Export failure: retry + alternative (full graph export)
- Share failure: allow manual copy/download path

## 11. Testing Strategy

### Unit
- graph validators
- edge type matrix checks
- template-to-graph generation
- environment capability resolver

### Integration
- onboarding template -> first graph render
- node/edge creation and persistence reload
- export/share action by environment

### E2E (critical flows)
- first-time setup in <3 min path
- edit graph + save + reload consistency
- PNG export success and file integrity

## 12. AppsInToss Review Compliance Checklist (Design-time)

- No static imports for SDK APIs (except TossAds namespace exception)
- No `alert/confirm/prompt`
- Do not require external navigation for core features
- If packaged as mini-app, ensure `navigationBar.withBackButton=true`, `withHomeButton=true`
- Keep app naming consistency across config/title/metadata before submission
- Avoid app-install promotion language

## 13. Implementation Milestones

1. Milestone A: domain model + validator + local persistence
2. Milestone B: flow canvas + node/edge CRUD + onboarding templates
3. Milestone C: theme system + legend + polish
4. Milestone D: PNG export + Toss/Web share adapter
5. Milestone E: compliance checks + QA + submission prep

## 14. Open Decisions for Next Planning Stage

- Which graph rendering library to use (React Flow vs custom D3/canvas)
- Exact template presets and Korean default copy
- Liability bucket visibility in v1 UI (show now vs hide until v1.1)
- Storage backend upgrade path (local only vs optional cloud sync)

## 15. Recommendation Summary

Use a hybrid product strategy:
- onboarding simplicity from template-first UX,
- extensibility from strict graph domain model,
- and deployment safety from AppsInToss-compatible runtime branching.

This gives the fastest path to a usable first release while minimizing redesign risk.

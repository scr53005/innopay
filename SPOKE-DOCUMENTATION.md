# Innopay Spoke Integration - Complete Documentation

**Last Updated**: 2026-02-18
**Status**: Production Ready
**Version**: 2.4

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Technical Conventions](#technical-conventions)
4. [Bundle Components](#bundle-components)
5. [Implementation Guide](#implementation-guide)
6. [Framework-Specific Integration](#framework-specific-integration)
7. [Testing Strategy](#testing-strategy)
8. [Production Deployment](#production-deployment)
9. [Admin Backend (Kitchen & Menu Management)](#admin-backend-kitchen--menu-management)
10. [Appendices](#appendices)

---

## EXECUTIVE SUMMARY

### Purpose

This document provides complete integration instructions for connecting new merchant websites (spokes) to the Innopay payment ecosystem. It consolidates all architectural decisions, conventions, code components, and implementation strategies into one authoritative reference.

### Success Criteria

- **Integration Time**: 2-5 days per new spoke (depending on framework)
- **Code Reuse**: >80% of payment logic reused from bundle
- **Zero Payment Bugs**: Copy tested, battle-proven code
- **Framework Flexibility**: Support both Next.js and Vite/React spokes

### Current Production Spokes

| Spoke | Framework | Database | Status | Integration Date |
|-------|-----------|----------|--------|-----------------|
| **indiesmenu** | Next.js 15 | Prisma + Vercel Postgres | ✅ Production | 2025-12 |
| **croque-bedaine** | Vite 5 + React | Supabase PostgreSQL | ✅ Production | 2026-01 |

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **State Management** | Custom useReducer state machine | Lightweight, portable, no dependencies |
| **Backend (Supabase spokes)** | Client-side sync via admin page | No serverless functions needed |
| **Backend (Next.js spokes)** | Direct API routes + Prisma | Native platform integration |
| **Credential Storage** | localStorage (current) | UX priority, low-value wallets |
| **Testing** | 4-level strategy | Unit → Integration → Staging → Smoke |

---

## ARCHITECTURE OVERVIEW

### Ecosystem Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                    Innopay Ecosystem                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐      ┌──────────┐      ┌──────────────┐         │
│   │  Spoke 1 │      │  Spoke 2 │      │   Spoke N    │         │
│   │ (indies) │      │ (croque) │      │  (future)    │         │
│   └────┬─────┘      └────┬─────┘      └──────┬───────┘         │
│        │                 │                    │                 │
│        └─────────────────┼────────────────────┘                 │
│                          │                                      │
│                    ┌─────▼──────┐                               │
│                    │  Innopay   │                               │
│                    │    Hub     │                               │
│                    │  (wallet)  │                               │
│                    └─────┬──────┘                               │
│                          │                                      │
│                    ┌─────▼──────┐                               │
│                    │   Hive     │                               │
│                    │ Blockchain │                               │
│                    └─────┬──────┘                               │
│                          │                                      │
│                    ┌─────▼──────┐                               │
│                    │ Merchant   │                               │
│                    │    Hub     │                               │
│                    │ (polling)  │                               │
│                    └─────┬──────┘                               │
│                          │                                      │
│        ┌─────────────────┼────────────────────┐                 │
│        │                 │                    │                 │
│   ┌────▼─────┐      ┌────▼─────┐      ┌──────▼───────┐         │
│   │  Spoke 1 │      │  Spoke 2 │      │   Spoke N    │         │
│   │  Admin   │      │  Admin   │      │    Admin     │         │
│   │   (CO)   │      │   (CO)   │      │     (CO)     │         │
│   └──────────┘      └──────────┘      └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Payment Flow State Machine

```
    ┌───────┐  OPEN_FLOW     ┌──────────────────┐
    │ idle  │───SELECTOR────►│ selecting_flow   │
    └───────┘                 └────────┬─────────┘
        ▲                              │ SELECT_FLOW
        │                              ▼
        │                     ┌──────────────────┐
        │                     │   redirecting    │──► window.location = hubUrl
        │                     └────────┬─────────┘
        │                              │ RETURN_FROM_HUB
        │                              ▼
        │                     ┌──────────────────┐
        │                     │   processing     │──► API calls, blockchain
        │                     └───┬─────────┬────┘
        │                         │         │
        │            PAYMENT_SUCCESS       ERROR
        │                         │         │
        │    ┌────────────────────┘         └──────────────┐
        │    ▼                                             ▼
   ┌────┴────────┐                                 ┌───────────┐
   │   success   │                                 │   error   │
   │ (green)     │                                 │  (grey)   │
   └─────────────┘                                 └───────────┘
        │                                                │
        └─────────────────── RESET ──────────────────────┘
```

#### State Machine Implementation Guide

**State Definitions**:

| State | Banner | Purpose | Valid Transitions |
|-------|--------|---------|-------------------|
| `idle` | None | Initial state, waiting for user action | → selecting_flow, redirecting, processing |
| `selecting_flow` | Yellow selector | User choosing payment method | → redirecting, idle |
| `redirecting` | **Blue** "Initializing payment processor..." | **CRITICAL**: Before redirect to Stripe/hub | → (browser redirect) |
| `processing` | Yellow with spinner | After return from hub, processing payment | → success, error, account_created, waiter_called |
| `success` | Green checkmark | Payment/order completed | → idle |
| `error` | Grey | Error occurred | → idle, selecting_flow (retry) |
| `account_created` | Green checkmark | Account created (Flow 4) | → idle |
| `waiter_called` | Blue | Waiter summoned | → idle |

**Critical: The 'redirecting' State**

The `redirecting` state is **essential** for proper UX. It prevents showing the wrong banner before redirect.

**❌ WRONG** (shows yellow "Payment success" before payment):
```typescript
dispatch({ type: 'SELECT_FLOW', flow: 3 });
dispatch({ type: 'PROCESSING_UPDATE', message: 'Preparing...' }); // ❌ Wrong state!
window.location.href = stripeUrl;
```

**✅ CORRECT** (shows blue "Initializing..." banner):
```typescript
dispatch({ type: 'SELECT_FLOW', flow: 3 }); // → redirecting state
// State machine now shows blue banner automatically
dispatch({ type: 'START_REDIRECT', returnUrl: stripeUrl });
window.location.href = stripeUrl; // User sees blue banner, then redirect
```

**State-Specific Behavior**:

1. **From 'idle' state**:
   - Flow 6 (pay with account) → directly to 'processing' (no redirect)
   - Flows 3, 4, 5, 7 → to 'redirecting' state (shows blue banner)

2. **'redirecting' state**:
   - Shows blue banner: "Initialisation du processeur de paiements / Veuillez patienter..."
   - Accepts `START_REDIRECT` to update returnUrl
   - Browser redirects, page reloads with URL params

3. **'processing' state**:
   - Shows yellow banner with spinner
   - Accepts `PROCESSING_UPDATE` to change message
   - Accepts `PAYMENT_SUCCESS`, `ACCOUNT_CREATED`, `ERROR` transitions

**Common Pitfalls**:

❌ **DON'T**: Add conditional logic like `if (flow !== 3) { dispatch(...) }`
✅ **DO**: Use proper state transitions

❌ **DON'T**: Dispatch events that aren't valid for current state
✅ **DO**: Check reducer logic - invalid transitions are ignored with a warning

❌ **DON'T**: Try to show multiple banners at once
✅ **DO**: Use state machine - only ONE state is active at a time

**Event Dispatching Rules**:

1. **Always check current state** before dispatching events
2. **Use console logs** to verify state transitions (they're logged automatically)
3. **Don't dispatch PROCESSING_UPDATE from 'redirecting'** - it will be ignored
4. **Preserve URL parameters** when building return URLs (e.g., `?table=X`)

**Flow-Specific State Paths**:

```
Flow 3 (Guest Checkout):
idle → selecting_flow → redirecting → [Stripe] → processing → success

Flow 4 (Create Account):
idle → selecting_flow → redirecting → [Hub] → processing → account_created

Flow 5 (Create + Pay):
idle → selecting_flow → redirecting → [Hub] → processing → success

Flow 6 (Pay with Account):
idle → processing → success (no redirect!)

Flow 7 (Topup + Pay):
idle → selecting_flow → redirecting → [Hub] → processing → success
```

**Return URL Parameter Detection**:

Different flows return with different URL parameters:

| Flow | Return Parameter | Example |
|------|------------------|---------|
| Flow 3 | `payment=success` | `/?table=3&payment=success&session_id=cs_test_...` |
| Flow 4 | `account_created=true&session_id=...` | `/?table=3&account_created=true&session_id=...` |
| Flow 5 | `topup_success=true` | `/?table=3&topup_success=true` |
| Flow 7 | `order_success=true&session_id=...` | `/?table=3&order_success=true&session_id=...` |

**CRITICAL**: Always preserve `?table=X` parameter in return URLs:

```typescript
// ❌ WRONG: Loses table parameter
const returnUrl = `${window.location.origin}${window.location.pathname}`;

// ✅ CORRECT: Preserves table parameter
const returnUrl = table
  ? `${window.location.origin}${window.location.pathname}?table=${table}`
  : `${window.location.origin}${window.location.pathname}`;
```

**Credential Fetching Logic**:

Flow 3 (guest checkout) returns with a Stripe `session_id` but has **NO credentials** to fetch.

```typescript
// ❌ WRONG: Tries to fetch credentials for Flow 3
if (sessionId) {
  await fetchCredentials(sessionId); // Will fail for guest checkout!
}

// ✅ CORRECT: Only fetch if we expect credentials
const flowPending = localStorage.getItem('innopay_flow_pending');
const shouldFetch = credentialToken || (sessionId && flowPending !== null);
if (shouldFetch) {
  await fetchCredentials(sessionId);
}
```

**Testing State Machine**:

1. Open browser DevTools console
2. Watch for state transition logs: `[PaymentStateMachine] idle -> OPEN_FLOW_SELECTOR`
3. Verify each transition is valid
4. Check banner color matches expected state:
   - Blue = redirecting
   - Yellow = processing
   - Green = success/account_created
   - Grey = error

---

### Payment Flows Supported

| Flow | Description | Requires Account | Creates Account | Cashback Eligible |
|------|-------------|------------------|-----------------|-------------------|
| **3** | Guest Checkout (Stripe) | No | No | No |
| **4** | Create Account Only | No | Yes | No |
| **5** | Create Account + Pay | No | Yes | Yes |
| **6** | Pay with Existing Account | Yes | No | Yes |
| **7** | Top-up + Pay | Yes | No | Yes |
| **8** | Import Account | No | No | N/A |

### Payment Flow Details

This section provides detailed implementation information for each payment flow, including detection criteria, user journeys, and special handling requirements.

---

#### Flow 3: Guest Checkout

**Description**: Pay for restaurant order as a guest (no account creation)

**Detection Criteria**:
- Has order (`orderAmount > 0`)
- No localStorage account (`hasLocalStorageAccount = false`)
- No accountName provided (user chose guest checkout, not account creation)

**User Journey**:
1. User places order on `{spoke}.innopay.lu/`
2. Selects "Pay as Guest"
3. Redirected to wallet.innopay.lu with order params
4. Completes Stripe checkout
5. Returns to `{spoke}.innopay.lu/`

**Redirect URLs**:
- Success: `{spoke}.innopay.lu/?table={TABLE}&topup_success=true`
- Cancel: `{spoke}.innopay.lu/?table={TABLE}&cancelled=true`

**Implementation Status**: ✅ Fully implemented in both spokes

**Special Notes**:
- Uses `gst` distriate tag (guest)
- No blockchain account created
- Internal invoice only
- Not eligible for Distriator cashback

---

#### Flow 4: Create Account Only / Import Credentials

**Description**: Create account from restaurant platform OR import existing credentials to spoke

**Flow 4 has TWO variants:**

##### Variant A: Create Account (from restaurant)

**Detection Criteria**:
- No order (`orderAmount = 0` or undefined)
- No localStorage account (`hasLocalStorageAccount = false`)
- AccountName provided (user is creating an account)
- Has restaurant context (`table` only - no `orderMemo`)

**User Journey**:
1. User visits `{spoke}.innopay.lu/`
2. Clicks "Create Innopay Account"
3. Redirected to wallet.innopay.lu/user with table param
4. Completes account creation and top-up
5. Returns to `{spoke}.innopay.lu/?session_id={sessionId}`

**Redirect URLs**:
- Success: `{spoke}.innopay.lu/?table={TABLE}&account_created=true&session_id={STRIPE_SESSION_ID}`
- Cancel: `{spoke}.innopay.lu/?table={TABLE}&cancelled=true`

##### Variant B: Import Credentials (from hub)

**Detection Criteria**:
- URL param `flow=4` present
- URL param `credential_token` present
- User coming from hub spoke card click

**User Journey**:
1. User visits wallet.innopay.lu with existing account
2. Clicks spoke card (e.g., Indies restaurant)
3. Hub creates credential session via `/api/account/create-credential-session`
4. Redirects to `{spoke}.innopay.lu/?credential_token=XXX&flow=4&account_created=true`
5. Spoke fetches credentials via `/api/account/credentials`
6. MiniWallet appears with account balance

**Redirect URLs**:
- Direct navigation: `{spoke}.innopay.lu/?table={TABLE}&credential_token={TOKEN}&flow=4&account_created=true`

**Implementation Status**: ✅ Fully implemented in both spokes

**Special Handling**:
- **Variant A** uses `session_id` for credential fetch after account creation
- **Variant B** uses `credential_token` for credential import from hub (actively used!)
- Both variants use `/api/account/credentials` endpoint
- Credentials stored in localStorage enable mini-wallet for future orders
- No page refresh needed, MiniWallet appears immediately thanks to React Query
- **Spoke banner**: Shows "Votre portefeuille Innopay est prêt, vous pouvez déjà commander"

**Implementation Files**:
- Hub credential session: `innopay/lib/credential-session.ts`
- Hub spoke card handler: `innopay/app/page.tsx` (lines 973-988)
- Spoke credential fetch: `indiesmenu/app/menu/page.tsx` (lines 215-468)
- Spoke Flow 4 handler: `indiesmenu/app/menu/page.tsx` (lines 437-458)

---

#### Flow 5: Create Account and Pay

**Description**: Create new account AND pay for restaurant order in one transaction

**Detection Criteria**:
- Has order (`orderAmount > 0`)
- No localStorage account (`hasLocalStorageAccount = false`)
- AccountName provided (user wants to create account, not guest checkout)
- Has restaurant context (`table`, `orderMemo`)

**User Journey**:
1. User places order on `{spoke}.innopay.lu/`
2. Selects "Create Account & Pay"
3. Redirected to wallet.innopay.lu/user with order params
4. **If account exists in wallet**: Uses existing wallet to pay (flow 5 becomes flow 6 or 7) and returns `credential_token` for spoke to import account
5. **If no account exists**: Enters account name or accepts suggested name, payment includes order + top-up
6. Completes Stripe checkout
7. Returns to `{spoke}.innopay.lu/`

**Redirect URLs**:
- Success: `{spoke}.innopay.lu/?table={TABLE}&topup_success=true`
- Cancel: `{spoke}.innopay.lu/?table={TABLE}&cancelled=true`

**Implementation Status**: ✅ Fully implemented in both spokes

**Payment Structure**:
- Payment is split: part goes to user's new account, part goes to restaurant
- Webhook attempts to transfer HBD to restaurant using `orderMemo` for matching
- If insufficient HBD available, webhook transfers EURO Hive Engine tokens instead and records debt in `outstanding_debt` table
- Debt tracking ensures innopay can settle HBD obligations with restaurants later

**Special Notes**:
- Uses `kcs` distriate tag (eligible for Distriator cashback)
- Creates blockchain account
- Two-leg transfer: Customer → innopay → Restaurant

---

#### Flow 6: Pay with Account

**Description**: Pay for restaurant order using existing account (sufficient balance)

**Detection Criteria**:
- Has order (`orderAmount > 0`)
- Has localStorage account (`hasLocalStorageAccount = true`)
- Account balance >= order amount

**User Journey**:
1. User places order on `{spoke}.innopay.lu/`
2. Payment processed directly from account balance (NO Stripe checkout)
3. Order confirmed immediately on `{spoke}.innopay.lu/`

**Implementation Status**:
- ✅ **indiesmenu**: Fully implemented and working (two-leg, dual-currency)
- ✅ **croque-bedaine**: Fully implemented and working (two-leg, dual-currency via hub)

**Payment Structure (both spokes)**:

This flow does NOT require Stripe checkout. Both spokes implement the same two-leg dual-currency system, though with different architectural approaches:
- **indiesmenu**: Inline logic in `app/menu/page.tsx` (~180 lines), uses `useState` hooks and `useCallback` refs
- **croque-bedaine**: Standalone `executeFlow6Payment()` function called from `usePaymentFlow.ts`, uses state machine dispatch for UI feedback

**Leg 1: Customer → innopay**:
1. **EURO transfer** (collateral): Customer transfers EURO tokens to `innopay` account
   - Signed and broadcast via hub's `/api/sign-and-broadcast` endpoint (cascade authority fallback)
   - Memo contains only the distriate suffix (not the full order memo)
   - Indiesmenu also attempts HBD transfer at this stage; croque-bedaine delegates HBD handling entirely to the hub

**Leg 2: innopay → restaurant** (via `/api/wallet-payment`):
1. **EUR/USD rate resolution**: Hub resolves the rate internally via `getEurUsdRateServerSide()` if not provided by the client. Indiesmenu passes the rate (historical — it was built before the hub existed); croque-bedaine omits it.
2. **HBD sweep**: Hub checks customer's liquid HBD, transfers `min(customerHBD, requiredHBD)` to innopay using innopay's active key authority
3. **Debt recording**: If HBD shortfall > 0.001, creates `outstanding_debt` record (creditor: innopay, debtor: customer)
4. **Restaurant transfer**: Hub checks innopay's HBD balance. If sufficient → transfers HBD to restaurant. If not → transfers EURO tokens as fallback.
5. **Order memo**: `orderMemo + " " + distriateSuffix` used for order matching by merchant-hub

**Payment Structure Principles**:
- Both legs attempt HBD first (preferred by restaurants for Hive transactions)
- EURO tokens serve as collateral/fallback
- Outstanding debts tracked for later HBD reconciliation
- Ensures orders are ALWAYS fulfilled even when HBD is temporarily unavailable

**Special Notes**:
- Uses `kcs` distriate tag (eligible for Distriator cashback)
- No Stripe checkout required
- Fastest payment method (immediate confirmation)

---

#### Flow 7: Pay with Top-up

**Description**: Top-up account AND pay for restaurant order (insufficient balance)

**Detection Criteria**:
- Has order (`orderAmount > 0`)
- Has localStorage account (`hasLocalStorageAccount = true`)
- Account balance < order amount

**Implementation Status**: ✅ **FULLY IMPLEMENTED - UNIFIED WEBHOOK APPROACH**

**User Journey**:
1. User places order on `{spoke}.innopay.lu/`
2. Selects "Pay with Innopay"
3. Account balance insufficient
4. Spoke redirects to Stripe checkout with:
   - `accountName` from localStorage
   - `amount` (calculated: orderAmount - currentBalance, minimum 15€)
   - `orderAmountEuro` (the order cost)
   - `orderMemo` (for restaurant payment matching)
   - `table` (for redirect)
   - `returnUrl` (spoke URL)
5. User completes Stripe checkout
6. **Webhook processes BOTH operations atomically** (`app/api/webhooks/route.ts` handleFlow7UnifiedApproach, lines 379-589):
   - **Step 1**: Execute order payment (innopay → restaurant)
     - Attempts HBD transfer with orderMemo for matching
     - If HBD insufficient → transfers EURO tokens + records debt
   - **Step 2**: Calculate change (topup - order)
   - **Step 3**: Handle change transfer
     - Positive change: Transfer change to customer (EURO + HBD attempt)
     - Negative change: Transfer deficit from customer to innopay
     - Zero change: No transfer needed
   - **Step 4**: Update database with topup record
   - **Step 5**: Create credential session with updated balance
7. Stripe redirects to: `{spoke}.innopay.lu/?order_success=true&session_id={CHECKOUT_SESSION_ID}`
8. Spoke detects `order_success=true` and `session_id`
9. Fetches credentials from `/api/account/credentials` using session_id
10. Clears cart and shows Flow 7 success banner
11. Updates mini-wallet with new balance (NO page reload)

**Redirect URLs**:
- Success: `{spoke}.innopay.lu/?table={TABLE}&order_success=true&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `{spoke}.innopay.lu/?table={TABLE}&topup_cancelled=true`

**Payment Structure**:

The webhook performs a **single atomic transaction** with three possible change scenarios:

**Scenario A: Positive Change (topup > order)**
- Example: User tops up 50€ for 30€ order
- Webhook transfers 30€ to restaurant (HBD or EURO+debt)
- Webhook transfers 20€ change to customer (EURO + HBD attempt)
- User balance: 20€

**Scenario B: Negative Change (topup < order)**
- Example: User tops up 10€ for 30€ order, has 15€ existing balance
- Webhook transfers 30€ to restaurant (HBD or EURO+debt)
- Webhook transfers 5€ deficit from customer to innopay (EURO)
- User balance: 0€

**Scenario C: Exact Match (topup = order)**
- Example: User tops up 30€ for 30€ order
- Webhook transfers 30€ to restaurant (HBD or EURO+debt)
- No change transfer needed
- User balance: 0€

**Key Implementation Details**:
1. **Atomic webhook processing**: Order payment and balance update happen server-side in one webhook call
2. **HBD + EURO dual transfer**: Always attempts HBD first, falls back to EURO tokens with debt recording
3. **Credential session**: Webhook creates session with `euroBalance` = change after order payment
4. **Session ID lookup**: Spoke uses Stripe `session_id` to fetch credentials
5. **No page reload**: Cart clears and success banner appears immediately
6. **Debt tracking**: Records `outstanding_debt` when HBD transfers fail for later reconciliation

**Special Handling**:
- Minimum topup: 15€ (enforced in webhook)
- Change transfers use memo: "Monnaie / Change"
- Deficit transfers use memo: "Paiement manquant / Missing payment"
- Webhook skips account verification (assumes account exists in localStorage)
- Mock accounts supported for dev/test (transfers will fail but flow works)

**Security**:
- Credentials expire after 5 minutes
- One-time use only (retrieved flag prevents reuse)
- CORS headers allow cross-origin credential fetching
- Session ID from Stripe provides secure token

**Error Handling**:
- If restaurant payment fails → throws error, entire transaction fails
- If change transfer fails → logs warning, transaction still succeeds (restaurant already paid)
- If deficit transfer fails → logs warning, manual reconciliation needed
- Database errors are non-blocking if transfers succeeded

**Implementation Files**:
- Webhook handler: `innopay/app/api/webhooks/route.ts` lines 379-589 (handleFlow7UnifiedApproach)
- Checkout creation: `innopay/app/api/checkout/account/route.ts` lines 226-240 (Flow 7 returnUrl handling)
- Spoke page: `indiesmenu/app/menu/page.tsx` lines 289-309 (Flow 7 success handling)
- Credentials API: `innopay/app/api/account/credentials/route.ts` lines 72-92 (sessionId lookup)

**Special Notes**:
- Uses `kcs` distriate tag (eligible for Distriator cashback)
- Most complex flow (atomic transaction with three outcomes)
- Handles edge cases (insufficient balance from multiple sources)

---

#### Flow 8: Import Account

**Description**: Import an existing Hive account into Innopay

**Detection Criteria**:
- User explicitly requests import functionality via "Import Account" button
- User provides email associated with an existing Innopay account

**Implementation Status**: ✅ **FULLY IMPLEMENTED** (both spokes, with email verification)

**User Journey**:
1. User visits `{spoke}.innopay.lu/` without credentials
2. Clicks "Import Account"
3. Enters email address associated with their Innopay account
4. Hub sends a 6-digit verification code to the email
5. User enters the verification code
6. Hub validates code and returns encrypted credentials
7. Credentials stored in localStorage for mini-wallet
8. User can now pay with account

**Implementation**:
Both spokes use the same 3-step hub API flow for secure email verification:
1. `POST /api/verify/request-code` — sends 6-digit code to user's email (via Resend)
2. `POST /api/verify/check-code` — validates the code, returns a one-time credential token
3. `POST /api/verify/get-credentials` — exchanges token for account credentials (accountName, activeKey, masterPassword)

- **indiesmenu**: Inline modal in `app/menu/page.tsx`
- **croque-bedaine**: Dedicated `ImportAccountModal.tsx` component with clean step-by-step UI

**Special Notes**:
- Not a standard payment flow (credential management)
- Not eligible for cashback
- Verification codes expire after 10 minutes
- Rate-limited at the hub level

---

### Flow Technical Implementation

This section describes the technical infrastructure for flow detection and management.

#### Flow Detection Function

The `detectFlow()` function in `innopay/lib/flows.ts` is the **single source of truth** for flow detection:

```typescript
export function detectFlow(context: FlowContext): Flow {
  const {
    hasLocalStorageAccount,
    accountName,
    table,
    orderAmount,
    orderMemo,
    accountBalance,
  } = context;

  const hasOrder = orderAmount && parseFloat(orderAmount) > 0;
  const hasRestaurantContext = table || orderMemo || hasOrder;

  // EXTERNAL FLOWS (from restaurant)
  if (hasRestaurantContext) {
    if (hasOrder && !hasLocalStorageAccount && !accountName) {
      return 'guest_checkout'; // Flow 3
    }
    if (!hasOrder && !hasLocalStorageAccount && accountName) {
      return 'create_account_only'; // Flow 4
    }
    if (hasOrder && !hasLocalStorageAccount && accountName) {
      return 'create_account_and_pay'; // Flow 5
    }
    if (hasOrder && hasLocalStorageAccount) {
      return accountBalance >= parseFloat(orderAmount)
        ? 'pay_with_account'      // Flow 6
        : 'pay_with_topup';       // Flow 7
    }
  }

  // INTERNAL FLOWS (wallet.innopay.lu)
  return hasLocalStorageAccount ? 'topup' : 'new_account';
}
```

#### Flow Context Interface

Each request builds a `FlowContext` object containing:

```typescript
interface FlowContext {
  hasLocalStorageAccount: boolean;  // Does user have account in browser?
  accountName?: string;              // Account name if exists
  table?: string | null;             // Restaurant table number
  orderAmount?: string | null;       // Order amount in EUR
  orderMemo?: string | null;         // Memo for Hive transfer
  topupAmount?: string | null;       // Top-up amount
  accountBalance?: number;           // Current EURO balance
}
```

#### Flow Metadata Interface

Each flow has associated metadata:

```typescript
interface FlowMetadata {
  flow: Flow;
  category: 'internal' | 'external';
  requiresRedirect: boolean;
  redirectTarget?: 'restaurant' | 'innopay';
  description: string;
}
```

#### Integration Points

**1. Entry Points (Client-side)**

**`innopay/app/page.tsx`** (Landing/Top-up page)
- Builds flow context with `hasLocalStorageAccount` and `accountBalance`
- Passes to checkout API

**`innopay/app/user/page.tsx`** (Account creation page)
- Checks for existing account in localStorage
- If existing account found, blocks new account creation
- Sets `hasLocalStorageAccount = false` when creating new account
- Includes `redirectParams` if coming from restaurant

**2. Checkout API** (`innopay/app/api/checkout/account/route.ts`)

1. Receives flow context from client
2. Calls `detectFlow(context)` to determine flow
3. Stores `flow` and `flowCategory` in Stripe metadata
4. Uses flow metadata to build success/cancel URLs
5. Creates Stripe checkout session

**3. Webhook Handler** (`innopay/app/api/webhooks/route.ts`)

1. Reads `flow` from Stripe session metadata
2. Routes to appropriate handler based on flow type
3. Logs flow metadata for debugging
4. Processes payment according to flow requirements

---

### Flow Debugging

#### Enable Flow Logging

Flow detection is automatically logged at each stage:

1. **Checkout API**: Logs detected flow and context
2. **Webhook**: Logs flow metadata and routing decision
3. **Spoke**: Logs URL params and credential fetch

**Example logs**:
```
[CHECKOUT API] Flow Detection: pay_with_topup
[CHECKOUT API] Using custom returnUrl for Flow 7
[WEBHOOK] Detected flow: pay_with_topup
[FLOW 7] Unified approach: topup=20€, order=30€
[FLOW 7] ✅ HBD transferred to restaurant: {txId}
[SPOKE] order_success: true, sessionId: {id}
```

#### Common Issues

**Issue**: Flow detected as `new_account` but should be `create_account_and_pay`

**Cause**: Missing `redirectParams` in request body

**Fix**: Ensure client passes `redirectParams.orderAmount` when coming from restaurant

---

**Issue**: Redirect goes to wrong domain

**Cause**: Flow category incorrect or hardcoded URLs

**Fix**: Verify flow metadata is correct and redirect URLs are built from spoke data

---

**Issue**: Webhook handler doesn't recognize flow

**Cause**: Stripe metadata not updated after flow system implementation

**Fix**: Check Stripe session metadata includes `flow` and `flowCategory` fields

---

**Issue**: Flow 4 Variant B (credential import) not working

**Cause**: Missing `credential_token` or `flow=4` URL params

**Fix**: Verify hub spoke card handler creates credential session and includes params in redirect URL

---

## TECHNICAL CONVENTIONS

### Database Schema

#### Required Tables

**transfers** (core order tracking):
```sql
CREATE TABLE transfers (
  id VARCHAR PRIMARY KEY,              -- HAF operation ID
  from_account VARCHAR NOT NULL,       -- Customer Hive account
  to_account VARCHAR NOT NULL,         -- Merchant Hive account
  amount VARCHAR NOT NULL,             -- Transfer amount
  symbol VARCHAR NOT NULL,             -- 'HBD' | 'EURO' | 'OCLT'
  memo TEXT NOT NULL,                  -- Raw memo from blockchain
  parsed_memo TEXT,                    -- Dehydrated order data
  received_at TIMESTAMP NOT NULL,      -- Blockchain timestamp
  fulfilled BOOLEAN DEFAULT false,     -- Order completion status
  fulfilled_at TIMESTAMP,              -- NULL = pending
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_transfers_unfulfilled ON transfers(received_at DESC) WHERE fulfilled = false;
CREATE INDEX idx_transfers_to_account ON transfers(to_account);
```

**dishes** (menu items):
```sql
CREATE TABLE dishes (
  dish_id INTEGER PRIMARY KEY,
  name_fr TEXT NOT NULL,
  name_en TEXT,
  price DECIMAL NOT NULL,
  category_id INTEGER REFERENCES categories(category_id),
  -- ... other fields as needed
);
```

**drinks** (beverages):
```sql
CREATE TABLE drinks (
  drink_id INTEGER PRIMARY KEY,
  name_fr TEXT NOT NULL,
  name_en TEXT,
  price DECIMAL NOT NULL,
  category_id INTEGER REFERENCES categories(category_id),
  -- ... other fields as needed
);
```

**categories**:
```sql
CREATE TABLE categories (
  category_id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('dishes', 'drinks')),
  name_fr TEXT NOT NULL,
  name_en TEXT
);
```

#### Naming Convention

**CRITICAL**: Use `snake_case` for ALL database table and column names, NOT `camelCase`.

**Rationale**:
- PostgreSQL is case-insensitive and normalizes to lowercase
- `snake_case` is the SQL standard
- Avoids quoting issues in raw SQL queries
- Consistent with PostgreSQL ecosystem

**TypeScript/JavaScript Code**:
- Prisma Client automatically converts to camelCase in TypeScript
- Use generated camelCase names in application code
- Only use snake_case in raw SQL queries

### Memo Format (Dehydration/Hydration)

#### Structure

Memo consists of **three semantic units**:

1. **Order Content** (required): Items ordered using `d:` and `b:` codes
2. **Table Information** (optional): `TABLE N`
3. **Distriate Suffix** (required): Contains `-inno-` substring for tracking

#### Format Specification

```
d:X,q:Y;b:Z,s:SIZE TABLE N suffix
```

#### Codes

| Code | Meaning | Example |
|------|---------|---------|
| `d:X` | Dish with ID X | `d:1` = dish_id 1 |
| `b:X` | Beverage/Drink with ID X | `b:3` = drink_id 3 |
| `q:Y` | Quantity Y (only if > 1) | `q:2` = 2 items |
| `s:SIZE` | Size/option | `s:50cl` = 50cl |
| `TABLE N` | Table number | `TABLE 5` |

#### Rules

1. **ALL dishes use `d:`** regardless of category
2. **ALL drinks use `b:`** regardless of category
3. Category info NOT in memo (retrieved via DB joins)
4. Items separated by `;`
5. Options within item separated by `,`
6. Quantity only if > 1
7. Table info after items, space-separated

#### Example

```
d:1,q:2;d:3;b:5,s:50cl TABLE 7 kcs-inno-abcd-1234
```

Means:
- 2× dish #1
- 1× dish #3
- 1× drink #5 (50cl)
- Table 7
- Distriate suffix: `kcs-inno-abcd-1234`

#### ⚠️ CRITICAL Detection Caveat

Orders are detected by the presence of `-inno-` in the distriate suffix. If an order memo is missing this suffix (due to a bug), **the order will NOT be detected**. Always ensure the distriate suffix is appended!

### Distriate Suffix Conventions

#### Format
```
{tag}-inno-{random4}-{random4}
```

#### Tags by Flow

| Flow | Tag | Reason |
|------|-----|--------|
| Flow 3 (Guest) | `gst` | Internal invoice only, no blockchain account |
| Flow 4 (Create Account) | `kcs` | Eligible for Distriator cashback |
| Flow 5 (Create + Pay) | `kcs` | Eligible for Distriator cashback |
| Flow 6 (Pay with Account) | `kcs` | Eligible for Distriator cashback |
| Flow 7 (Topup + Pay) | `kcs` | Eligible for Distriator cashback |
| Call Waiter | `cqb` | Restaurant-specific tracking |

**Why Different Tags?**
- `gst`: Guest checkout has no blockchain account, suffix is for internal invoicing only
- `kcs`: All flows with blockchain accounts are Distriator cashback eligible

### Environment Configuration

#### Centralized Detection

Environment detection is **centralized** in `src/lib/environment.ts` (Vite) or `lib/environment.ts` (Next.js).

**EnvironmentConfig Interface**:
```typescript
interface EnvironmentConfig {
  environment: 'PROD' | 'DEV';
  toAccount: string;        // Merchant's Hive account
  innopayUrl: string;       // Wallet URL
}
```

| Attribute | DEV Value | PROD Value |
|-----------|-----------|------------|
| `environment` | `'DEV'` | `'PROD'` |
| `toAccount` | `'{restaurant}-test'` | `'{restaurant}.{tld}'` |
| `innopayUrl` | `http://192.168.178.55:3000` | `https://wallet.innopay.lu` |

#### Detection Logic

```typescript
function isPrivateNetwork(): boolean {
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.includes('vercel.app')  // Preview deployments
  );
}

const isProd = window.location.hostname === '{restaurant}.innopay.lu';
```

#### Usage

**React Components (hook)**:
```typescript
import { useEnvironmentConfig } from '@/lib/environment';

function MyComponent() {
  const { environment, toAccount, innopayUrl } = useEnvironmentConfig();
  // Filter data, display badges, etc.
}
```

**Non-React Code**:
```typescript
import { getEnvironmentConfig } from '@/lib/environment';

const config = getEnvironmentConfig();
console.log(config.toAccount);
```

### Merchant-Hub Integration

#### Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  CO Page    │ ──── │ merchant-hub │ ──── │   Redis     │
│  (spoke)    │      │    (hub)     │      │  Streams    │
└─────────────┘      └──────────────┘      └─────────────┘
      │                     │                     │
      │  1. POST /api/wake-up                     │
      │ ─────────────────── │                     │
      │                     │                     │
      │  2. GET /api/poll (if poller)            │
      │ ─────────────────── │  HAF query         │
      │                     │ ──────────────────  │
      │                     │  XADD transfers    │
      │                     │ ─────────────────── │
      │                     │                     │
      │  3. GET /api/transfers/consume           │
      │ ─────────────────── │  XREADGROUP        │
      │                     │ ─────────────────── │
      │                     │                     │
      │  4. POST /api/transfers/ack              │
      │ ─────────────────── │  XACK              │
      │                     │ ─────────────────── │
```

#### API Endpoints

| Endpoint | Method | Purpose | Params |
|----------|--------|---------|--------|
| `/api/wake-up` | POST | Register shop, elect poller | `{ shopId }` |
| `/api/poll` | GET | Trigger HAF blockchain query | (none) |
| `/api/transfers/consume` | GET | Get pending transfers | `restaurantId`, `consumerId`, `count` |
| `/api/transfers/ack` | POST | Acknowledge processed transfers | `{ restaurantId, messageIds }` |

#### Merchant-Hub URL

**Single static URL** for both DEV and PROD:
```typescript
export const MERCHANT_HUB_URL = 'https://merchant-hub.innopay.lu';
// Alias: https://merchant-hub-theta.vercel.app
```

#### Polling Intervals

- **Poll interval**: 6 seconds (HAF query, if elected poller)
- **Sync interval**: 6 seconds (consume from Redis, all pages)

#### Consumer ID Convention

**CRITICAL**: Consumer IDs MUST be **stable across page refreshes** to receive pending messages.

```typescript
function getStableConsumerId(): string {
  const storageKey = '{restaurant}_co_consumer_id';
  let consumerId = localStorage.getItem(storageKey);
  if (!consumerId) {
    consumerId = `{restaurant}-co-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, consumerId);
  }
  return consumerId;
}
```

### localStorage Keys

All Innopay-related localStorage keys use `innopay_` prefix:

| Key | Purpose |
|-----|---------|
| `innopay_accountName` | User's Hive account name |
| `innopay_masterPassword` | Master password |
| `innopay_activePrivate` | Active private key |
| `innopay_postingPrivate` | Posting private key |
| `innopay_table` | Current table number (from QR code) |
| `{restaurant}_co_consumer_id` | Stable consumer ID for CO page |

---

## BUNDLE COMPONENTS

### Component Inventory

```
spoke-bundle/
├── components/
│   ├── Draggable.tsx              # Base draggable UI (139 lines)
│   ├── MiniWallet.tsx             # Wallet display, extends Draggable (130 lines)
│   └── BottomBanner.tsx           # Contact/legal footer (95 lines)
│
├── state/
│   ├── paymentStateMachine.ts     # State machine types + reducer
│   └── paymentActions.ts          # Action creators + side effects
│
├── hooks/
│   ├── usePaymentFlow.ts          # Main orchestration hook
│   ├── useBalance.ts              # React Query balance fetching (100 lines)
│   └── useInnopayCart.ts          # Cart adapter for innopay (~50 lines)
│
├── lib/
│   ├── utils.ts                   # Core utilities (dehydrateMemo, etc.)
│   ├── hive.ts                    # Hive blockchain operations
│   └── config.ts                  # Environment-aware URL resolution
│
├── context/
│   └── CartContext.tsx            # Reference implementation (301 lines)
│
├── database/
│   ├── prisma-schema.prisma       # For Next.js spokes
│   └── supabase-migration.sql     # For Lovable/Supabase spokes
│
├── admin/
│   ├── CurrentOrdersPage.tsx      # Template for admin page
│   └── supabase-sync.ts           # Client-side sync logic for Supabase
│
└── i18n/
    ├── I18nProvider.tsx            # Internationalization context
    ├── translations/
    │   ├── common.ts               # Shared translations
    │   └── innopay.ts              # Innopay-specific translations
    └── hooks/
        └── useI18n.ts              # Translation hook
```

### Core UI Components

#### 1. Draggable.tsx

**Purpose**: Base draggable container for floating UI elements

**Features**:
- Touch and mouse drag support
- Viewport constraints
- Position persistence to localStorage
- Framework-agnostic (pure React)

**Reusability**: 100% - Direct copy

**Lines**: 139

**Dependencies**: React only

#### 2. MiniWallet.tsx

**Purpose**: Floating wallet display showing balance and account info

**Features**:
- Extends Draggable
- Balance display (HBD + EURO)
- Account name display
- Minimize/restore functionality
- Reopen button when minimized

**Reusability**: 100% - Direct copy

**Lines**: 130

**Dependencies**: Draggable, useBalance hook

#### 3. BottomBanner.tsx

**Purpose**: Expandable footer with contact and legal links

**Features**:
- Contact information display
- Legal links (terms, privacy)
- Expandable/collapsible
- Framework-agnostic

**Reusability**: 100% - Direct copy

**Lines**: 95

**Dependencies**: React only

### State Management

#### Payment State Machine

**File**: `state/paymentStateMachine.ts`

**State Types**:
```typescript
export type PaymentState =
  | { status: 'idle' }
  | { status: 'selecting_flow'; cartTotal: number; hasAccount: boolean }
  | { status: 'redirecting'; flow: FlowType; returnUrl: string }
  | { status: 'processing'; flow: FlowType; sessionId?: string; message?: string }
  | { status: 'success'; flow: FlowType; orderId?: string; message: string }
  | { status: 'error'; flow: FlowType; error: string; canRetry: boolean }
  | { status: 'account_created'; credentials: Credentials; flow: FlowType }
  | { status: 'waiter_called'; table: string };
```

**Event Types**:
```typescript
export type PaymentEvent =
  | { type: 'OPEN_FLOW_SELECTOR'; cartTotal: number; hasAccount: boolean }
  | { type: 'SELECT_FLOW'; flow: FlowType }
  | { type: 'START_REDIRECT'; returnUrl: string }
  | { type: 'RETURN_FROM_HUB'; params: URLSearchParams }
  | { type: 'PROCESSING_UPDATE'; message: string }
  | { type: 'PAYMENT_SUCCESS'; orderId?: string; message: string }
  | { type: 'ACCOUNT_CREATED'; credentials: Credentials }
  | { type: 'WAITER_CALLED'; table: string }
  | { type: 'ERROR'; error: string; canRetry?: boolean }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'DISMISS_BANNER' };
```

**Reducer Function**:
```typescript
export function paymentReducer(state: PaymentState, event: PaymentEvent): PaymentState {
  console.log('[PaymentStateMachine]', state.status, '→', event.type);

  // State transition logic
  // See full implementation in SPOKE-INTEGRATION-PLAN-REVISED.md lines 288-377
}
```

**Benefits**:
- Single source of truth for UI state
- Impossible states eliminated
- Every transition logged for debugging
- Pure function - easy to unit test
- Works identically in Next.js and Vite

### React Hooks

#### usePaymentFlow

**Purpose**: Main orchestration hook for payment flows

**Features**:
- State machine management
- URL param detection (return from hub)
- Flow routing and redirect
- Credential storage
- Cart clearing on success

**Usage**:
```typescript
const { state, ui, actions, hasAccount } = usePaymentFlow({
  cartTotal,
  cartMemo,
  table,
  hubUrl,
  restaurantId,
  hiveAccount,
  onCartClear,
  onCredentialsReceived,
});
```

**Returns**:
- `state`: Current state machine state
- `ui`: Derived UI flags (showFlowSelector, showBanners, etc.)
- `actions`: Action creators (openFlowSelector, selectFlow, etc.)
- `hasAccount`: Boolean flag for account existence

#### useBalance

**Purpose**: React Query hook for fetching Hive-Engine balances

**Features**:
- Automatic balance fetching
- Smart caching (7-day stale time, 30-day cache time)
- Background refetching
- Error handling
- Source tracking (cache vs fresh)

**Usage**:
```typescript
const { balance, isLoading, error, source } = useBalance(accountName);
```

**Reusability**: 100% - Works in any React environment

#### useInnopayCart

**Purpose**: Adapter hook to add innopay functionality to existing cart

**Why Needed**: Different spokes have different cart implementations. This adapter wraps the existing cart to add innopay-specific features without breaking changes.

**Features**:
- Table number tracking
- Memo generation for blockchain
- EUR price formatting
- Wraps existing cart hook via composition

**Usage**:
```typescript
// Wrap existing cart
const existingCart = useCart(); // Spoke's own cart
const innopayCart = useInnopayCart(existingCart);

// Now has additional methods
innopayCart.table;
innopayCart.setTable('5');
innopayCart.getMemo(); // "d:1,q:2;b:3 TABLE 5 kcs-inno-..."
innopayCart.getTotalEurPrice(); // "25.00"
```

**Integration Effort**: ~2 hours per spoke

### Utility Functions

**File**: `lib/utils.ts`

| Function | Purpose |
|----------|---------|
| `dehydrateMemo()` | Convert cart items to compact memo format |
| `hydrateMemo()` | Parse memo back into order lines |
| `getTable()` | Extract table number from memo |
| `createEuroTransferOperation()` | Build Hive-Engine transfer operation |
| `signAndBroadcastOperation()` | Sign and broadcast to blockchain |
| `generateDistriateHiveOp()` | Generate Hive operation with distriate suffix |

**Reusability**: 100% - Pure TypeScript functions

### Database Schemas

#### Prisma Schema (Next.js)

**File**: `database/prisma-schema.prisma`

```prisma
model transfers {
  id            String    @id
  from_account  String
  to_account    String
  amount        String
  symbol        String
  memo          String    @db.Text
  parsed_memo   String?   @db.Text
  received_at   DateTime
  fulfilled     Boolean   @default(false)
  fulfilled_at  DateTime?
  created_at    DateTime  @default(now())

  @@index([received_at(sort: Desc)], map: "idx_transfers_received_at")
  @@index([to_account], map: "idx_transfers_to_account")
}
```

#### Supabase Migration (Vite)

**File**: `database/supabase-migration.sql`

```sql
-- Create transfers table
CREATE TABLE IF NOT EXISTS transfers (
  id VARCHAR PRIMARY KEY,
  from_account VARCHAR NOT NULL,
  to_account VARCHAR NOT NULL,
  amount VARCHAR NOT NULL,
  symbol VARCHAR NOT NULL CHECK (symbol IN ('HBD', 'EURO', 'OCLT')),
  memo TEXT NOT NULL,
  parsed_memo TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  fulfilled BOOLEAN DEFAULT false,
  fulfilled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transfers_unfulfilled
  ON transfers(received_at DESC)
  WHERE fulfilled = false;

CREATE INDEX IF NOT EXISTS idx_transfers_to_account
  ON transfers(to_account);

-- RLS policies
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on transfers" ON transfers
  FOR ALL USING (true) WITH CHECK (true);
```

### Internationalization (i18n)

#### Structure

```
i18n/
├── I18nProvider.tsx          # Context provider
├── translations/
│   ├── common.ts              # Shared translations
│   └── innopay.ts             # Innopay-specific
└── hooks/
    └── useI18n.ts             # Translation hook
```

#### Innopay Translations

**File**: `i18n/translations/innopay.ts`

```typescript
export const innopayTranslations = {
  fr: {
    'wallet.title': 'Votre portefeuille Innopay',
    'wallet.balance': 'Solde',
    'payment.guestCheckout': 'Commandez sans compte',
    'payment.createAccount': 'Créer un compte',
    'payment.payWithAccount': 'Payer avec Innopay',
    'banner.paymentSuccess': 'Paiement réussi!',
    'action.callWaiter': 'Appeler un serveur',
  },
  en: {
    'wallet.title': 'Your Innopay Wallet',
    'wallet.balance': 'Balance',
    'payment.guestCheckout': 'Order as guest',
    'payment.createAccount': 'Create account',
    'payment.payWithAccount': 'Pay with Innopay',
    'banner.paymentSuccess': 'Payment successful!',
    'action.callWaiter': 'Call a waiter',
  },
  de: {
    'wallet.title': 'Ihre Innopay-Geldbörse',
    'wallet.balance': 'Guthaben',
    'payment.guestCheckout': 'Als Gast bestellen',
    'payment.createAccount': 'Konto erstellen',
    'payment.payWithAccount': 'Mit Innopay bezahlen',
    'banner.paymentSuccess': 'Zahlung erfolgreich!',
    'action.callWaiter': 'Kellner rufen',
  },
};
```

**Source**: Extracted from croque-bedaine (proven implementation)

**Usage**:
```typescript
import { useI18n } from '@/i18n/hooks/useI18n';

function MyComponent() {
  const { t } = useI18n();
  return <button>{t('payment.payWithAccount')}</button>;
}
```

---

## IMPLEMENTATION GUIDE

### Quick Start Decision Tree

```
Are you using Next.js?
  ├─ YES → Use Next.js Integration Path (copy from indiesmenu)
  │         Effort: 1-2 days
  │
  └─ NO → Are you using Vite/React?
      ├─ YES → Are you using Supabase?
      │   ├─ YES → Use Vite + Supabase Path (copy from croque-bedaine)
      │   │         Effort: 2-3 days
      │   │
      │   └─ NO → Use Vite + Custom Backend Path
      │             Effort: 3-5 days
      │
      └─ NO → Unsupported framework
                Consider migrating to Next.js or Vite
```

### Prerequisites Checklist

Before starting integration:

- [ ] Restaurant has Hive blockchain account (PROD and DEV)
- [ ] Restaurant ID decided (e.g., `croque-bedaine`)
- [ ] Menu data in database (dishes, drinks, categories tables)
- [ ] Database accessible (Prisma or Supabase)
- [ ] QR codes prepared with table numbers (`?table=X`)
- [ ] Vercel account for deployment
- [ ] Admin access credentials decided

### Phase-by-Phase Implementation

#### Phase 1: Setup & UI Components (Day 1)

**Tasks**:

1. **Create innopay folder structure**:
   ```
   {spoke}/src/  (or app/)
   ├── lib/innopay/
   │   ├── config.ts
   │   ├── utils.ts
   │   └── hive.ts
   ├── state/innopay/
   │   └── paymentStateMachine.ts
   ├── hooks/innopay/
   │   ├── usePaymentFlow.ts
   │   ├── useInnopayCart.ts
   │   └── useBalance.ts
   └── components/innopay/
       ├── Draggable.tsx
       ├── MiniWallet.tsx
       └── BottomBanner.tsx
   ```

2. **Copy UI components**:
   - Copy from reference spoke (indiesmenu or croque-bedaine)
   - Adjust styling to match spoke's design system
   - Test components in isolation

3. **Copy utility functions**:
   - `dehydrateMemo`, `hydrateMemo`
   - `generateHiveTransferUrl`, `generateDistriatedHiveOp`
   - `createEuroTransferOperation`

4. **Configure environment**:
   - Add environment variables
   - Set up environment detection
   - Test URL resolution

**Deliverables**:
- [ ] UI components rendering without errors
- [ ] Dragging works on desktop and mobile
- [ ] Environment variables configured

**Time**: ~4-6 hours

---

#### Phase 2: State Machine & Payment Flows (Day 2)

**Tasks**:

1. **Implement state machine**:
   - Create `paymentStateMachine.ts`
   - Copy reducer and types
   - Write unit tests for transitions

2. **Implement usePaymentFlow hook**:
   - Integrate with existing cart
   - Handle URL param returns from hub
   - Implement flow selection logic

3. **Create useInnopayCart adapter**:
   - Wrap spoke's existing cart
   - Add table tracking
   - Add memo generation

4. **Integrate into cart/checkout page**:
   - Add flow selector UI
   - Add status banners (yellow, grey, green)
   - Wire up "Order Now" and "Call Waiter" buttons

**Deliverables**:
- [ ] State machine unit tests passing
- [ ] Flow selector appears when clicking "Order Now"
- [ ] Redirect to hub works for Flows 3, 4, 5, 7
- [ ] Return from hub updates UI correctly

**Time**: ~8 hours

---

#### Phase 3: Balance & MiniWallet (Day 2-3)

**Tasks**:

1. **Implement useBalance hook**:
   - Copy from reference spoke
   - Configure React Query caching
   - Test balance fetching

2. **Integrate MiniWallet**:
   - Show after account creation (Flow 4, 5)
   - Display balance
   - Implement minimize/restore

3. **Implement Flow 6 (Pay with Account)**:
   - Check balance sufficiency
   - Execute dual-currency transfer
   - Handle success/error states

4. **Implement account import**:
   - UI for importing existing account
   - Validate credentials
   - Store in localStorage

**Deliverables**:
- [ ] MiniWallet appears after account creation
- [ ] Balance displays correctly
- [ ] Flow 6 payment works end-to-end
- [ ] Account import works

**Time**: ~6 hours

---

#### Phase 4: Database & Admin Page (Day 3-4)

**Tasks**:

1. **Create/verify transfers table**:
   - Run migration (Prisma or Supabase)
   - Verify indexes created
   - Test RLS policies (Supabase)

2. **Implement backend sync**:
   - **Next.js**: Copy API routes from indiesmenu
   - **Vite/Supabase**: Implement client-side sync class

3. **Create admin Current Orders page**:
   - Add route (`/admin/current_orders`)
   - Implement merchant-hub integration:
     - Wake-up call on mount
     - Poll trigger (if elected poller)
     - Sync from Redis stream (every 6s)
   - Display unfulfilled orders
   - Implement fulfill workflow

4. **Test sync flow**:
   - Place test order
   - Verify transfer appears in admin page
   - Verify fulfill button works

**Deliverables**:
- [ ] Transfers table exists
- [ ] Admin page displays unfulfilled transfers
- [ ] Sync from merchant-hub works
- [ ] Fulfill updates database
- [ ] Poller election works

**Time**: ~10-12 hours

---

#### Phase 5: i18n Integration (Day 4-5)

**Tasks**:

1. **Copy i18n system** (if spoke doesn't have one):
   - Copy I18nProvider from croque-bedaine
   - Copy translation files
   - Add innopay translations

2. **Integrate into app**:
   - Wrap app in I18nProvider
   - Replace hardcoded strings with `t()` calls
   - Test in all supported languages

**Deliverables**:
- [ ] All innopay UI text is translatable
- [ ] Language switching works
- [ ] All languages tested

**Time**: ~4 hours (if spoke already has i18n), ~8 hours (if starting from scratch)

---

#### Phase 6: Testing & Polish (Day 5)

**Tasks**:

1. **End-to-end testing**:
   - Test all flows (3, 4, 5, 6, 7)
   - Test on mobile (iOS Safari, Android Chrome)
   - Test error scenarios

2. **UI polish**:
   - Match spoke's design language
   - Ensure smooth animations
   - Test dark mode (if applicable)

3. **Documentation**:
   - Update spoke README
   - Document environment variables
   - Create testing checklist

**Deliverables**:
- [ ] All flows tested and working
- [ ] Mobile UX smooth
- [ ] Documentation updated

**Time**: ~6 hours

---

### Total Effort Estimate

| Framework | Effort | Notes |
|-----------|--------|-------|
| **Next.js** (copy from indiesmenu) | 1-2 days | Direct copy, mostly styling adjustments |
| **Vite + Supabase** (copy from croque-bedaine) | 2-3 days | Client-side sync, DB setup |
| **Custom stack** | 3-5 days | More adaptation needed |

---

## FRAMEWORK-SPECIFIC INTEGRATION

### Next.js + Prisma Spokes

**Reference**: indiesmenu

**Stack**:
- Next.js 15 (App Router)
- Prisma + Vercel Postgres
- React Query
- Tailwind CSS

#### File Copy Checklist

**Frontend** (`app/` directory):
- [ ] Copy `components/ui/Draggable.tsx`
- [ ] Copy `components/ui/MiniWallet.tsx`
- [ ] Copy `components/ui/BottomBanner.tsx`
- [ ] Copy `hooks/useBalance.ts`
- [ ] Copy `lib/utils.ts` (innopay functions)
- [ ] Copy `lib/hive.ts`

**Backend** (`app/api/` directory):
- [ ] Copy `app/api/transfers/unfulfilled/route.ts`
- [ ] Copy `app/api/transfers/sync-from-merchant-hub/route.ts`
- [ ] Copy `app/api/fulfill/route.ts`
- [ ] Copy `app/api/balance/euro/route.ts`

**Database**:
- [ ] Copy transfers model from `prisma/schema.prisma`
- [ ] Run migration: `npx prisma migrate dev`

**Admin Page**:
- [ ] Copy `app/admin/current_orders/page.tsx`
- [ ] Adjust menu data hydration logic

#### Environment Variables

```bash
# .env.local

# Innopay Hub
NEXT_PUBLIC_HUB_URL=https://wallet.innopay.lu

# Merchant Hub
NEXT_PUBLIC_MERCHANT_HUB_URL=https://merchant-hub.innopay.lu

# Restaurant Identity
NEXT_PUBLIC_HIVE_ACCOUNT={restaurant}.{tld}
NEXT_PUBLIC_RESTAURANT_ID={restaurant}

# Database
DATABASE_URL=postgresql://...
POSTGRES_URL=postgresql://...

# Development only
RECIPIENT_OVERRIDE={restaurant}-test  # Remove in production!
```

#### Integration Effort

**Time**: 1-2 days

**Difficulty**: Low - 90% copy-paste

---

### Vite + Supabase Spokes

**Reference**: croque-bedaine

**Stack**:
- Vite 5 + React
- Supabase (PostgreSQL + Edge Functions optional)
- React Query
- Tailwind CSS + shadcn/ui

#### File Copy Checklist

**Frontend** (`src/` directory):
- [ ] Copy `src/components/innopay/Draggable.tsx`
- [ ] Copy `src/components/innopay/MiniWallet.tsx`
- [ ] Copy `src/components/innopay/BottomBanner.tsx`
- [ ] Copy `src/hooks/innopay/useBalance.ts`
- [ ] Copy `src/hooks/innopay/usePaymentFlow.ts`
- [ ] Copy `src/hooks/innopay/useInnopayCart.ts`
- [ ] Copy `src/lib/innopay/utils.ts`
- [ ] Copy `src/lib/innopay/hive.ts`
- [ ] Copy `src/lib/environment.ts`

**Backend** (Client-side or Supabase):
- [ ] Copy `src/lib/innopay/supabase-sync.ts` (if using client-side sync)
- OR Copy Supabase Edge Functions (if using server-side)

**Database**:
- [ ] Run Supabase migration SQL
- [ ] Verify RLS policies

**Admin Page**:
- [ ] Copy `src/pages/admin/CurrentOrders.tsx`
- [ ] Add React Router route
- [ ] Implement merchant-hub integration

**i18n** (already in croque-bedaine):
- [ ] Verify innopay translations exist
- [ ] Add any missing keys

#### Environment Variables

```bash
# .env.local

# Innopay Hub
VITE_HUB_URL=https://wallet.innopay.lu

# Merchant Hub
VITE_MERCHANT_HUB_URL=https://merchant-hub.innopay.lu

# Restaurant Identity
VITE_HIVE_ACCOUNT={restaurant}.{tld}
VITE_RESTAURANT_ID={restaurant}

# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Development only
VITE_RECIPIENT_OVERRIDE={restaurant}-test  # Remove in production!
```

#### Cart Integration Strategy

**Challenge**: Different spokes have different cart implementations.

**Solution**: Use `useInnopayCart` adapter pattern.

**Example**:
```typescript
// src/hooks/innopay/useInnopayCart.ts
import { useCart } from '../useCart'; // Spoke's existing cart

export function useInnopayCart() {
  const cart = useCart(); // Reuse existing cart

  // Add table tracking
  const [table, setTable] = useState(() => {
    return localStorage.getItem('innopay_table') || '';
  });

  useEffect(() => {
    localStorage.setItem('innopay_table', table);
  }, [table]);

  // Add memo generation
  const getMemo = () => {
    const items = cart.items.map(({ item, quantity, selectedOption }) => {
      // Convert to dehydrated format
    }).join(';');
    return `${items} TABLE ${table}`;
  };

  // Return extended cart
  return {
    ...cart,
    table,
    setTable,
    getMemo,
    getTotalEurPrice: () => cart.totalPrice.toFixed(2),
  };
}
```

**Effort**: ~2 hours

#### Integration Effort

**Time**: 2-3 days

**Difficulty**: Medium - Client-side sync, cart adaptation

---

## TESTING STRATEGY

### Level 1: Unit Tests (No Blockchain)

**What to test**:
- State machine transitions (paymentReducer)
- Memo generation/parsing (dehydrateMemo, hydrateMemo)
- Price calculations
- URL building functions

**Setup**:
```bash
# Vite
npm install -D vitest @testing-library/react @testing-library/jest-dom

# Next.js
npm install -D jest @testing-library/react @testing-library/jest-dom
```

**Example**:
```typescript
// state/innopay/__tests__/paymentStateMachine.test.ts
import { describe, it, expect } from 'vitest';
import { paymentReducer, initialPaymentState } from '../paymentStateMachine';

describe('paymentReducer', () => {
  it('should start in idle state', () => {
    expect(initialPaymentState.status).toBe('idle');
  });

  it('should transition from idle to selecting_flow', () => {
    const state = paymentReducer(
      initialPaymentState,
      { type: 'OPEN_FLOW_SELECTOR', cartTotal: 50, hasAccount: false }
    );
    expect(state.status).toBe('selecting_flow');
  });
});
```

### Level 2: Integration Tests (Mocked APIs)

**What to test**:
- usePaymentFlow hook behavior
- API call sequences
- UI state derivation

**Setup**:
```bash
npm install -D msw
```

**Example**:
```typescript
import { renderHook, act } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { usePaymentFlow } from '../usePaymentFlow';

const server = setupServer(
  rest.post('https://wallet.innopay.lu/api/account/credentials', (req, res, ctx) => {
    return res(ctx.json({ credentials: { /* ... */ } }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('usePaymentFlow', () => {
  it('should start in idle state', () => {
    const { result } = renderHook(() => usePaymentFlow({ /* options */ }));
    expect(result.current.state.status).toBe('idle');
  });
});
```

### Level 3: Staging Environment

**Configuration**:
```bash
# .env.staging
VITE_HUB_URL=https://staging.wallet.innopay.lu
VITE_MERCHANT_HUB_URL=https://merchant-hub.innopay.lu
VITE_HIVE_ACCOUNT={restaurant}-test
```

**Test Checklist**:
- [ ] Flow 3: Guest checkout with Stripe test card
- [ ] Flow 4: Create account only (Variant A and B)
- [ ] Flow 5: Create account + pay
- [ ] Flow 6: Pay with existing account
- [ ] Flow 7: Top-up + pay
- [ ] Flow 8: Import account
- [ ] Admin page: Orders appear
- [ ] Admin page: Fulfill works
- [ ] Mobile: iOS Safari
- [ ] Mobile: Android Chrome

#### Flow-Specific Testing Procedures

##### Test: Flow 3 - Guest Checkout

**Steps**:
1. Clear localStorage
2. Visit `{spoke}.innopay.lu/`
3. Place order (e.g., 25€)
4. Select "Pay as Guest"
5. Complete Stripe checkout
6. Verify redirect back to `{spoke}.innopay.lu/?table={TABLE}&topup_success=true`
7. Check Hive transfer to restaurant

**Expected logs**:
```
[CHECKOUT API] Flow Detection: guest_checkout
[WEBHOOK] Detected flow: guest_checkout
[WEBHOOK] Flow category: external
[WEBHOOK] Requires redirect: true → restaurant
```

---

##### Test: Flow 4 - Create Account Only

**Variant A (Create Account from Restaurant)**:

**Steps**:
1. Clear localStorage
2. Visit `{spoke}.innopay.lu/`
3. Click "Create Innopay Account" (no order)
4. Enter account name and amount
5. Complete checkout
6. Verify redirect back to `{spoke}.innopay.lu/?table={TABLE}&account_created=true&session_id={SESSION_ID}`
7. Verify credentials fetched and stored in localStorage
8. Verify mini-wallet displayed

**Expected logs**:
```
[CHECKOUT API] Flow Detection: create_account_only
[WEBHOOK] Detected flow: create_account_only
[WEBHOOK] Flow category: external
[SPOKE] Fetching credentials from innopay with session_id
[SPOKE] Credentials stored in localStorage
```

**Variant B (Import Credentials from Hub)**:

**Steps**:
1. Visit wallet.innopay.lu with existing account in localStorage
2. Click on restaurant spoke card
3. Verify redirect to `{spoke}.innopay.lu/?credential_token={TOKEN}&flow=4&account_created=true`
4. Verify credentials fetched and stored in localStorage
5. Verify MiniWallet appears immediately (no refresh)
6. Verify unified success banner shows "Votre portefeuille Innopay est prêt"

**Expected logs**:
```
[HUB] Creating credential session for account
[HUB] Redirecting to spoke with credential_token
[SPOKE] Detected flow=4 with credential_token
[SPOKE] Fetching credentials from innopay
[SPOKE] MiniWallet rendering with balance
```

---

##### Test: Flow 5 - Create Account and Pay

**Steps**:
1. Clear localStorage
2. Visit `{spoke}.innopay.lu/`
3. Place order (e.g., 30€)
4. Select "Create Account & Pay"
5. Enter account name and amount (e.g., 80€)
6. Complete checkout
7. Verify:
   - Account created
   - 30€ transferred to restaurant (HBD or EURO with debt recording)
   - 50€ in user's account
8. Verify redirect back to `{spoke}.innopay.lu/`

**Expected logs**:
```
[CHECKOUT API] Flow Detection: create_account_and_pay
[WEBHOOK] Detected flow: create_account_and_pay
[WEBHOOK] Flow category: external
[WEBHOOK] Processing restaurant order payment: 30€
[WEBHOOK] Account balance after order: 50€
```

---

##### Test: Flow 6 - Pay with Account

**Steps**:
1. Ensure account with balance >= order amount exists
2. Visit `{spoke}.innopay.lu/`
3. Place order within balance (e.g., 15€)
4. Select "Pay with Innopay"
5. Payment processed immediately (NO Stripe checkout)
6. Verify:
   - Customer → innopay EURO transfer
   - innopay → restaurant HBD/EURO transfer
   - Mini-wallet balance updated
7. Order confirmed on `{spoke}.innopay.lu/`

**Expected logs**:
```
[WALLET PAYMENT] Checking EURO balance for: {account}
[WALLET PAYMENT] Current EURO balance: {balance} Required: {amount}
[WALLET PAYMENT] Executing first leg: Customer → innopay
[WALLET PAYMENT] HBD transfer successful! TX: {txId}
[WALLET PAYMENT] EURO transfer successful! TX: {txId}
[WALLET PAYMENT] Executing second leg: innopay → restaurant
[WALLET PAYMENT] Payment complete!
```

---

##### Test: Flow 7 - Pay with Top-up

**Steps**:
1. Ensure account with balance < order amount exists in localStorage
2. Visit `{spoke}.innopay.lu/`
3. Place order larger than balance (e.g., balance: 10€, order: 30€)
4. Select "Pay with Innopay"
5. Redirected to Stripe checkout (topup amount = 30€ - 10€ = 20€ minimum)
6. Complete Stripe checkout
7. Verify redirect back to `{spoke}.innopay.lu/?order_success=true&session_id={ID}&table={TABLE}`
8. Verify on `{spoke}.innopay.lu/`:
   - Cart cleared ✓
   - Flow 7 success banner displayed ✓
   - Mini-wallet shows updated balance (0€ if exact match) ✓
   - No page reload ✓
9. Check Hive transfers:
   - Restaurant received 30€ (HBD or EURO with debt)
   - Customer received 0€ change (exact match scenario)
10. Verify debug log: `JSON.parse(localStorage.getItem('innopay_debug_last_params'))`

**Expected logs**:
```
[CHECKOUT API] Flow Detection: pay_with_topup
[CHECKOUT API] Using custom returnUrl for Flow 7
[WEBHOOK] Detected flow: pay_with_topup
[FLOW 7] Unified approach: topup=20€, order=30€
[FLOW 7] Step 1: Transferring 30€ to restaurant
[FLOW 7] ✅ HBD transferred to restaurant: {txId}
[FLOW 7] Step 2: Calculate change: 20€ - 30€ = -10€
[FLOW 7] Step 3: Negative change - transferring 10€ from {account} to innopay
[FLOW 7] ✅ Deficit EURO transferred from customer to innopay: {txId}
[FLOW 7] ✅ Flow 7 complete - redirect to: {url}
[SPOKE] order_success: true, sessionId: {id}
[SPOKE] Order paid successfully - cart cleared, balance updated, banner shown
```

---

##### Test: Flow 8 - Import Account

**Steps**:
1. Visit `{spoke}.innopay.lu/` without credentials
2. Click "Import Account"
3. Enter email address associated with existing account
4. System retrieves account credentials from database
5. Verify credentials stored in localStorage
6. Verify mini-wallet appears
7. User can now pay with account

**Expected logs**:
```
[IMPORT] Attempting to import account for email: {email}
[IMPORT] Account found: {accountName}
[IMPORT] Credentials stored in localStorage
[IMPORT] MiniWallet rendering with imported account
```

**Security Note**: Current implementation is naive. Limit to 5 attempts per session.

---

### Level 4: Production Smoke Tests

**Setup**:
```bash
npm install -D @playwright/test
```

**Smoke Test**:
```typescript
// e2e/smoke.test.ts
import { test, expect } from '@playwright/test';

test('menu page loads', async ({ page }) => {
  await page.goto('https://{restaurant}.innopay.lu/menu?table=1');
  await expect(page.locator('h1')).toContainText('Menu');
});

test('cart functions', async ({ page }) => {
  await page.goto('https://{restaurant}.innopay.lu/menu?table=1');
  await page.click('[data-testid="add-item-{item}"]');
  await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');
});

// DO NOT test real payments in production smoke tests
```

---

## PRODUCTION DEPLOYMENT

### Pre-Deployment Checklist

**Code**:
- [ ] All payment flows tested in staging
- [ ] Environment variables configured for production
- [ ] `RECIPIENT_OVERRIDE` removed from production env
- [ ] Error handling tested
- [ ] Mobile responsiveness verified

**Database**:
- [ ] `transfers` table created
- [ ] Indexes created
- [ ] RLS policies enabled (Supabase)
- [ ] Connection tested

**Merchant-Hub**:
- [ ] Restaurant ID registered
- [ ] PROD and DEV Hive accounts configured
- [ ] Redis streams tested

**Admin Access**:
- [ ] Admin page accessible
- [ ] Authentication configured
- [ ] Current Orders page tested

### Deployment Steps

#### Vercel Deployment (Next.js)

1. **Connect repository**:
   - Go to Vercel dashboard
   - Import project from GitHub
   - Select framework preset: Next.js

2. **Configure environment variables**:
   - Add all `NEXT_PUBLIC_*` variables
   - Add database connection strings
   - Do NOT add `RECIPIENT_OVERRIDE`

3. **Deploy**:
   - Vercel auto-deploys on push to main
   - Monitor build logs
   - Check deployment status

4. **Verify deployment**:
   - Visit production URL
   - Test menu page loads
   - Test cart functions
   - Test admin page (smoke test only, no real payments)

#### Vercel Deployment (Vite)

1. **Configure build settings**:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`

2. **Configure environment variables**:
   - Add all `VITE_*` variables
   - Add Supabase credentials
   - Do NOT add `VITE_RECIPIENT_OVERRIDE`

3. **Deploy**:
   - Push to main branch
   - Vercel auto-builds and deploys
   - Monitor build logs

4. **Verify deployment**:
   - Visit production URL
   - Test menu page loads
   - Test cart functions
   - Test admin page

### Post-Deployment Verification

**Customer Flow** (use test account, small amounts):
- [ ] Place order with Flow 3 (guest checkout)
- [ ] Create account with Flow 4
- [ ] Place order with Flow 6 (pay with account)

**Admin Flow**:
- [ ] Open Current Orders page
- [ ] Verify test order appears
- [ ] Fulfill test order
- [ ] Verify order disappears from list

**Monitoring**:
- [ ] Check Vercel logs for errors
- [ ] Check merchant-hub logs
- [ ] Check database for transfer records
- [ ] Monitor Redis usage

### Rollback Plan

If critical issues occur:

1. **Vercel**:
   - Go to Deployments
   - Find previous working deployment
   - Click "Promote to Production"

2. **Database**:
   - Keep backups of migrations
   - Document rollback SQL if needed

3. **Merchant-Hub**:
   - No changes needed (stateless)

---

## ADMIN BACKEND (KITCHEN & MENU MANAGEMENT)

Each spoke provides an admin backend for restaurant staff and managers. While the customer-facing payment integration is well-covered above, the admin backend encompasses **kitchen order management**, **menu CRUD**, **accounting/reporting**, and **access control**. The two spokes implement this differently due to their framework choices.

### Overview

| Feature | Indiesmenu (Next.js) | Croque-Bedaine (Vite SPA) |
|---------|---------------------|---------------------------|
| **Auth** | Password-based cookie session | Supabase Auth (email/password) with roles |
| **Roles** | Single admin password | Admin + Staff roles via `user_roles` table |
| **Menu CRUD** | Dishes, daily specials, allergens | Categories, dishes, drinks, ingredients, allergens |
| **Order Management** | Current orders + history | Current orders + history |
| **Accounting** | Reporting page (CSV/PDF) | Reporting page (CSV/PDF) |
| **Display Pages** | TV display, printout | — |
| **Image Management** | Git-based fuzzy matching | Direct URL upload |
| **Dark Mode** | Forced light mode | Full dark mode support (class-based) |

---

### Indiesmenu Admin Backend (Next.js)

**Location**: `indiesmenu/app/admin/`
**Auth**: Password-based session via `admin_session` cookie (24h expiry)

#### Authentication

- Single shared admin password (`ADMIN_PASSWORD` env var)
- Login page at `/admin/login` — sets `admin_session` cookie on success
- `middleware.ts` protects all `/admin/*` and `/api/admin/*` routes
- No role-based access — anyone with the password has full access
- Layout forces `color-scheme: light` (no dark mode)

#### Admin Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/admin` | Central hub with 6 cards: Daily Specials, Current Orders, History, Carte & Images, Allergènes, Comptabilité. Includes cache-clear button and quick links. |
| **Current Orders** | `/admin/current_orders` | Real-time kitchen order queue (~973 lines). Distributed poller election, kitchen transmission workflow, dual-currency grouping, late order highlighting, audio alerts. |
| **Order History** | `/admin/history` | Fulfilled orders grouped by date. Expandable day sections, lazy loading in 3-day chunks, auto-refresh every 10 seconds. |
| **Daily Specials** | `/admin/daily-specials` | Manage rotating daily dishes. Mark items as sold out, reorder, toggle visibility. |
| **Carte & Images** | `/admin/carte` | Full menu management. Edit dishes/drinks, manage images with fuzzy matching from git commit history (auto-detects new images in `public/food/`). |
| **Allergènes** | `/admin/alergenes` | Manage ingredient-allergen associations. Matrix view showing which ingredients contain which allergens. |
| **Comptabilité** | `/admin/reporting` | Accounting reports with date-range filtering, EUR/USD conversion (via Prisma `currency_conversion` table + ECB rates), transaction table, CSV and PDF export. |

#### API Routes

**Admin APIs** (all protected by middleware):
- `/api/admin/auth` — Login/logout endpoints
- `/api/admin/cache` — Manual menu cache invalidation
- `/api/admin/dishes` — Dish CRUD operations
- `/api/admin/drinks` — Drink CRUD operations
- `/api/admin/alergenes` — Allergen CRUD operations
- `/api/admin/ingredients` — Ingredient management
- `/api/admin/detect-new-images` — Scan git for new food images
- `/api/admin/match-images` — Fuzzy-match images to menu items
- `/api/admin/update-images` — Apply matched images to dishes
- `/api/admin/rates` — EUR/USD rate lookup (Prisma + ECB XML fallback)

**Order APIs**:
- `/api/transfers/sync-from-merchant-hub` — Consume from Redis Stream
- `/api/transfers/unfulfilled` — Fetch pending orders
- `/api/fulfill` — Mark order as fulfilled
- `/api/orders/history` — Paginated fulfilled orders

#### Display Pages (Public)

- `/display/plat-du-jour` — Daily specials optimized for TV monitors (auto-refresh)
- `/display/printout` — Printer-friendly A3 landscape menu layout

#### Files

```
indiesmenu/app/admin/
├── page.tsx                    # Dashboard (197 lines)
├── login/page.tsx              # Login page
├── layout.tsx                  # Admin layout (forces light mode)
├── current_orders/page.tsx     # CO page (973 lines)
├── history/page.tsx            # Order history (432 lines)
├── daily-specials/page.tsx     # Daily specials management
├── carte/page.tsx              # Menu + image management
├── alergenes/page.tsx          # Allergen management
└── reporting/page.tsx          # Accounting reports (375 lines)
```

---

### Croque-Bedaine Admin Backend (Vite SPA)

**Location**: `croque-bedaine/src/pages/admin/`
**Auth**: Supabase Auth with role-based access control

#### Authentication & Authorization

- **Supabase Auth**: Email/password authentication via `useAuth()` hook
- **Role-Based Access**: Two roles stored in `user_roles` table:
  - `admin` — Full access (can manage roles, see all admin pages)
  - `staff` — Kitchen access (orders, menu management, but no role management)
- **Row-Level Security**: Supabase RLS policies enforce access control at database level
- **Auth State**: `useAuth()` hook provides `user`, `isAdmin`, `isStaff`, `loading`, `signOut`
- **Route Protection**: `Admin.tsx` wrapper redirects unauthenticated users to `/auth`
- Users without a role see an "Accès limité" badge

#### Admin Pages

| Page | Route | Component | Description |
|------|-------|-----------|-------------|
| **Dashboard** | `/admin` | `Dashboard.tsx` | Stat cards with live counts: orders, categories, dishes, drinks, ingredients, allergens, users/roles, and accounting link. Each card navigates to its management page. |
| **Current Orders** | `/admin/current-orders` | `CurrentOrders.tsx` | Real-time kitchen queue. Merchant-hub polling, order alarm system, kitchen transmission, dual-currency grouping, call waiter detection, late order highlighting. Dark mode compatible. |
| **Order History** | `/admin/order-history` | `OrderHistory.tsx` | Last 50 fulfilled orders with hydrated memos, table/client info, timestamps. |
| **Comptabilité** | `/admin/reporting` | `Reporting.tsx` | Accounting reports fetched from merchant-hub. Date-range filtering, EUR/USD conversion (via `open.er-api.com`), transaction table, summary bar (EURO/HBD/EUR totals), CSV and PDF export. |
| **Categories** | `/admin/categories` | `Categories.tsx` | CRUD for dish/drink categories (name, type, display order). |
| **Dishes** | `/admin/dishes` | `Dishes.tsx` | CRUD for dishes: name, price, discount percentage, image URL, active/sold-out status, category assignment. |
| **Drinks** | `/admin/drinks` | `Drinks.tsx` | CRUD for drinks with size variants (e.g., small/large with different prices). |
| **Ingredients** | `/admin/ingredients` | `Ingredients.tsx` | Ingredient management with dish-ingredient and ingredient-allergen linking. |
| **Allergens** | `/admin/alergenes` | `Alergenes.tsx` | Allergen management with bilingual labels (FR/EN). Links to ingredients. |
| **Roles** | `/admin/roles` | `Roles.tsx` | User role management (admin-only). Assign admin/staff roles to Supabase users. |

#### Navigation Structure

The admin layout (`Admin.tsx`) provides:
- **Desktop**: Two-row navigation bar (Row 1: Dashboard, Orders, History, Comptabilité, Roles; Row 2: Categories, Dishes, Drinks, Ingredients, Allergens)
- **Mobile**: Single horizontal scrollable nav bar
- **Environment Badge**: Shows PROD/DEV with tooltip showing account and hub URL
- **User Info**: Email display + sign out button

```
Admin Layout (/admin)
├─ Row 1: Operations
│   ├─ Tableau de bord (Dashboard)
│   ├─ Commandes en cours (Current Orders)
│   ├─ Historique des commandes (Order History)
│   ├─ Comptabilité (Reporting)
│   └─ Rôles (Roles) [admin-only]
│
├─ Row 2: Menu Management
│   ├─ Catégories (Categories)
│   ├─ Plats (Dishes)
│   ├─ Boissons (Drinks)
│   ├─ Ingrédients (Ingredients)
│   └─ Allergènes (Allergens)
│
└─ Content: <Outlet /> (renders current page)
```

#### Dark Mode Support

Croque-bedaine uses class-based dark mode (`next-themes` + Tailwind's `.dark` class):
- **CSS Variables**: HSL-based theme colors defined in `src/index.css` (`:root` for light, `.dark` for dark)
- **shadcn/ui Components**: Automatically respect CSS variables (`bg-card`, `text-foreground`, etc.)
- **Custom Colors**: All hardcoded Tailwind colors use `dark:` variants (e.g., `text-red-800 dark:text-red-400`)
- **Reporting Page**: Full dark mode support with semantic color classes

#### Supabase Schema (Admin-Relevant Tables)

```sql
-- Menu management
categories (category_id, name, type, display_order)
dishes (dish_id, name, price, discount, image_url, active, sold_out, category_id)
drinks (drink_id, name, category_id, ...)
drink_sizes (id, drink_id, size_label, price)
ingredients (ingredient_id, name)
dish_ingredients (dish_id, ingredient_id)
alergenes (alergene_id, name_fr, name_en)
ingredient_alergenes (ingredient_id, alergene_id)

-- Auth & roles
profiles (id, email, ...)
user_roles (id, user_id, role)  -- role: 'admin' | 'staff'

-- Orders (synced from merchant-hub)
transfers (id, from_account, to_account, amount, symbol, memo, parsed_memo,
           received_at, fulfilled, fulfilled_at)
```

#### No API Routes

As a Vite SPA, croque-bedaine has **no server-side API routes**. All data operations use:
- **Supabase Client**: Direct database queries via `@supabase/supabase-js`
- **Merchant-Hub**: HTTP calls to `getMerchantHubUrl()` for transfer sync and reporting
- **External APIs**: `open.er-api.com` for EUR/USD exchange rates (reporting page)
- **Row-Level Security**: Supabase RLS replaces API-level auth checks

#### Files

```
croque-bedaine/src/pages/admin/
├── Dashboard.tsx         # Dashboard with stat cards
├── CurrentOrders.tsx     # Real-time order management
├── OrderHistory.tsx      # Fulfilled order history
├── Reporting.tsx         # Accounting reports (CSV/PDF)
├── Categories.tsx        # Category CRUD
├── Dishes.tsx            # Dish CRUD
├── Drinks.tsx            # Drink CRUD
├── Ingredients.tsx       # Ingredient management
├── Alergenes.tsx         # Allergen management
└── Roles.tsx             # Role management (admin-only)

croque-bedaine/src/pages/
├── Admin.tsx             # Admin layout + navigation
├── Auth.tsx              # Login page (Supabase Auth)
└── Index.tsx             # Customer-facing menu

croque-bedaine/src/hooks/
├── useAuth.tsx           # Auth context (user, roles, signOut)
├── useMenuData.ts        # Menu data fetching (for hydration)
└── useOrderAlarm.ts      # Order alarm sound logic
```

---

### Reporting / Comptabilité — Implementation Comparison

Both spokes provide accounting reports for the restaurant. The approaches differ due to their framework choices:

| Aspect | Indiesmenu | Croque-Bedaine |
|--------|-----------|----------------|
| **Data Source** | Merchant-hub `/api/reporting` | Merchant-hub `/api/reporting` |
| **EUR/USD Rates** | Server-side: Prisma `currency_conversion` table + ECB XML fallback | Hub API: `POST /api/currency/batch` (per-transaction-date rates) |
| **Rate Granularity** | Per-date historical rates via local DB | Per-date historical rates via hub batch endpoint |
| **Currency Display** | HBD → EUR conversion | EURO (1:1) + HBD → EUR conversion |
| **CSV Export** | UTF-8 BOM, semicolon separator, French headers | UTF-8 BOM, semicolon separator, French headers |
| **PDF Export** | jsPDF + autoTable, landscape | jsPDF + autoTable, landscape |
| **Dependencies** | `jspdf`, `jspdf-autotable` | `jspdf`, `jspdf-autotable` |
| **Styling** | Hardcoded light theme | CSS variables + dark mode |

### EUR/USD Rate Batch API (Hub)

The innopay hub exposes `POST /api/currency/batch` to allow spokes without direct database access (e.g., Vite SPAs) to retrieve historical EUR/USD conversion rates for their accounting reports. This is the canonical source of truth for conversion rates across the ecosystem.

**Endpoint**: `POST {innopayUrl}/api/currency/batch`

**Request**:
```json
{ "dates": ["2026-01-15", "2026-01-22", "2026-02-01"] }
```

**Response**:
```json
{ "rates": { "2026-01-15": 1.0834, "2026-01-22": 1.0821, "2026-02-01": 1.0456 } }
```

**Behaviour**:
- Batch-queries the `currencyConversion` Prisma model (populated from ECB daily XML feed)
- For dates without a stored rate (weekends, holidays), returns the nearest preceding rate
- Falls back to `1.0` if no rates exist in the database at all
- Caps at 366 unique dates per request
- Validates YYYY-MM-DD format
- CORS-enabled (`Access-Control-Allow-Origin: *`) for cross-origin spoke requests

**Usage pattern** (Vite SPA spokes):
```typescript
// 1. Fetch transactions from merchant-hub
const transactions = await fetchTransactions(from, to);

// 2. Extract unique dates for HBD transactions
const hbdDates = [...new Set(
  transactions
    .filter(tx => tx.symbol !== 'EURO')
    .map(tx => tx.timestamp.split('T')[0])
)];

// 3. Batch-fetch historical rates from innopay hub
const { rates } = await fetch(`${innopayUrl}/api/currency/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dates: hbdDates }),
}).then(r => r.json());

// 4. Apply per-date rate to each transaction
const rate = rates[txDate] || 1.0;
const amountEur = hbdAmount / rate;
```

**Implementation**: `innopay/app/api/currency/batch/route.ts`

Next.js spokes (indiesmenu) can query the `currencyConversion` table directly via their own Prisma client and don't need this endpoint, but they could use it as an alternative.

---

## APPENDICES

### Appendix A: Environment Variables Reference

#### Next.js Spokes

```bash
# Innopay Hub
NEXT_PUBLIC_HUB_URL=https://wallet.innopay.lu

# Merchant Hub
NEXT_PUBLIC_MERCHANT_HUB_URL=https://merchant-hub.innopay.lu

# Restaurant Identity
NEXT_PUBLIC_HIVE_ACCOUNT={restaurant}.{tld}
NEXT_PUBLIC_RESTAURANT_ID={restaurant}

# Database
DATABASE_URL=postgresql://user:pass@host:port/db
POSTGRES_URL=postgresql://user:pass@host:port/db

# Development only (REMOVE IN PRODUCTION)
RECIPIENT_OVERRIDE={restaurant}-test
```

#### Vite Spokes

```bash
# Innopay Hub
VITE_HUB_URL=https://wallet.innopay.lu

# Merchant Hub
VITE_MERCHANT_HUB_URL=https://merchant-hub.innopay.lu

# Restaurant Identity
VITE_HIVE_ACCOUNT={restaurant}.{tld}
VITE_RESTAURANT_ID={restaurant}

# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Development only (REMOVE IN PRODUCTION)
VITE_RECIPIENT_OVERRIDE={restaurant}-test
```

### Appendix B: Current Orders (CO) Page Conventions

#### UI Display Rules

**Order Card Structure**:
- **Dishes**: Dark red text (`#8B0000`), bold
- **Drinks**: Green text (`#008000`), bold
- **Separator**: Dashed line between dishes and drinks
- **Quantity**: Gray, right-aligned

**Order Metadata**:
- **Table**: From memo (`TABLE X`)
- **Client**: `@{from_account}`
- **Amount**: `{amount} {symbol}`
- **Time**: Color-coded by age
  - Green: < 10 minutes
  - Red: > 10 minutes (late)

#### Action Buttons

| Scenario | Button 1 | Button 2 |
|----------|----------|----------|
| Order has dishes, not transmitted | Orange "Transmettre en cuisine" | Gray "C'est parti!" (disabled) |
| Order has dishes, transmitted | (none) | Blue "C'est parti!" |
| Drinks-only order | (none) | Blue "C'est parti!" |

#### Kitchen Transmission

- Local state only (not in DB)
- Shows timestamp: "Transmis en cuisine à HH:MM"
- Stored in `Map<orderId, timestamp>`

#### Call Waiter Orders

- Red border, pulsing animation
- Red background (`bg-red-50`)
- Detected by: `memo.toLowerCase().includes('appel')`

#### Order Stacking

Orders displayed oldest-at-bottom, newest-at-top:
```tsx
<div className="flex flex-col-reverse gap-4">
  {orders.map(order => <OrderCard key={order.id} />)}
</div>
```

### Appendix C: Troubleshooting

#### Issue: Mixed PROD/DEV Transfers

**Symptom**: Both production and development orders appear in same CO page.

**Cause**: Merchant-hub polls both PROD and DEV accounts, publishes to same Redis stream.

**Solution**: Filter transfers by `to_account` in sync endpoint.

```typescript
// Determine environment
function getEnvironmentAccount(): string {
  const databaseUrl = process.env.DATABASE_URL || '';
  const isDev = databaseUrl.includes('innopaydb');
  return isDev ? '{restaurant}-test' : '{restaurant}.{tld}';
}

// Filter transfers
if (transfer.to_account !== environmentAccount) {
  console.log(`Filtered out ${transfer.id}`);
  filteredCount++;
  messagesToAck.push(transfer.messageId);
  continue;
}
```

**Cleanup SQL**:
```sql
-- For PRODUCTION (remove dev transfers)
DELETE FROM transfers WHERE to_account = '{restaurant}-test';

-- For DEV (remove prod transfers)
DELETE FROM transfers WHERE to_account = '{restaurant}.{tld}';
```

#### Issue: Hydration Showing Codes Instead of Names

**Symptom**: Orders show "d:7" instead of dish names.

**Causes**:
1. Menu data not loaded
2. Dish/drink IDs don't match database
3. Browser cache stale

**Solutions**:
1. Check `menuData` loaded in CO page
2. Verify `dish_id` / `drink_id` match frontend IDs
3. Clear cache from admin dashboard
4. Check browser console for errors

#### Issue: Orders Not Appearing in CO Page

**Symptom**: Order placed but doesn't appear in Current Orders.

**Causes**:
1. Missing `-inno-` suffix in memo (CRITICAL)
2. Merchant-hub not polling
3. Sync endpoint failing
4. Environment mismatch

**Solutions**:
1. Verify memo contains `-inno-` substring
2. Check merchant-hub heartbeat endpoint
3. Check sync endpoint logs
4. Verify `to_account` matches environment

### Appendix D: Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Integration Time** | < 3 days per spoke | Track from start to production |
| **Code Reuse** | > 80% | Lines copied vs. lines written |
| **Bug Rate** | < 5 bugs per integration | Track issues in first month |
| **Mobile Performance** | < 3s page load | Lighthouse score |
| **Payment Success Rate** | > 95% | Track failed payments |

### Appendix E: Future Enhancements

**Deferred Items** (from original plan):

- [ ] Security review (HttpOnly cookies for credentials)
- [ ] Hive Keychain external wallet support (handle FreeNow URI collision)
- [ ] Automated test runs in CI/CD
- [ ] Extract `@innopay/ui-components` npm package
- [ ] Extract `@innopay/payment-hooks` npm package
- [ ] Consider standalone payment service (Option C architecture)

**Triggers**:
- Security review: When wallet balances exceed 100 EUR
- NPM packages: After 4+ spokes integrated
- Payment service: After 10+ spokes or multi-framework support needed

### Appendix F: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-03 | Initial spoke integration plan (REVISED) |
| 1.1 | 2026-01-03 | Added framework compatibility (PLAN) |
| 1.2 | 2026-01-03 | Added Q&A addendum (ADDENDUM) |
| 1.3 | 2026-01-24 | Added conventions documentation |
| 2.0 | 2026-01-24 | **Consolidated all documentation into single source** |
| 2.1 | 2026-01-24 | **Added detailed flow information from SPOKE-FLOWS.md**: Flow 8, Flow 4 Variant B, detection criteria, user journeys, technical implementation (detectFlow), flow testing procedures with expected logs |
| 2.2 | 2026-01-25 | **State Machine Implementation Guide**: Added comprehensive state machine documentation with state definitions, 'redirecting' state details, common pitfalls, proper event dispatching, flow-specific state paths, return URL parameter handling, credential fetching logic, and testing guidelines. Lessons learned from Flow 3 bug fixes. |
| 2.3 | 2026-02-13 | **Flow 6 & Flow 8 updates**: Flow 6 croque-bedaine upgraded from single-leg direct transfer to two-leg dual-currency (Customer → innopay → Restaurant) via hub APIs. Flow 8 updated from "naive security" to full 3-step email verification (both spokes). EUR/USD rate now resolved server-side by hub when not provided by client. |
| 2.4 | 2026-02-19 | **Admin Backend documentation**: Added comprehensive Section 9 covering kitchen & menu management for both spokes — authentication, admin page inventories, menu CRUD, reporting/comptabilité, roles, dark mode support, Supabase schema, and implementation comparison. Added EUR/USD Rate Batch API documentation (`POST /api/currency/batch`) for historical per-transaction-date conversion rates. |

### Appendix G: Reference Links

**Live Projects**:
- Indiesmenu: https://indies.innopay.lu
- Croque-Bedaine: https://croque-bedaine.innopay.lu
- Innopay Hub: https://wallet.innopay.lu
- Merchant-Hub: https://merchant-hub.innopay.lu

**Documentation**:
- PROJECT-OVERVIEW.md - Ecosystem architecture
- FLOWS.md - Payment flow specifications
- ADMIN-DASHBOARD-IMPLEMENTATION.md - Admin features

**Source Code**:
- indiesmenu: Reference for Next.js integration
- croque-bedaine: Reference for Vite integration
- merchant-hub: Polling and Redis architecture

---

**Document Status**: ✅ Complete and Production Ready
**Next Action**: Use this document for all future spoke integrations
**Review Schedule**: Update after each new spoke integration
**Maintainer**: Development Team

---

**END OF DOCUMENTATION**

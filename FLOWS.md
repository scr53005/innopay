# Innopay Flow Management System

This document describes the systematic flow management system for tracking user journeys through the Innopay application.

## Overview

The flow management system provides a centralized way to detect, track, and handle different user journeys through account creation, top-ups, and payments. All flow logic is defined in `lib/flows.ts` as the single source of truth.

## Flow Categories

Flows are divided into two main categories:

### INTERNAL FLOWS
User stays on wallet.innopay.lu throughout the entire journey.

### EXTERNAL FLOWS
User comes from or returns to a restaurant platform (e.g., indies.innopay.lu/menu).

## Flow Types

### Internal Flows

#### 1. `new_account`
**Description:** Create a new Innopay account directly on wallet.innopay.lu (no restaurant order)

**Detection criteria:**
- No localStorage account (`hasLocalStorageAccount = false`)
- No restaurant context (no `table`, `orderAmount`, or `orderMemo`)

**User journey:**
1. User visits wallet.innopay.lu or wallet.innopay.lu/user
2. Enters account name and top-up amount
3. Completes Stripe checkout
4. Returns to wallet.innopay.lu/user/success

**Redirect:**
- Success: `wallet.innopay.lu/user/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `wallet.innopay.lu/user?cancelled=true`

---

#### 2. `topup`
**Description:** Top-up an existing Innopay account directly on wallet.innopay.lu

**Detection criteria:**
- Has localStorage account (`hasLocalStorageAccount = true`)
- No restaurant context (no `table`, `orderAmount`, or `orderMemo`)

**User journey:**
1. User visits wallet.innopay.lu with existing account
2. Enters top-up amount
3. Completes Stripe checkout
4. Returns to wallet.innopay.lu

**Redirect:**
- Success: `wallet.innopay.lu/?topup_success=true&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `wallet.innopay.lu/?cancelled=true`

---

### External Flows

**Note on domains:** Current pioneer implementation uses `indies.innopay.lu/menu` for the customer menu and `indies.innopay.lu` for the kitchen backend. Future implementations will use `{restaurant_name}.innopay.lu` for the menu and `{restaurant_name}.innopay.lu/admin/orders` for the kitchen backend (protected by basic authentication, similar to indiesmenu daily-specials middleware).

#### 3. `guest_checkout`
**Description:** Pay for restaurant order as a guest (no account creation)

**Detection criteria:**
- Has order (`orderAmount > 0`)
- No localStorage account (`hasLocalStorageAccount = false`)
- No accountName provided (user chose guest checkout, not account creation)

**User journey:**
1. User places order on indies.innopay.lu/menu
2. Selects "Pay as Guest"
3. Redirected to wallet.innopay.lu with order params
4. Completes Stripe checkout
5. Returns to indies.innopay.lu/menu

**Redirect:**
- Success: `indies.innopay.lu/menu?table={TABLE}&topup_success=true`
- Cancel: `indies.innopay.lu/menu?table={TABLE}&cancelled=true`

---

#### 4. `create_account_only` / `import_credentials`
**Description:** Create account from restaurant platform OR import existing credentials to spoke

**Flow 4 has TWO variants:**

**Variant A: Create Account (from restaurant)**
- User clicks "Create Innopay Account" on restaurant menu
- Redirects to hub for account creation + topup
- Returns with `session_id` for credential fetch

**Variant B: Import Credentials (from hub)** *(Added 2026-01-08)*
- User with existing account clicks spoke card on hub
- Hub creates credential session and redirects with `credential_token` + `flow=4`
- Spoke imports credentials without account creation

**Detection criteria (Variant A):**
- No order (`orderAmount = 0` or undefined)
- No localStorage account (`hasLocalStorageAccount = false`)
- AccountName provided (user is creating an account)
- Has restaurant context (`table` only - no `orderMemo` since there's no immediate order)

**Detection criteria (Variant B):**
- URL param `flow=4` present
- URL param `credential_token` present
- User coming from hub spoke card click

**User journey (Variant A - Create Account):**
1. User visits indies.innopay.lu/menu
2. Clicks "Create Innopay Account"
3. Redirected to wallet.innopay.lu/user with table param
4. Completes account creation and top-up
5. Returns to indies.innopay.lu/menu with session_id

**User journey (Variant B - Import Credentials):**
1. User visits wallet.innopay.lu with existing account
2. Clicks spoke card (e.g., Indies restaurant)
3. Hub creates credential session via `/api/account/create-credential-session`
4. Redirects to indies.innopay.lu/menu?credential_token=XXX&flow=4&account_created=true
5. Spoke fetches credentials via `/api/account/credentials`
6. MiniWallet appears with account balance

**Redirect (Variant A):**
- Success: `indies.innopay.lu/menu?table={TABLE}&account_created=true&session_id={STRIPE_SESSION_ID}`
- Cancel: `indies.innopay.lu/menu?table={TABLE}&cancelled=true`

**Redirect (Variant B):**
- Direct navigation: `indies.innopay.lu/menu?credential_token={TOKEN}&flow=4&account_created=true&table={TABLE}`

**Special handling:**
- **Variant A** uses `session_id` for credential fetch after account creation
- **Variant B** uses `credential_token` for credential import from hub (NOT legacy - actively used!)
- Both variants use `/api/account/credentials` endpoint
- Credentials stored in localStorage enable mini-wallet for future orders
- No page refresh needed, MiniWallet appears immediately thanks to React Query (2026-01-09 fix)
- **Spoke banner**: Shows "Votre portefeuille Innopay est prêt, vous pouvez déjà commander" (2026-01-09)

**Implementation files:**
- Hub credential session utility: `innopay/lib/credential-session.ts`
- Hub spoke card handler: `innopay/app/page.tsx` (lines 973-988)
- Spoke credential fetch: `indiesmenu/app/menu/page.tsx` (lines 215-468)
- Spoke Flow 4 handler: `indiesmenu/app/menu/page.tsx` (lines 437-458)

---

#### 5. `create_account_and_pay`
**Description:** Create new account AND pay for restaurant order in one transaction

**Detection criteria:**
- Has order (`orderAmount > 0`)
- No localStorage account (`hasLocalStorageAccount = false`)
- AccountName provided (user wants to create account, not guest checkout)
- Has restaurant context (`table`, `orderMemo`)

**User journey:**
1. User places order on indies.innopay.lu/menu
2. Selects "Create Account & Pay"
3. Redirected to wallet.innopay.lu/user with order params
4. If an account is present in wallet.innopay.lu, it uses this wallet to pay (flow 5 becomes flow 6 or flow 7 depending on whether the amount 
in the existing wallet is higher or lower than the orderAmount) and returns credential_token for the spoke to import the account from the wallet.
5. If no account is present in wallet.innopay.lu it enters account name or accepts suggested, payment includes order + top-up
6. Completes Stripe checkout
7. Returns to indies.innopay.lu/menu

**Redirect:**
- Success: `indies.innopay.lu/menu?table={TABLE}&topup_success=true`
- Cancel: `indies.innopay.lu/menu?table={TABLE}&cancelled=true`

**Special handling:**
- Payment is split: part goes to user's new account, part goes to restaurant
- Webhook attempts to transfer HBD to restaurant using `orderMemo` for matching
- If insufficient HBD available, webhook transfers EURO Hive Engine tokens instead and records the debt in the `outstanding_debt` table
- Debt tracking ensures innopay can settle HBD obligations with restaurants later

---

#### 6. `pay_with_account`
**Description:** Pay for restaurant order using existing account (sufficient balance)

**Detection criteria:**
- Has order (`orderAmount > 0`)
- Has localStorage account (`hasLocalStorageAccount = true`)
- Account balance >= order amount

**User journey:**
1. User places order on indies.innopay.lu/menu
2. Selects "Pay with Innopay"
3. Payment processed directly from account balance (NO Stripe checkout)
4. Order confirmed immediately on indies.innopay.lu/menu

**Implementation:** ✅ **FULLY IMPLEMENTED AND WORKING**

This flow does NOT require Stripe checkout. The implementation is in `indiesmenu/app/menu/page.tsx` lines 1536-1783:

1. **Balance check** (line 1473): Verifies customer's EURO token balance is sufficient (if not => FLOW 7)

2. **First leg transfer**: **Customer → innopay**
   - **HBD transfer attempt**: `orderAmount * eurUsdRate` HBD
   - If insufficient HBD → record `outstanding_debt` (customer owes innopay)
   - **EURO transfer** (collateral): Always succeeds by definition
   - Signs and broadcasts via `/api/sign-and-broadcast` endpoint
   - Updates mini-wallet balance in UI

3. **Second leg transfer**: **innopay → restaurant**
   - Calls `/api/wallet-payment` endpoint
   - **HBD transfer attempt** to restaurant
   - If insufficient HBD → record `outstanding_debt` (innopay owes restaurant)
   - **EURO transfer** (collateral): Fallback payment method
   - Uses `orderMemo` for order matching

**Payment Structure:**
- Both legs attempt HBD first (preferred by restaurants for Hive transactions)
- EURO tokens serve as collateral/fallback
- Outstanding debts tracked for later HBD reconciliation
- This ensures orders are ALWAYS fulfilled even when HBD is temporarily unavailable

**Important:** This is a working flow - do not break it during refactoring!

---

#### 7. `pay_with_topup`
**Description:** Top-up account AND pay for restaurant order (insufficient balance)

**Detection criteria:**
- Has order (`orderAmount > 0`)
- Has localStorage account (`hasLocalStorageAccount = true`)
- Account balance < order amount

**Status:** ✅ **FULLY IMPLEMENTED - UNIFIED WEBHOOK APPROACH**

**Implementation:** Unified approach where webhook handles BOTH topup and order payment in a single atomic transaction.

**User journey:**
1. User places order on indies.innopay.lu/menu
2. Selects "Pay with Innopay"
3. Account balance insufficient
4. Menu redirects to Stripe checkout with:
   - `accountName` from localStorage
   - `amount` (calculated: orderAmount - currentBalance, minimum 15€)
   - `orderAmountEuro` (the order cost)
   - `orderMemo` (for restaurant payment matching)
   - `table` (for redirect)
   - `returnUrl` (indies.innopay.lu/menu)
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
7. Stripe redirects to: `indies.innopay.lu/menu?order_success=true&session_id={CHECKOUT_SESSION_ID}&table={TABLE}`
8. Menu page detects `order_success=true` and `session_id`
9. Fetches credentials from `/api/account/credentials` using session_id
10. Clears cart and shows Flow 7 success banner
11. Updates mini-wallet with new balance (NO page reload)

**Redirect URLs:**
- Success: `indies.innopay.lu/menu?order_success=true&session_id={CHECKOUT_SESSION_ID}&table={TABLE}`
  - Set in checkout creation (`app/api/checkout/account/route.ts` line 233)
- Cancel: `indies.innopay.lu/menu?topup_cancelled=true&table={TABLE}`

**Payment Structure:**

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

**Key Implementation Details:**

1. **Atomic webhook processing**: Order payment and balance update happen server-side in one webhook call
2. **HBD + EURO dual transfer**: Always attempts HBD first, falls back to EURO tokens with debt recording
3. **Credential session**: Webhook creates session with `euroBalance` = change after order payment
4. **Session ID lookup**: Menu page uses Stripe `session_id` to fetch credentials
5. **No page reload**: Cart clears and success banner appears immediately
6. **Debt tracking**: Records `outstanding_debt` when HBD transfers fail for later reconciliation

**Special handling:**
- Minimum topup: 15€ (enforced in webhook)
- Change transfers use memo: "Monnaie / Change"
- Deficit transfers use memo: "Paiement manquant / Missing payment"
- Webhook skips account verification (assumes account exists in localStorage)
- Mock accounts supported for dev/test (transfers will fail but flow works)

**Security:**
- Credentials expire after 5 minutes
- One-time use only (retrieved flag prevents reuse)
- CORS headers allow cross-origin credential fetching
- Session ID from Stripe provides secure token

**Error handling:**
- If restaurant payment fails → throws error, entire transaction fails
- If change transfer fails → logs warning, transaction still succeeds (restaurant already paid)
- If deficit transfer fails → logs warning, manual reconciliation needed
- Database errors are non-blocking if transfers succeeded

**Implementation files:**
- Webhook handler: `app/api/webhooks/route.ts` lines 379-589 (handleFlow7UnifiedApproach)
- Checkout creation: `app/api/checkout/account/route.ts` lines 226-240 (Flow 7 returnUrl handling)
- Menu page: `indiesmenu/app/menu/page.tsx` lines 289-309 (Flow 7 success handling)
- Credentials API: `app/api/account/credentials/route.ts` lines 72-92 (sessionId lookup)

---

#### 8. `import_account`
**Description:** Import an existing Hive account into Innopay

**Detection criteria:**
- User explicitly requests import functionality via "Import Account" button
- User provides email associated with an existing Innopay account

**Status:** ✅ **IMPLEMENTED** (but with naive security - needs enhancement)

**User journey:**
1. User visits indies.innopay.lu/menu without credentials
2. Clicks "Import Account"
3. Enters email address
4. System retrieves account credentials from database
5. Credentials stored in localStorage for mini-wallet
6. User can now pay with account

**Implementation notes:**
- Current implementation is functional and tested
- Security is "naive" and will need to evolve for better protection
- Limited to 5 import attempts per session to prevent abuse
- Implementation in `indiesmenu/app/menu/page.tsx` lines 1060-1178

**Future enhancements needed:**
- Add email verification step
- Implement 2FA or magic link authentication
- Rate limiting at server level
- Audit logging for import attempts

---

## Technical Implementation

### Flow Detection (`lib/flows.ts`)

The `detectFlow()` function is the single source of truth for flow detection:

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
    if (hasOrder && !hasLocalStorageAccount) return 'guest_checkout';
    if (!hasOrder && !hasLocalStorageAccount) return 'create_account_only';
    if (hasOrder && hasLocalStorageAccount) {
      return accountBalance >= parseFloat(orderAmount)
        ? 'pay_with_account'
        : 'pay_with_topup';
    }
  }

  // INTERNAL FLOWS
  return hasLocalStorageAccount ? 'topup' : 'new_account';
}
```

### Flow Context

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

### Flow Metadata

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

### Integration Points

#### 1. Entry Points (Client-side)

**`app/page.tsx`** (Landing/Top-up page)
- Builds flow context with `hasLocalStorageAccount` and `accountBalance`
- Passes to checkout API

**`app/user/page.tsx`** (Account creation page)
- Checks for existing account in localStorage (lines 169-200)
- If existing account found, blocks new account creation (line 452-454)
- Sets `hasLocalStorageAccount = false` when creating new account (page only allows creation if no existing account)
- Includes `redirectParams` if coming from restaurant
- **Note:** Users CAN navigate to this page with an existing account, but the page will display the existing account info and prevent creating a second account

#### 2. Checkout API (`app/api/checkout/account/route.ts`)

1. Receives flow context from client
2. Calls `detectFlow(context)` to determine flow
3. Stores `flow` and `flowCategory` in Stripe metadata
4. Uses `getRedirectUrl(flow)` for success/cancel URLs
5. Creates Stripe checkout session

#### 3. Webhook Handler (`app/api/webhooks/route.ts`)

1. Reads `flow` from Stripe session metadata
2. Routes to appropriate handler based on flow type
3. Logs flow metadata for debugging
4. Processes payment according to flow requirements

## Testing Flows

### Internal Flow Tests

#### Test: new_account
1. Clear localStorage
2. Visit wallet.innopay.lu/user
3. Enter account name (e.g., "testuser123")
4. Enter amount (e.g., 100€)
5. Complete checkout
6. Verify redirect to wallet.innopay.lu/user/success
7. Check console logs for flow detection

**Expected logs:**
```
[CHECKOUT API] Flow Detection: new_account
[WEBHOOK] Detected flow: new_account
[WEBHOOK] Flow category: internal
```

---

#### Test: topup
1. Ensure account exists in localStorage
2. Visit wallet.innopay.lu
3. Enter top-up amount (e.g., 50€)
4. Complete checkout
5. Verify redirect to wallet.innopay.lu/?topup_success=true
6. Check console logs

**Expected logs:**
```
[CHECKOUT API] Flow Detection: topup
[WEBHOOK] Detected flow: topup
[WEBHOOK] Flow category: internal
```

---

### External Flow Tests

#### Test: guest_checkout
1. Clear localStorage
2. Visit indies.innopay.lu/menu
3. Place order (e.g., 25€)
4. Select "Pay as Guest"
5. Complete checkout
6. Verify redirect back to indies.innopay.lu/menu?table={TABLE}&topup_success=true
7. Check Hive transfer to restaurant

**Expected logs:**
```
[CHECKOUT API] Flow Detection: guest_checkout
[WEBHOOK] Detected flow: guest_checkout
[WEBHOOK] Flow category: external
[WEBHOOK] Requires redirect: true → restaurant
```

---

#### Test: create_account_only
**Variant A (Create Account):**
1. Clear localStorage
2. Visit indies.innopay.lu/menu
3. Click "Create Innopay Account" (no order)
4. Enter account name and amount
5. Complete checkout
6. Verify redirect back to indies.innopay.lu/menu?table={TABLE}&account_created=true&session_id={SESSION_ID}
7. Verify credentials fetched and stored in localStorage
8. Verify page refresh displays mini-wallet

**Variant B (Import Credentials):**
1. Visit wallet.innopay.lu with existing account in localStorage
2. Click on Indies spoke card
3. Verify redirect to indies.innopay.lu/menu?credential_token={TOKEN}&flow=4&account_created=true
4. Verify credentials fetched and stored in localStorage
5. Verify MiniWallet appears immediately (no refresh)
6. Verify unified success banner shows "Votre portefeuille Innopay est prêt"

**Expected logs:**
```
[CHECKOUT API] Flow Detection: create_account_only
[WEBHOOK] Detected flow: create_account_only
[WEBHOOK] Flow category: external
[ACCOUNT CREATED] Fetching credentials from innopay with token
```

---

#### Test: create_account_and_pay
1. Clear localStorage
2. Visit indies.innopay.lu/menu
3. Place order (e.g., 30€)
4. Select "Create Account & Pay"
5. Enter account name and amount (e.g., 80€)
6. Complete checkout
7. Verify:
   - Account created
   - 30€ transferred to restaurant (HBD or EURO with debt recording)
   - 50€ in user's account
8. Verify redirect back to indies.innopay.lu/menu

**Expected logs:**
```
[CHECKOUT API] Flow Detection: create_account_and_pay
[WEBHOOK] Detected flow: create_account_and_pay
[WEBHOOK] Flow category: external
[WEBHOOK ACCOUNT] Processing restaurant order payment: 30€
```

---

#### Test: pay_with_account
1. Ensure account with balance >= order amount exists
2. Visit indies.innopay.lu/menu
3. Place order within balance (e.g., 15€)
4. Select "Pay with Innopay"
5. Payment processed immediately (NO Stripe checkout)
6. Verify:
   - Customer → innopay EURO transfer
   - innopay → restaurant HBD/EURO transfer
   - Mini-wallet balance updated
7. Order confirmed on indies.innopay.lu/menu

**Expected logs:**
```
[WALLET PAYMENT] Checking EURO balance for: {account}
[WALLET PAYMENT] Current EURO balance: {balance} Required: {amount}
[WALLET PAYMENT] EURO transfer successful! TX: {txId}
[WALLET PAYMENT] Payment complete!
```

---

#### Test: pay_with_topup
1. Ensure account with balance < order amount exists in localStorage
2. Visit indies.innopay.lu/menu
3. Place order larger than balance (e.g., balance: 10€, order: 30€)
4. Select "Pay with Innopay"
5. Redirected to Stripe checkout (topup amount = 30€ - 10€ = 20€ minimum)
6. Complete Stripe checkout
7. Verify redirect back to indies.innopay.lu/menu?order_success=true&session_id={ID}&table={TABLE}
8. Verify on indies.innopay.lu/menu:
   - Cart cleared ✓
   - Flow 7 success banner displayed ✓
   - Mini-wallet shows updated balance (0€ if exact match) ✓
   - No page reload ✓
9. Check Hive transfers:
   - Restaurant received 30€ (HBD or EURO with debt)
   - Customer received 0€ change (exact match scenario)
10. Verify debug log: `JSON.parse(localStorage.getItem('innopay_debug_last_params'))`

**Expected logs:**
```
[CHECKOUT API] Flow Detection: pay_with_topup
[CHECKOUT API] Using custom returnUrl for Flow 7
[WEBHOOK] Detected flow: pay_with_topup
[FLOW 7] Unified approach: topup=20€, order=30€
[FLOW 7] ✅ HBD transferred to restaurant: {txId}
[FLOW 7] Step 2: Calculate change: 20€ - 30€ = -10€
[FLOW 7] Step 3: Negative change - transferring 10€ from {account} to innopay
[FLOW 7] ✅ Deficit EURO transferred from customer to innopay: {txId}
[FLOW 7] ✅ Flow 7 complete - redirect to: {url}
[CREDENTIAL CHECK] order_success: true, sessionId: {id}
[FLOW 7 SUCCESS] Order completed via unified webhook approach
[FLOW 7 SUCCESS] Order paid successfully - cart cleared, balance updated, banner shown
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User Entry Point                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ Has Account?  │
         └───┬───────┬───┘
             │       │
         NO  │       │  YES
             │       │
    ┌────────▼───────▼────────┐
    │ Has Restaurant Context? │
    └────┬───────────────┬────┘
         │               │
     NO  │               │  YES
         │               │
    ┌────▼─────┐    ┌────▼──────────┐
    │ INTERNAL │    │   EXTERNAL    │
    │  FLOWS   │    │    FLOWS      │
    └──┬───┬───┘    └──┬────────┬───┘
       │   │           │        │
       │   │     ┌─────▼────┐   │
       │   │     │Has Order?│   │
       │   │     └─┬──────┬─┘   │
       │   │       │      │     │
       │   │    NO │      │ YES │
       │   │       │      │     │
       │   │  ┌────▼──┐ ┌─▼─────▼──────┐
       │   │  │create_│ │  guest_      │
       │   │  │account│ │  checkout /  │
       │   │  │_only  │ │  create_and_ │
       │   │  └───────┘ │  pay / top_up│
       │   │            └──────────────┘
   ┌───▼───▼────┐
   │new_account │
   │   topup    │
   └────────────┘
```

## Debugging

### Enable Flow Logging

Flow detection is automatically logged at each stage:

1. **Checkout API**: Logs detected flow and context
2. **Webhook**: Logs flow metadata and routing decision

### Common Issues

**Issue:** Flow detected as `new_account` but should be `create_account_and_pay`

**Cause:** Missing `redirectParams` in request body

**Fix:** Ensure client passes `redirectParams.orderAmount` when coming from restaurant

---

**Issue:** Redirect goes to wrong domain

**Cause:** Flow category incorrect or hardcoded URLs

**Fix:** Verify `getRedirectUrl()` is using flow metadata, not hardcoded logic

---

**Issue:** Webhook handler doesn't recognize flow

**Cause:** Stripe metadata not updated after flow system implementation

**Fix:** Check Stripe session metadata includes `flow` and `flowCategory` fields

---

## Migration Notes

### Before Flow System
- Used string literals: `'guest'`, `'account_creation'`, `'topup'`
- Flow detection scattered across codebase
- Hardcoded redirect URLs

### After Flow System
- Centralized type-safe flow definitions
- Single `detectFlow()` function
- Systematic metadata tracking
- Flow-based redirect URL generation

### Backward Compatibility
- Webhook still handles legacy flow values
- Falls back to `handleLegacyFlow()` if no flow metadata

## Future Enhancements

1. ✅ ~~**Implement `pay_with_account`**: Direct payment without Stripe (if balance sufficient)~~ - **COMPLETED**
2. ✅ ~~**Implement `pay_with_topup`**: Unified webhook approach for topup + payment~~ - **COMPLETED**
3. ✅ ~~**Implement `import_account`**: Allow users to import existing Hive accounts~~ - **COMPLETED** (naive security)
4. **Add flow analytics**: Track conversion rates per flow
5. **Flow-based email templates**: Customize confirmation emails per flow
6. **Multi-restaurant support**: Extend external flows beyond indiesmenu
7. **Enhanced import security**: Add email verification, 2FA, or magic link for account imports

---

**Last Updated:** 2025-12-14

**Maintainer:** Flow management system implemented as part of systematic tracking initiative

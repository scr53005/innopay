# Innopay Spoke Integration - Complete Documentation

**Last Updated**: 2026-01-24
**Status**: Production Ready
**Version**: 2.0

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
9. [Appendices](#appendices)

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

### Payment Flows Supported

| Flow | Description | Requires Account | Creates Account | Cashback Eligible |
|------|-------------|------------------|-----------------|-------------------|
| **3** | Guest Checkout (Stripe) | No | No | No |
| **4** | Create Account Only | No | Yes | No |
| **5** | Create Account + Pay | No | Yes | Yes |
| **6** | Pay with Existing Account | Yes | No | Yes |
| **7** | Top-up + Pay | Yes | No | Yes |

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
- [ ] Flow 4: Create account only
- [ ] Flow 5: Create account + pay
- [ ] Flow 6: Pay with existing account
- [ ] Flow 7: Top-up + pay
- [ ] Admin page: Orders appear
- [ ] Admin page: Fulfill works
- [ ] Mobile: iOS Safari
- [ ] Mobile: Android Chrome

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

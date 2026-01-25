# INNOPAY ECOSYSTEM - PROJECT OVERVIEW

**Last Updated**: 2026-01-25
**Architecture**: Hub-and-Spokes Multi-Restaurant Payment System with Centralized Blockchain Polling

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Hub: Innopay](#hub-innopay)
3. [Merchant Hub: HAF Polling Infrastructure](#merchant-hub-haf-polling-infrastructure)
4. [Spoke 1: Indiesmenu](#spoke-1-indiesmenu)
5. [Spoke 2: Croque-Bedaine](#spoke-2-croque-bedaine)
6. [Payment Flows](#payment-flows)
7. [Technology Stack](#technology-stack)
8. [Development Setup](#development-setup)
9. [Deployment](#deployment)

---

## 🏗️ ARCHITECTURE OVERVIEW

The Innopay ecosystem follows a **hub-and-spokes architecture** where:

- **Hub (innopay)**: Centralized payment processor and wallet management system
- **Spokes**: Individual restaurant applications that integrate with the hub for payments

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

### Key Design Principles

1. **Centralized Payment Processing**: All blockchain operations and Stripe payments happen in the hub
2. **Credential Security**: Hub manages sensitive account credentials, passes them securely to spokes
3. **Spoke Independence**: Each restaurant can have unique UI/UX and features
4. **Technology Flexibility**: Spokes can use different tech stacks (Next.js, Vite, etc.)
5. **Scalability**: Easy to add new restaurant spokes without modifying existing ones

---

## 🏢 HUB: INNOPAY

**Repository**: `../innopay`
**Tech Stack**: Next.js 15 + TypeScript + Prisma + PostgreSQL
**URL**: Production: `wallet.innopay.lu` | Dev: `localhost:3000`

### Purpose

Innopay is the **central payment hub** that handles:
- User account creation and verification
- Wallet management (Hive blockchain)
- Payment processing (Stripe for EUR, Hive for HBD)
- Credential storage and secure handover to spokes
- Balance tracking and debt reconciliation

### Key Features

#### 1. Payment Processing
- **Stripe Integration**: EUR topups via credit/debit cards
- **Hive Blockchain**: HBD transfers and EURO token transfers
- **Dual-Currency Support**: Handles both EUR and HBD seamlessly
- **Debt Tracking**: Records outstanding debts when customer transfers fail

#### 2. Account Management
- **BIP39 Seed Generation**: Secure wallet creation
- **Email Verification**: 6-digit code verification system
- **Multiple Account Support**: Users can have multiple Hive accounts
- **Credential Sessions**: Temporary secure sessions for credential handover

#### 3. API Routes

**Core Payment APIs**:
- `/api/create-checkout-session` - Stripe checkout session creation
- `/api/wallet-payment` - Hive wallet payment execution
- `/api/sign-and-broadcast` - Blockchain transaction signing
- `/api/execute-order-payment` - Complete order payment flow
- `/api/webhooks` - Stripe webhook handler (unified architecture)

**Account Management APIs**:
- `/api/create-hive-account` - New Hive account creation
- `/api/account/retrieve` - Retrieve account info
- `/api/account/credentials` - Fetch account credentials
- `/api/account/create-credential-session` - Secure credential handover
- `/api/verify/*` - Email verification endpoints

**Balance & Currency APIs**:
- `/api/balance/euro` - Check EURO token balance
- `/api/currency` - EUR/USD exchange rate
- `/api/checkout/status` - Payment status checking

### Database Schema (Prisma)

**Core Models**:
- `innouser` - User accounts with email verification
- `walletuser` - Hive wallet accounts
- `bip39seedandaccount` - Seed storage for account recovery
- `topup` - EUR topup transaction history
- `guestcheckout` - Guest checkout sessions
- `accountCredentialSession` - Temporary credential sessions (5min expiry)
- `outstanding_debt` - Tracks debts (EURO/HBD) when transfers fail
- `bonus` - Promotional bonus tracking
- `campaign` - Marketing campaign management
- `email_verification` - Email verification codes
- `spoke` - Dynamic spoke registration (businesses accepting Innopay)

### Dependencies

**Key Libraries**:
- `@hiveio/dhive` - Hive blockchain integration
- `stripe` - Payment processing
- `@prisma/client` - Database ORM
- `bip39` - Wallet seed generation
- `@storacha/*` - Decentralized storage
- `resend` - Email service

### Dynamic Spoke Registry (2026-01-08)

The hub now uses a **database-driven spoke registry** (`spoke` table) instead of hardcoded business lists:

**Spoke Registration System**:
- `id` - Unique spoke identifier (e.g., 'indies', 'croque-bedaine')
- `name` - Display name (e.g., 'Independent Café')
- `type` - Business type ('restaurant', 'shop', 'service')
- `domain_prod` / `port_dev` - Environment-specific URLs
- `path` - Spoke-specific routing (e.g., '/menu', '/')
- `attribute_name_1/2/3` - Dynamic query parameters (e.g., 'table')
- `attribute_storage_key_1/2/3` - localStorage keys for attribute values
- `image_1/2/3` - Business images for hub display
- `ready` - Production readiness flag (false = "Coming Soon" badge)
- `active` - Visibility toggle
- `has_delivery` - Future delivery support flag

**URL Building**:
```typescript
// Hub dynamically builds spoke URLs based on environment and attributes
const spokeUrl = buildSpokeUrl(spoke);
// Production:  https://indies.innopay.lu/menu?table=0
// Mobile:      http://192.168.178.55:3001/menu?table=0
// Localhost:   http://localhost:3001/menu?table=0
```

**Spoke Management**:
- SQL-based CRUD operations (see `prisma/SPOKE_MANAGEMENT.md`)
- No API routes needed - direct database access
- Easy spoke registration without code changes

---

## 🔄 MERCHANT HUB: HAF POLLING INFRASTRUCTURE

**Repository**: `../merchant-hub`
**Tech Stack**: Next.js 15 + TypeScript + PostgreSQL (HAF) + Upstash Redis
**Deployment**: Vercel (serverless with Cron)

### Purpose

The merchant-hub is a **centralized blockchain polling service** that solves the "diabolo topology" problem. Instead of each restaurant independently polling the Hive blockchain (which would create N×3 database queries for N restaurants), merchant-hub centralizes all polling into **3 total queries** (one per currency).

### Architecture: Distributed Leader Election

The merchant-hub uses a **distributed leader election** pattern where multiple restaurant co (customer-facing) pages coordinate to elect a single poller:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Indies Co  │    │ Croque Co   │    │  Other Co   │
│    Page     │    │    Page     │    │   Pages     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │ Redis SETNX (atomic election)
                          ▼
                  ┌───────────────┐
                  │ Merchant-Hub  │
                  │   (Poller)    │
                  └───────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   HAF DB      │
                  │ (Hive Archive)│
                  └───────────────┘
```

**Election Process**:
1. First co page to open calls `/api/wake-up`
2. Attempts Redis `SETNX` with random collision-avoidance delay (Ethernet-like)
3. Winner becomes "poller", polls every 6 seconds
4. Losers subscribe to Redis Streams for transfer notifications
5. Poller maintains heartbeat (30s TTL)
6. If poller dies, another co page takes over

### Polling Modes

**Active Mode (6-second polling)**:
- Triggered when at least one restaurant co page is open
- Poller queries HAF database every 6 seconds
- Publishes transfers to Redis Streams
- Maintains heartbeat lock

**Sleeping Mode (5-minute polling)**:
- Vercel Cron fallback when all shops closed
- Polls every 5 minutes via `/api/cron-poll` (optimized from 1-minute)
- Only runs if no active 6-second poller detected
- Ensures transfers aren't missed overnight
- Reduced frequency to stay under Upstash free tier (500k requests/month)

### Batched Query Architecture (O(1) Scaling)

**The Scaling Problem (Old Approach)**:
```
2 restaurants × 3 currencies = 6 queries
400 restaurants × 3 currencies = 1,200 queries
Execution time: ~24 seconds at scale
```

**The Solution (Batched Queries)**:
```typescript
// ONE query for ALL restaurants per currency
const hbdResult = await pool.query(
  `SELECT id, to_account, from_account, amount, symbol, memo
   FROM hafsql.operation_transfer_table
   WHERE to_account = ANY($1)  -- ['indies.cafe', 'croque.bedaine', ...]
     AND symbol = 'HBD'
     AND id > $2
   ORDER BY id DESC
   LIMIT 100`,
  [allAccounts, minLastId]
);
```

**Performance Comparison**:

| Restaurants | Old Queries | New Queries | Improvement | Est. Time |
|------------|-------------|-------------|-------------|-----------|
| 2          | 6           | 3           | 2x          | ~60ms     |
| 4          | 12          | 3           | 4x          | ~65ms     |
| 400        | 1,200       | 3           | **400x**    | ~65ms     |

**Key Insight**: Network latency (10-50ms per round-trip) dominates query execution time. By reducing from N queries to 3 queries, we eliminate the dominant cost factor.

### Multi-Environment Polling

Since batched queries scale at O(1), merchant-hub queries **ALL accounts** (prod + dev) simultaneously:

```typescript
const accounts = [
  'indies.cafe',      // Production
  'indies-test',      // Development
  'croque.bedaine',   // Production
  'croque-test'       // Development
];
// Still just 3 queries total!
```

Each transfer includes the `account` field so restaurant co pages can filter by environment if needed.

### Currency Support

**Three currencies polled**:

1. **HBD** (Hive-Backed Dollars) - Native Hive token
   - Query: `operation_transfer_table`
   - Fast native transfers
   - Base layer blockchain

2. **EURO** - Hive-Engine token
   - Query: `operation_custom_json_view`
   - Pegged to EUR (1:1)
   - Layer 2 smart contract

3. **OCLT** - Hive-Engine loyalty token
   - Query: `operation_custom_json_view`
   - Community token
   - Layer 2 smart contract

### Redis Streams Integration

**Stream Architecture (2026-01-24 Update: Single Hash Optimization)**:
```
# Streams (unchanged)
transfers:indies          → Indies restaurant transfers
transfers:croque-bedaine  → Croque restaurant transfers
system:broadcasts         → System coordination messages

# Legacy keys (still used for poller lock with TTL)
polling:poller            → Current poller identity (30s TTL)

# NEW: Single hash for all polling state (Option 3 optimization)
polling:state             → Hash containing:
  ├─ heartbeat            → Poller liveness timestamp
  ├─ mode                 → active-6s | sleeping-5min
  ├─ poller               → Current poller ID
  ├─ indies.cafe:HBD      → Last processed HBD transfer ID (prod)
  ├─ indies-test:HBD      → Last processed HBD transfer ID (dev)
  ├─ indies.cafe:EURO     → Last processed EURO transfer ID (prod)
  ├─ indies-test:EURO     → Last processed EURO transfer ID (dev)
  ├─ croque.bedaine:HBD   → Last processed HBD transfer ID (prod)
  └─ ... (all account:currency combinations)

# Benefits: 1 HGETALL + 1 HMSET per poll (down from 13 GETs + N SETs)
```

**Transfer Object Structure**:
```typescript
interface Transfer {
  id: string;                // HAF operation ID
  restaurant_id: string;     // 'indies' | 'croque-bedaine'
  to_account: string;        // 'indies.cafe' | 'indies-test' (recipient Hive account)
  from_account: string;      // Customer Hive account (sender)
  amount: string;            // Transfer amount
  symbol: 'HBD' | 'EURO' | 'OCLT';
  memo: string;              // Order details + table info
  parsed_memo?: string;      // Decoded memo
  received_at: string;       // ISO timestamp
  block_num?: number;        // Blockchain block number
}
```

**Note**: The `to_account` field (previously `account`) was standardized on 2026-01-08 to match HAFSQL database column naming and enable environment-based filtering in spokes.

### API Routes

**Coordination APIs**:
- `/api/wake-up` - Co page initialization, attempt leader election
- `/api/heartbeat` - Poller heartbeat check
- `/api/poll` - Active polling endpoint (every 6s when co page is poller)
- `/api/cron-poll` - Vercel Cron fallback (every 5min when all shops closed)

**Monitoring APIs** (future):
- `/api/status` - System health check
- `/api/metrics` - Polling statistics

### Key Features

1. **Zero Missed Transfers**: Dual-mode (active + sleeping) ensures 24/7 coverage
2. **Automatic Failover**: Poller death triggers automatic re-election
3. **Scalable**: O(1) query complexity regardless of restaurant count
4. **Environment-Agnostic**: Works in Vercel prod/preview/dev environments
5. **Memo Filtering**: Per-restaurant memo patterns (e.g., "TABLE" keyword)
6. **LastId Tracking**: Per-restaurant, per-currency cursor for deduplication
7. **Redis Optimized** (2026-01-24): Single hash state reduces requests from 16 to 2 per poll (87% reduction)
8. **Cost Efficient**: 17k Redis requests/month (97% under Upstash free tier limit)

### Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (serverless) |
| Language | TypeScript 5 |
| Database | PostgreSQL (HAF - Hive Application Framework) |
| Cache/Pub-Sub | Upstash Redis (serverless) |
| Deployment | Vercel Pro (10s timeout) |
| Cron | Vercel Cron (1-minute) |
| DB Driver | pg (node-postgres) |

### Configuration

**Restaurant Config** (`lib/config.ts`):
```typescript
export const RESTAURANTS: RestaurantConfig[] = [
  {
    id: 'indies',
    name: 'Indies Restaurant',
    accounts: {
      prod: 'indies.cafe',
      dev: 'indies-test'
    },
    currencies: ['HBD', 'EURO', 'OCLT'],
    memoFilters: {
      HBD: '%TABLE %',
      EURO: '%TABLE %',
      OCLT: '%TABLE %'
    }
  },
  // ... more restaurants
];
```

### Vercel Deployment Constraints

**Serverless Limitations**:
- Max execution time: 10s (Vercel Pro)
- No long-running processes
- Stateless functions
- Cold starts possible

**Solutions**:
- External triggers (co page wake-up calls)
- Redis-based coordination
- Vercel Cron for fallback
- Fast queries (<1s execution)

### Future Enhancements

**Planned**:
- [ ] `/api/status` endpoint for monitoring
- [ ] Prometheus metrics export
- [ ] Transfer confirmation/acknowledgment
- [ ] Historical transfer queries
- [ ] WebSocket streaming for real-time updates

**Scaling Beyond 400 Restaurants**:
- Current LIMIT 100 (HBD) and 1000 (tokens) handles expected volume
- If spike exceeds LIMIT, next poll (6s later) catches remainder
- Transfers delayed by seconds, not lost
- Midnight-based bounds (discussed but not implemented) as future optimization

---

## 🍽️ SPOKE 1: INDIESMENU

**Repository**: `./indiesmenu` (current)
**Tech Stack**: Next.js 15 + TypeScript + Prisma + PostgreSQL
**URL**: Production: `menu.indies.lu` | Dev: `localhost:3001`

### Purpose

Indiesmenu is a **full-featured restaurant menu and ordering system** for Indies restaurant, with:
- Digital menu display
- Shopping cart and checkout
- Daily specials management
- Order history tracking
- Admin panel for menu management
- Multi-language support (FR)

### Key Features

#### 1. Menu System
- **Dynamic Menu**: Fetches menu from database with 7-day cache
- **Daily Specials**: Separate management for rotating daily dishes
- **Categories**: Soups, salads, main dishes, desserts, drinks
- **Allergen Information**: Track and display allergen info
- **Image Optimization**: Automated WebP conversion and optimization
- **Print-Friendly Display**: A3 landscape printout page (`/display/printout`)

#### 2. Payment Integration with Hub

**Payment Flows**:
- **Flow 4**: Create account only (no order) - Returns credentials to spoke
- **Flow 5**: Create account + order - Returns credentials + processes payment
- **Flow 6**: Pay with existing account (two-leg dual-currency)
- **Flow 7**: Pay with topup (unified webhook architecture)

**Integration Pattern**:
```typescript
// 1. Redirect to hub with order context
window.location.href = `${hubUrl}/?restaurant=indies&amount=${total}&table=${table}&...`;

// 2. Hub processes payment and redirects back
// Return URL: menu.indies.lu/?order_success=true&session_id=...&credential_token=...

// 3. Spoke receives credentials and updates balance
const response = await fetch(`${hubUrl}/api/account/credentials`, {
  method: 'POST',
  body: JSON.stringify({ credentialToken })
});
```

#### 3. State Management
- **CartContext**: Shopping cart with localStorage persistence
- **React Query**: Balance fetching with automatic caching and refetching
- **MiniWallet**: Display EURO balance, account name, quick topup

#### 4. Admin Panel
- **Menu Management**: CRUD operations for dishes
- **Daily Specials**: Manage rotating daily menu
- **Image Management**: Upload, match, and optimize images
- **Order Fulfillment**: Mark orders as prepared/delivered
- **Cache Control**: Manual menu cache invalidation

### API Routes

**Menu APIs**:
- `/api/menu` - Full menu with caching
- `/api/dishes` - Dish CRUD operations
- `/api/daily-specials` - Daily specials management
- `/api/admin/*` - Admin panel APIs

**Integration APIs**:
- `/api/balance/euro` - Fetch balance from Hive-Engine
- `/api/currency` - Exchange rate proxy
- `/api/fulfill` - Order fulfillment
- `/api/orders/history` - Order history

### Database Schema

**Core Models**:
- `Category` - Menu categories
- `Dish` - Menu items with pricing, allergens
- `Order` - Customer orders with items
- `DailySpecial` - Rotating daily menu items

### Key Components

- `app/menu/page.tsx` - Main menu page with cart and checkout (1600+ lines)
- `app/context/CartContext.tsx` - Shopping cart state management
- `hooks/useBalance.ts` - React Query balance hook
- `app/display/printout/page.tsx` - Printer-optimized daily specials

### Features Unique to Indiesmenu

1. **Call Waiter Button**: Uses FLOW 6 architecture to notify staff
2. **Table-Based Ordering**: URL parameter `?table=X` for table tracking
3. **Daily Specials Display**: Separate page optimized for TV/print display
4. **Menu Cache Invalidation**: Auto-invalidates on dish CRUD operations
5. **Image Optimization Scripts**: Batch processing for menu images

---

## 🥐 SPOKE 2: CROQUE-BEDAINE

**Repository**: `../croque-bedaine`
**Tech Stack**: Vite + React 18 + TypeScript + Supabase
**URL**: Dev: `localhost:8080`

### Purpose

Croque-Bedaine is a **modern Vite-based restaurant menu application** built with:
- Vite for fast development and building
- React 18 with TypeScript
- shadcn/ui component library
- Supabase for backend (database + auth)
- React Query for data fetching

### Key Differences from Indiesmenu

| Feature | Indiesmenu | Croque-Bedaine |
|---------|------------|----------------|
| **Framework** | Next.js 15 | Vite 5 |
| **Backend** | Self-hosted API routes | Supabase |
| **Database** | PostgreSQL + Prisma | Supabase (PostgreSQL) |
| **Rendering** | Server + Client | Client-side (SPA) |
| **Build Time** | Slower (Next.js) | Faster (Vite) |
| **UI Library** | Custom + Tailwind | shadcn/ui |
| **Routing** | Next.js file-based | React Router |

### Tech Stack

**Core Dependencies**:
- `vite` - Build tool and dev server
- `react` + `react-dom` - UI framework
- `@supabase/supabase-js` - Backend integration
- `@tanstack/react-query` - Data fetching and caching
- `react-router-dom` - Client-side routing
- `shadcn/ui` - Component library (40+ Radix UI components)
- `tailwindcss` - Styling
- `zod` - Schema validation
- `react-hook-form` - Form management

### Project Structure

```
croque-bedaine/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components (40+ files)
│   │   ├── CartSheet.tsx    # Shopping cart UI
│   │   ├── DrinksSection.tsx
│   │   ├── Header.tsx
│   │   ├── MenuSection.tsx
│   │   └── ...
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
├── public/                  # Static assets
├── supabase/               # Supabase config
├── vite.config.ts          # Vite configuration
└── package.json
```

### Configuration

**Vite Config**:
- Dev server on port `8080`
- Fast refresh with SWC compiler
- Path alias: `@/` → `./src/`
- Component tagging for development

### Integration with Hub (Status Unknown)

**Note**: The integration pattern with the innopay hub for this spoke is not yet evident from the codebase. This may be:
1. Not yet implemented
2. Implemented differently than indiesmenu
3. Using Supabase edge functions for hub communication

**To be documented**: How croque-bedaine integrates with innopay for payments.

---

## 💳 PAYMENT FLOWS

The hub-and-spokes architecture supports the following payment flows (as documented in `SPOKE-DOCUMENTATION.md`):

### Flow 3: Guest Checkout
**Trigger**: User without account places order and chooses guest checkout
**Process**:
1. Spoke redirects to hub with order details
2. Stripe payment processed (includes 5% processing fee, rounded up)
3. Hub executes blockchain transfer to restaurant
4. Returns to spoke with success parameters
5. No account created, one-time payment

**Special Notes**:
- Uses `gst` distriate tag (guest)
- Not eligible for Distriator cashback
- No blockchain account created

**Files**: `innopay/app/api/checkout/guest/route.ts`

### Flow 4: Create Account Only / Import Credentials
**Trigger**:
- **Variant A**: User clicks "Create Wallet" without placing an order (from restaurant)
- **Variant B**: User with existing account clicks spoke card from hub (credential import)

**Process (Variant A - Create Account)**:
1. User redirected to hub with table context
2. Completes account creation and top-up
3. Returns to spoke with `session_id` parameter
4. Spoke fetches credentials via `/api/account/credentials`
5. Credentials stored in localStorage
6. MiniWallet appears with account name and balance

**Process (Variant B - Import Credentials)**:
1. Hub creates credential session via `/api/account/create-credential-session`
2. Hub adds `credential_token` + `flow=4` to spoke URL
3. Spoke detects token and fetches credentials via `/api/account/credentials`
4. Spoke stores credentials in localStorage
5. MiniWallet appears with account name and balance (no page refresh needed)

**Credential Session Utility** (2026-01-08):
- `lib/credential-session.ts` - Reusable credential import logic
- `prepareUrlWithCredentials()` - High-level orchestration function
- Used by both main hub (`app/page.tsx`) and user page (`app/user/page.tsx`)
- Eliminates code duplication (40+ lines → 3 lines)

**React Query Balance Refresh** (2026-01-09):
- `hooks/useBalance.ts` - Custom hook for automatic balance fetching
- `app/providers/QueryProvider.tsx` - React Query configuration
- Stale-while-revalidate: Cached balance shows instantly, fresh data fetches in background
- Eliminates stale balance bug after topups

**Files**:
- Hub: `innopay/lib/credential-session.ts` (shared utility)
- Hub: `innopay/hooks/useBalance.ts` (React Query balance hook)
- Hub: `innopay/app/providers/QueryProvider.tsx` (React Query provider)
- Hub: `innopay/app/user/page.tsx` (credential handover after creation)
- Hub: `innopay/app/page.tsx` (credential import when clicking spoke card + balance display)
- Hub: `innopay/app/components/MiniWallet.tsx` (cached balance styling)
- Spoke: `indiesmenu/app/menu/page.tsx:215-468` (Flow 4 detection & handling)
- Spoke: `indiesmenu/app/menu/page.tsx:2460-2503` (unified success banner)

### Flow 5: Create Account and Pay
**Trigger**: User with no account places order and chooses "Create Account & Pay"
**Process**:
1. Spoke redirects to hub with order details
2. **If account exists in wallet**: Uses existing wallet to pay (flow 5 becomes flow 6 or 7) and returns `credential_token` for spoke to import account
3. **If no account exists**: User enters account name or accepts suggested name, payment includes order + top-up
4. Hub creates account + processes Stripe payment
5. Webhook attempts to transfer HBD to restaurant using `orderMemo` for matching
6. If insufficient HBD available, webhook transfers EURO Hive Engine tokens instead and records debt in `outstanding_debt` table
7. Hub returns credentials to spoke
8. Spoke shows success banner

**Payment Structure**:
- Payment is split: part goes to user's new account, part goes to restaurant
- Two-leg transfer: Customer → innopay → Restaurant
- Debt tracking ensures innopay can settle HBD obligations with restaurants later

**Special Notes**:
- Uses `kcs` distriate tag (eligible for Distriator cashback)
- Creates blockchain account

**Architecture**: Original flow, still supported

### Flow 6: Pay with Existing Account (Two-Leg Dual-Currency)
**Trigger**: User with existing account places order (sufficient balance)
**Process**:
1. Check if sufficient EURO balance available
2. **First leg transfer**: Customer → innopay
   - HBD transfer attempt: `orderAmount * eurUsdRate` HBD
   - If insufficient HBD → record `outstanding_debt` (customer owes innopay)
   - EURO transfer (collateral): Always succeeds
   - Signs and broadcasts via `/api/sign-and-broadcast` endpoint
   - Updates mini-wallet balance in UI
3. **Second leg transfer**: innopay → restaurant
   - Calls `/api/wallet-payment` endpoint
   - HBD transfer attempt to restaurant
   - If insufficient HBD → record `outstanding_debt` (innopay owes restaurant)
   - EURO transfer (collateral): Fallback payment method
   - Uses `orderMemo` for order matching

**Payment Structure Principles**:
- Both legs attempt HBD first (preferred by restaurants for Hive transactions)
- EURO tokens serve as collateral/fallback
- Outstanding debts tracked for later HBD reconciliation
- Ensures orders are ALWAYS fulfilled even when HBD is temporarily unavailable

**Special Notes**:
- Uses `kcs` distriate tag (eligible for Distriator cashback)
- No Stripe checkout required
- Fastest payment method (immediate confirmation)

**Implementation Status**:
- ✅ **indiesmenu**: Fully implemented and working (two-leg, dual-currency)
- ⚠️ **croque-bedaine**: Simplified single-leg transfer (TODO: upgrade to full flow)

**Architecture**: November 2025 - Two-leg dual-currency
**Status**: ✅ STABLE - DO NOT BREAK
**Files**: `indiesmenu/app/menu/page.tsx:1536-1783`

### Flow 7: Pay with Topup (Unified Webhook)
**Trigger**: User with account but insufficient EURO balance
**Process**:
1. Redirect to hub for Stripe checkout
2. User completes EUR topup
3. **Unified webhook** processes BOTH operations atomically:
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
4. Stripe redirects to: `{spoke}.innopay.lu/?order_success=true&session_id={CHECKOUT_SESSION_ID}`
5. Spoke detects `order_success=true` and `session_id`
6. Fetches credentials from `/api/account/credentials` using session_id
7. Clears cart and shows Flow 7 success banner
8. Updates mini-wallet with new balance (NO page reload)

**Key Implementation Details**:
- Atomic webhook processing: Order payment and balance update happen server-side in one webhook call
- HBD + EURO dual transfer: Always attempts HBD first, falls back to EURO tokens with debt recording
- Credential session: Webhook creates session with `euroBalance` = change after order payment
- Session ID lookup: Spoke uses Stripe `session_id` to fetch credentials
- Debt tracking: Records `outstanding_debt` when HBD transfers fail for later reconciliation

**Special Notes**:
- Uses `kcs` distriate tag (eligible for Distriator cashback)
- Most complex flow (atomic transaction with three outcomes: positive change, negative change, exact match)
- Minimum topup: 15€ (enforced in webhook)

**Architecture**: December 2025 - Unified webhook (single webhook handles topup + payment)
**Status**: ✅ PRODUCTION READY
**Files**:
- Hub: `innopay/app/api/webhooks/route.ts` (lines 379-589: handleFlow7UnifiedApproach)
- Spoke: `indiesmenu/app/menu/page.tsx:289-309` (Flow 7 success handling)
- Credentials API: `innopay/app/api/account/credentials/route.ts` (lines 72-92: sessionId lookup)

### Flow 8: Import Account
**Trigger**: User explicitly requests import functionality via "Import Account" button
**Process**:
1. User visits spoke without credentials
2. Clicks "Import Account"
3. Enters email address associated with existing Innopay account
4. System retrieves account credentials from database
5. Credentials stored in localStorage for mini-wallet
6. User can now pay with account

**Implementation Status**: ✅ IMPLEMENTED (but with naive security - needs enhancement)
**Security Note**: Current implementation is functional and tested, limited to 5 import attempts per session to prevent abuse
**Files**: `indiesmenu/app/menu/page.tsx:1060-1178`

**Future Enhancements Needed**:
- Add email verification step
- Implement 2FA or magic link authentication
- Rate limiting at server level
- Audit logging for import attempts

### Call Waiter
**Purpose**: Notify restaurant staff without payment
**Process**:
1. User clicks "Call Waiter" button
2. If user has account: Uses Flow 6 pattern - sign and broadcast locally
3. If guest: Redirects to hub for waiter call
4. Sends symbolic EURO transfer (0.020) with memo "Un serveur est appele TABLE X"
5. Blue notification banner appears

**Files**: `indiesmenu/app/menu/page.tsx:1100-1280`, `croque-bedaine/src/hooks/innopay/usePaymentFlow.ts:488-517`

---

## 🛠️ TECHNOLOGY STACK

### Hub (innopay)

| Category | Technology |
|----------|------------|
| Framework | Next.js 15.5 |
| Language | TypeScript 5 |
| Database | PostgreSQL + Prisma 6.11 |
| Payment | Stripe 18.3 |
| Blockchain | @hiveio/dhive 1.3 |
| State Management | React Query 5.x (TanStack Query) |
| Storage | Storacha (decentralized) + Bunny CDN |
| Email | Resend |
| Styling | Tailwind CSS 4 |

### Spoke 1 (indiesmenu)

| Category | Technology |
|----------|------------|
| Framework | Next.js 15.5 |
| Language | TypeScript 5 |
| Database | PostgreSQL + Prisma 6.11 |
| State | React Query 5.90 |
| Blockchain | @hiveio/dhive 1.3 |
| Image Processing | Sharp 0.34 |
| Testing | Jest 30 |
| Styling | Tailwind CSS 4 |

### Spoke 2 (croque-bedaine)

| Category | Technology |
|----------|------------|
| Build Tool | Vite 5.4 |
| Framework | React 18.3 |
| Language | TypeScript 5 |
| Backend | Supabase |
| State | React Query 5.83 |
| UI Components | shadcn/ui (Radix UI) |
| Routing | React Router 6.30 |
| Forms | React Hook Form 7.61 + Zod 3.25 |
| Styling | Tailwind CSS 3.4 |

### Common Dependencies

**All Projects Share**:
- TypeScript 5.x
- Tailwind CSS
- React Query (TanStack Query)
- Modern React (18+)

**Key Differences**:
- **Build**: Next.js (innopay, indiesmenu) vs Vite (croque-bedaine)
- **Backend**: Self-hosted API routes vs Supabase
- **Components**: Custom vs shadcn/ui library

---

## 🚀 DEVELOPMENT SETUP

### Prerequisites

- Node.js 20+ (recommended: use nvm)
- PostgreSQL (for innopay and indiesmenu)
- Supabase account (for croque-bedaine)
- npm or pnpm

### Hub Setup (innopay)

```bash
cd innopay

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials:
# - POSTGRES_URL
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - RESEND_API_KEY
# - DATABASE_URL (Prisma)

# Run database migrations
npm run migrate:dev

# Start dev server
npm run dev
# → http://localhost:3000
```

### Spoke 1 Setup (indiesmenu)

```bash
cd indiesmenu

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials:
# - POSTGRES_URL
# - NEXT_PUBLIC_HUB_URL=http://localhost:3000

# Run database migrations
npm run migrate:dev

# Start dev server
npm run dev
# → http://localhost:3001
```

### Spoke 2 Setup (croque-bedaine)

```bash
cd croque-bedaine

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with Supabase credentials:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY

# Start dev server
npm run dev
# → http://localhost:8080
```

### Development Workflow

1. **Start Hub First**: Always run innopay before spokes
2. **Environment URLs**: Spokes will automatically detect hub URL based on environment
3. **Database Migrations**: Run migrations when switching branches or after pull
4. **Testing Payments**: Use Stripe test mode with test cards
5. **Blockchain Testing**: Set `RECIPIENT_OVERRIDE` in innopay to test without real transfers

### Testing the System

**Test Flow 4 (Create Account)**:
1. Visit `http://localhost:3001/menu?table=1`
2. Click "Create Wallet" (no order)
3. Complete account creation on hub
4. Verify credentials returned to spoke
5. Check MiniWallet displays account name

**Test Flow 6 (Pay with Account)**:
1. Ensure you have an account with EURO balance
2. Add items to cart (ensure total < balance)
3. Click "Pay with Account"
4. Verify both EURO and HBD transfers execute
5. Check balance updates correctly

**Test Flow 7 (Topup + Pay)**:
1. Add items to cart (ensure total > balance)
2. Click checkout
3. Complete Stripe payment on hub
4. Verify redirect back with success
5. Check cart cleared and balance updated

---

## 📦 DEPLOYMENT

### Vercel Deployment (Recommended)

All three projects are configured for Vercel deployment.

#### Hub Deployment

```bash
cd innopay

# Build command (in Vercel settings)
npm run vercel-build
# → npx prisma migrate deploy && npx prisma generate && next build

# Environment variables needed:
# - POSTGRES_URL
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - RESEND_API_KEY
# - DATABASE_URL
# - RECIPIENT_OVERRIDE (optional, for testing)
```

**Production URL**: `wallet.innopay.lu`

#### Spoke 1 Deployment

```bash
cd indiesmenu

# Build command (in Vercel settings)
npm run vercel-build

# Environment variables needed:
# - POSTGRES_URL
# - NEXT_PUBLIC_HUB_URL=https://wallet.innopay.lu
```

**Production URL**: `indies.innopay.lu/menu`

#### Spoke 2 Deployment

```bash
cd croque-bedaine

# Build command
npm run build
# → vite build

# Environment variables needed:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_HUB_URL (for innopay integration, TBD)
```

**Note**: Croque-bedaine can be deployed to Vercel, Netlify, or any static hosting.

### Deployment Checklist

**Before Deploying**:
- [ ] Run `npm run build` locally to check for errors
- [ ] Verify all environment variables are set
- [ ] Test database migrations with `npm run migrate:deploy`
- [ ] Update Stripe webhook URLs to production
- [ ] Set `RECIPIENT_OVERRIDE` appropriately (remove for production)
- [ ] Test all payment flows in staging environment

**After Deploying**:
- [ ] Verify Stripe webhooks are receiving events
- [ ] Test end-to-end payment flows
- [ ] Check database migrations applied successfully
- [ ] Monitor error logs for issues
- [ ] Test mobile responsiveness

### Database Migrations

**Automatic Migration on Deploy**:
Both innopay and indiesmenu use `vercel-build` script that runs:
```bash
npx prisma migrate deploy && npx prisma generate && next build
```

This ensures database schema is updated before the app starts.

**Manual Migration** (if needed):
```bash
npm run migrate:deploy
```

---

## 📚 ADDITIONAL DOCUMENTATION

### Innopay Documentation
- `../innopay/PROJECT_STATUS.md` - Detailed session notes (575+ lines, historical)
- `../innopay/FLOWS.md` - Payment flow documentation (reference)

### Indiesmenu Documentation
- `./RESUME-TOMORROW.md` - Current status and next steps
- `./MIGRATION-SUMMARY.md` - Complete system status

### Code Documentation
- Both Next.js projects have extensive inline comments with architectural decision dates
- Flow implementations include visual diagrams in comments
- API routes have JSDoc comments

---

## 🔑 KEY TAKEAWAYS

### Architecture Benefits

1. **Centralized Security**: All sensitive operations (blockchain, Stripe) happen in hub
2. **Spoke Flexibility**: Each restaurant can use different tech stacks and UI/UX
3. **Reusable Infrastructure**: Hub APIs can be used by any spoke
4. **Easy Scaling**: Add new restaurants without touching existing code
5. **Maintainability**: Clear separation of concerns

### Technical Decisions

1. **Next.js for Hub + Indiesmenu**: Server-side rendering, API routes, easy deployment
2. **Vite for Croque-Bedaine**: Faster builds, modern tooling, SPA architecture
3. **Prisma ORM**: Type-safe database access, easy migrations
4. **React Query**: Smart caching, automatic refetching, optimistic updates
5. **Tailwind CSS**: Utility-first styling, consistent across projects

### Current Status (2026-01-24)

**Hub (innopay)**:
- ✅ Production ready
- ✅ All payment flows working
- ✅ Debt tracking implemented
- ✅ Credential handover working
- ✅ Dynamic spoke registry (database-driven)
- ✅ Credential import from hub → spoke (Flow 4)
- ✅ Refactored credential session utility (DRY principle)
- ✅ React Query balance refresh (auto-fetches on mount)
- ✅ Cached balance styling in MiniWallet (italic + light blue)

**Merchant-Hub (merchant-hub)**:
- ✅ Core infrastructure complete
- ✅ Batched queries implemented (O(1) scaling)
- ✅ Distributed leader election working
- ✅ Redis Streams integration complete
- ✅ Multi-environment support (prod + dev accounts)
- ✅ `to_account` field standardized (replaces `account`)
- ✅ Vercel Cron fallback configured (5-minute intervals)
- ✅ Co page integration complete (Indies & Croque)
- ✅ Transfer consumption logic implemented (XREADGROUP + XACK)
- ✅ **Redis optimization (Option 3)**: Single hash state management
  - Reduced Redis usage from 691k/month to 17k/month (97% reduction)
  - All polling state consolidated into one hash (`polling:state`)
  - 2 Redis requests per poll (down from 16)
- ✅ Environment filtering in sync endpoints
- 🔧 Status/metrics endpoints planned

**Spoke 1 (indiesmenu)**:
- ✅ Production ready
- ✅ All flows tested and working
- ✅ Balance refresh optimized
- ✅ React Query migration (Phases 1-3 complete)
- ✅ `to_account` field added to Transfer interface
- ✅ Credential import via Flow 4 (from hub)
- ✅ Flow 4 detection and handling (proper banner)
- ✅ Unified success banner (Flows 4, 5, 6, 7)
- ✅ **Merchant-hub integration complete**:
  - Co page (`/admin/current_orders`) polls merchant-hub every 6 seconds
  - Wake-up endpoint for distributed poller election
  - Redis stream consumption with auto-ACK
  - Environment filtering (prod: `indies.cafe`, dev: `indies-test`)
  - Order hydration with menu data
- 🔧 Optional optimizations remaining (Phases 4-5)

**Spoke 2 (croque-bedaine)**:
- ✅ Production ready
- ✅ Environment detection system (`lib/environment.ts`)
- ✅ `to_account` field added to Transfer interface
- ✅ Environment-based filtering (DEV: 'croque-test', PROD: 'croque.bedaine')
- ✅ Modern UI with shadcn/ui
- ✅ Vite build setup complete
- ✅ Payment state machine (`usePaymentFlow` + `paymentStateMachine.ts`)
- ✅ Flow 6 basic implementation (direct EURO transfer)
- ✅ **Merchant-hub integration complete**:
  - Co page (`/admin/CurrentOrders`) polls merchant-hub every 6 seconds
  - Wake-up endpoint for distributed poller election
  - Supabase integration for transfer storage
  - Redis stream consumption with auto-ACK
  - Environment filtering (prod: `croque.bedaine`, dev: 'croque-test')
  - Order hydration with menu data
  - Order alarm system for untransmitted dishes
- ⚠️ **TODO**: Flow 6 in croque-bedaine uses simplified single-leg transfer (Customer → Restaurant direct EURO).
  The full FLOWS.md specification (lines 181-220) describes a two-leg dual-currency system:
  1. Customer → innopay (HBD attempt + EURO collateral)
  2. innopay → restaurant (via `/api/wallet-payment`)
  This requires hub API endpoints. Current implementation works but skips HBD/debt tracking.
  Revisit after Flow 4/5 are stable.

---

## 🆘 TROUBLESHOOTING

### Common Issues

**Balance not updating after payment**:
- Check `refetchBalance()` is being called
- Verify React Query DevTools shows fresh data
- Check console for `[useBalance]` logs

**Hub not accessible from spoke**:
- Verify `NEXT_PUBLIC_HUB_URL` environment variable
- Check hub is running on correct port
- Verify CORS settings if needed

**Database migration errors**:
- Run `npx prisma generate` after pulling new migrations
- Check PostgreSQL connection string
- Verify database exists and is accessible

**Stripe webhook not working**:
- Verify webhook secret matches environment variable
- Check webhook URL is correct in Stripe dashboard
- Test with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks`

---

**Last Updated**: 2026-01-25
**Maintainer**: Development Team
**Questions**: Refer to individual project documentation or code comments

**New in 2026-01-25**:
- 🔄 **Architecture Diagram Updated**: Corrected ecosystem topology diagram to match `SPOKE-DOCUMENTATION.md`
  - Shows proper flow: Spokes → Hub → Blockchain → Merchant Hub → Spoke Admins
  - Removed incorrect separation of read/write paths
  - Simplified representation for clarity
- 🔄 **Payment Flows Reorganized**: Complete flow documentation now matches `SPOKE-DOCUMENTATION.md`
  - Flow 3: Guest Checkout (now properly documented)
  - Flow 4: Create Account Only / Import Credentials (two variants clarified)
  - Flow 5: Create Account and Pay (payment structure details added)
  - Flow 6: Pay with Existing Account (two-leg dual-currency architecture explained)
  - Flow 7: Pay with Topup (unified webhook approach detailed)
  - Flow 8: Import Account (added as separate flow)
  - Call Waiter: Moved to end, clarified as non-payment flow

**New in 2026-01-24**:
- 🆕 **Redis Optimization (Option 3)**: Single hash state management in merchant-hub
  - Consolidated all polling state (heartbeat, poller, mode, lastIds) into one Redis hash
  - Reduced from 16 Redis requests/poll to 2 requests/poll (87% reduction)
  - Monthly usage: 691k → 17k requests (97% reduction)
  - Cron interval: 1 minute → 5 minutes (additional 80% savings)
  - Total savings: Stayed under Upstash 500k free tier limit
  - Architecture: `getPollingState()` (1 HGETALL) + `updatePollingState()` (1 HMSET)
- 🆕 **Environment Filtering**: Sync endpoints filter transfers by environment
  - Indiesmenu prod filters for `indies.cafe`, dev filters for `indies-test`
  - Croque-bedaine prod filters for `croque.bedaine`, dev filters for `croque-test`
  - Prevents mixed prod/dev transfers in co pages
  - Auto-detection based on `DATABASE_URL` (indiesmenu) or explicit config (croque)
- 🆕 **Co Page Integration Complete**: Both restaurants now have working admin dashboards
  - Indies: `/admin/current_orders` with Prisma database
  - Croque: `/admin/CurrentOrders` with Supabase integration
  - Real-time order updates via merchant-hub polling
  - Order hydration with menu data
  - Kitchen transmission workflow
  - Order alarm system (croque-bedaine)

**New in 2026-01-09**:
- 🆕 React Query in Innopay Hub: Automatic balance refresh on page load, eliminates stale balance bug
- 🆕 Cached Balance Styling: MiniWallet shows italic + light blue for cached balance, normal + white for fresh
- 🆕 Flow 4 Detection Fixed: Indiesmenu properly detects `flow=4` URL parameter and handles credential imports
- 🆕 Unified Success Banner: Single banner for all flows (4, 5, 6, 7) with conditional messaging
  - Flow 4: "Votre portefeuille Innopay est prêt, vous pouvez déjà commander"
  - Flows 5/6/7: "Votre commande a été transmise et est en cours de préparation"
- 🆕 Balance Auto-Refresh Architecture:
  - Innopay: `hooks/useBalance.ts` + `app/providers/QueryProvider.tsx`
  - Stale-while-revalidate pattern: Shows cached instantly, fetches fresh in background
  - No URL parameters needed - works automatically on mount

**New in 2026-01-08**:
- 🆕 Dynamic Spoke Registry: Database-driven spoke management with `spoke` table
- 🆕 `to_account` Field Standardization: Consistent naming across merchant-hub, indiesmenu, croque-bedaine
- 🆕 Credential Import Flow: Flow 4 now works when clicking spoke cards from hub
- 🆕 Credential Session Utility: Reusable `lib/credential-session.ts` eliminates duplication
- 🆕 Environment-Based Filtering: Croque-bedaine filters transfers by DEV/PROD `to_account`
- 🆕 Spoke Management: SQL-based CRUD operations documented in `prisma/SPOKE_MANAGEMENT.md`

**Previous Updates (2026-01-02)**:
- Merchant-Hub: Centralized HAF polling infrastructure with O(1) scaling
- Batched queries: 3 total queries regardless of restaurant count
- Distributed leader election for polling coordination
- Multi-environment support (prod + dev accounts polled simultaneously)

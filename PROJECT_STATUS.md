# INNOPAY REFACTORING - PROJECT STATUS

**Last Updated**: 2025-11-14
**Session ID**: Guest Checkout Error Handling + Timestamp Fixes + Cart Composition Modal
**Status**: Desktop Testing Successful | Cart Persistence Fixed | Accurate Timestamps Implemented

---

## 🎯 PROJECT OVERVIEW

Refactoring Innopay to support two distinct user flows:
1. **Guest Checkout**: Pay with credit card → HBD transfer to restaurant (no account)
2. **Account Creation**: Create custom Hive account + top-up with bonuses

Both flows integrate with **indiesmenu** restaurant app for seamless ordering.

---

## ✅ COMPLETED (Phase 1)

### Database Schema Evolution
- ✅ Added `campaign` table for promotional campaigns
- ✅ Added `bonus` table for tracking user bonuses
- ✅ Added `guestcheckout` table for guest transactions (all lowercase for PostgreSQL compatibility)
- ✅ Added `currencyConversion` table for EUR/USD rate caching
- ✅ Migration: `20251103114536_add_campaign_bonus_guest_currency_tables`

### Currency Conversion
- ✅ `/app/api/currency/route.ts` - ECB integration
- ✅ `services/currency.ts` - Conversion utilities
- ✅ Installed `xml2js` package for XML parsing

### Hive Operations
- ✅ `transferHbd()` - Transfer HBD from innopay account
- ✅ `transferEuroTokensFromAccount()` - Transfer EURO using innopay authority
- ✅ `transferRubisTokens()` - Profile completion incentive

### Database Helpers
- ✅ Campaign functions: `getActiveCampaign()`, `getBonusCountForCampaign()`, `createBonus()`
- ✅ Guest checkout functions: `createGuestCheckout()`, `updateGuestCheckout()`, `findGuestCheckoutBySessionId()`

### API Routes
- ✅ `/app/api/checkout/guest/route.ts` - Guest checkout
- ✅ `/app/api/checkout/account/route.ts` - Account creation checkout
- ✅ `/app/api/haf-accounts/check/route.ts` - Username availability (HAF DB)
- ✅ `/app/api/session/[sessionId]/route.ts` - Session details for success page
- ✅ `/app/api/webhooks/route.ts` - **COMPLETELY REWRITTEN** (3 flows)

### Success Pages
- ✅ `/app/guest/success/page.tsx` - Guest payment confirmation
- ✅ `/app/user/success/page.tsx` - Account credentials display

### Recent Updates (2025-11-08)
- ✅ **HBD = USD Convention Verified** - No external API calls for HBD conversion
- ✅ **walletuser Enhancement** - Added `seed` and `masterPassword` fields for Indiesmenu integration
- ✅ **Database Migration** - `20251108182945_add_seed_masterpassword_to_walletuser`
- ✅ **Webhook Update** - Account creation now saves credentials to walletuser table
- ✅ **Session API Fix** - Retrieves credentials from database (no more regeneration)
- ✅ **Environment-Based Recipients** - Dev mode auto-redirects to 'indies-test' account
- ✅ **Testing Commands** - Added Windows PowerShell alternatives to curl examples
- ✅ **Guest Checkout Implementation** - Complete flow from Indiesmenu to Stripe to HBD/EURO transfer
- ✅ **PostgreSQL Compatibility** - All table names lowercase (guestcheckout, not guestCheckout)

### Major Updates (2025-11-09)

#### Discount & Fee System (Indiesmenu)
- ✅ **Discount Tracking** - Menu items now carry discount values from database to cart
  - Dishes: `discount` field added to FormattedDish type
  - Drinks: `discount` field per size in FormattedDrink type
  - Default: 1.0 (no discount), 0.9 = 10% off
- ✅ **Dual Price Calculation** - CartContext calculates two totals:
  - `getTotalEurPrice()` - With discounts (for account creation)
  - `getTotalEurPriceNoDiscount()` - Without discounts (for guest checkout)
  - `getDiscountAmount()` - Total forfeiture = (no-discount × 1.05) - with-discount
- ✅ **Guest Checkout Fee** - 5% processing fee added to guest orders
  - Communicated clearly in warning modal before payment
  - Covers Stripe credit card fees

#### Warning Modal (Indiesmenu)
- ✅ **Guest Checkout Warning** - Modal displays before guest payment:
  - Shows 5% processing fee notice (red, bold)
  - Shows discount forfeiture amount if applicable (red, bold)
  - "Continuer et payer X.XX €" button with final price
  - "Revenir pour bénéficier" button to create account instead
  - Dark grey "sad looking" aesthetic to discourage guest checkout

#### Safari/iOS UX Improvements (Indiesmenu)
- ✅ **Proactive Banner** - Safari/iOS users see blue banner on page load
  - Custom message: "Si vous n'avez pas de portefeuille compatible Innopay..."
  - Acknowledges some users might have Hive Keychain/Ecency installed
  - Reduces "Safari cannot open the page" errors
- ✅ **Draggable Banner** - Blue wallet notification banner can be repositioned
  - Touch and drag support (mobile + desktop)
  - "⋮⋮" drag handle indicator
  - Prevents covering cart content
  - Buttons (Créer un compte, Commandez sans compte, ✕) don't trigger drag
- ✅ **Smart Cart Clearing** - Prevents accidental cart loss
  - Measures blur duration to detect real app switches vs Safari errors
  - <2 seconds (Safari alert) = cart preserved
  - >2 seconds (Keychain opened) = cart cleared
  - Banner re-shows after failed protocol handler attempt

#### Payment Success Flow
- ✅ **Success Banner** - Green banner after successful Stripe payment
  - Message: "Le paiement a réussi. Votre commande est en route"
  - "OK" button to dismiss (white background, green text)
  - Auto-dismisses after 10 seconds
  - Cart cleared on success
- ✅ **URL Parameter Fix** - Stripe redirect URL corrected
  - Changed `?table=X?payment=success` → `?table=X&payment=success`
  - Proper query string concatenation with `&`

#### Bug Fixes (Innopay)
- ✅ **EURO Token Amount** - Fixed incorrect conversion in guest checkout fallback
  - Now transfers exact EUR amount (1:1 with EURO tokens)
  - Previously was double-converting through HBD
- ✅ **Environment Override** - Added to `transferEuroTokens()` function
  - Was missing recipient override for dev environment
  - Now all transfers (HBD + EURO) respect dev/prod recipient logic
- ✅ **Database Status Column** - Expanded from VARCHAR(20) to VARCHAR(30)
  - Migration: `20251109013347_expand_status_column`
  - Supports 'completed_euro_fallback' status (22 chars)
- ✅ **Next.js 15 Compatibility** - Fixed route handlers and Suspense boundaries
  - Route params now properly awaited as Promises
  - useSearchParams wrapped in Suspense components
- ✅ **CORS Configuration** - Improved cross-origin request handling
  - Dynamic origin reflection instead of wildcard
  - Proper headers on all response types (success, error, validation)

### Latest Updates (2025-11-09 Afternoon - HAF Integration)

#### Account Creation UI Enhancements

#### Two-State Payment Banner (Indiesmenu)
- ✅ **Blockchain Transaction Tracking** - Banner transitions based on blockchain status
  - **State 1 (Gold)**: "Paiement réussi! Commande en cours de transmission..."
    - Stripe payment confirmed
    - Yellow/gold gradient background with blue text
    - Spinner animation during blockchain processing
  - **State 2 (Green)**: "Votre commande a été transmise et est en cours de préparation"
    - Blockchain transactions (HBD/EURO) confirmed
    - Green gradient background with white text
    - Checkmark icon, dismissible with "OK" button
- ✅ **Status Polling** - Client polls `/api/checkout/status` every 1.5 seconds
  - Checks `guestcheckout` table for completion status
  - Max 60 attempts (90 seconds timeout)
  - Graceful timeout handling
- ✅ **Stripe Webhook Configuration** - Production webhook setup
  - Endpoint: `https://wallet.innopay.lu/api/webhooks`
  - Event: `checkout.session.completed`
  - Live Stripe keys configured in Vercel

#### Account Creation UI Enhancements (Innopay)
- ✅ **HAF Username Availability Check** - Real-time blockchain verification
  - API: `GET /api/haf-accounts/check?accountName=username`
  - Ultra-optimized: GET method, no validation, minimal payload
  - Connection pooling, 2-second timeout
  - Target response time: <500ms (typically <200ms)
  - Returns: `{ available: boolean }`
- ✅ **Username Suggestion System** - Sequential gap-finding algorithm
  - API: `GET /api/suggest-username`
  - Queries HAF database for all sequential accounts (`test000-000-XXX`, `inno000-000-XXX`)
  - Finds first available gap in sequence (e.g., if 1-18, 20 exist → suggests 19)
  - Format: `inno001-234-567` for user #1,234,567
  - **No blockchain verification needed** (data already from blockchain via HAF)
- ✅ **Lazy User Flow** - One-click account creation
  - Page loads with pre-suggested username
  - Button: "Create with suggested username"
  - No explanation text or validation toast (until user interacts)
  - Perfect for hungry customers at restaurant
- ✅ **Progressive Enhancement** - Smart UI transitions
  - User focuses input → explanation appears, button changes to "Create Innopay Account"
  - User types → validation activates (300ms debounce)
  - Draggable validation toast with touch/mouse support
  - Optimistic validation (show success immediately, check HAF in background)
- ✅ **SessionStorage Caching** - Instant render on page refresh
  - First load: Fetch from HAF → cache in sessionStorage
  - Refresh: Use cached value immediately, update in background
  - Cache cleared after successful account creation
  - Auto-cleanup on browser session end
- ✅ **Loading States** - Progressive rendering
  - Shows logo + heading while fetching suggested username
  - "Preparing your account..." spinner
  - Form appears smoothly when ready
  - No jarring field population

#### UX Polish
- ✅ **Removed Blockchain Mentions** - Simplified user-facing text
  - "Enter a desired username to create your new Innopay account" (was: "...on the Hive blockchain")
- ✅ **Draggable Toast** - Validation messages repositioned and movable
  - Starts closer to input field (y: -60px)
  - Touch and mouse drag support
  - Fixed positioning with viewport centering
  - High z-index (9999) for visibility
- ✅ **Debounce Optimization** - Faster HAF checks
  - 300ms debounce (down from 400ms/500ms)
  - More responsive feel while maintaining performance

### Latest Updates (2025-11-10 - Campaign Integration & Menu Optimization)

#### Indiesmenu Menu Caching & Performance
- ✅ **Server-Side Caching** - 7-day cache with stale-while-revalidate pattern
  - `getCachedMenuData()` function with in-memory cache
  - Never throws errors - returns stale data if fresh fetch fails
  - Background revalidation when cache is stale
- ✅ **Browser Caching** - Aggressive HTTP cache headers
  - `Cache-Control: public, max-age=10800` (3 hours)
  - `stale-while-revalidate=86400` (24 hours)
- ✅ **Error Handling** - Three-tier fallback system
  - Tier 1: Try cached data with recovery
  - Tier 2: Try direct database fetch
  - Tier 3: Return empty menu structure with HTTP 200 (never 500)
- ✅ **Fallback Data Files** - Static JSON for critical data
  - `fallback-cuissons.json` - 5 cooking levels (Bleu, Saignant, À point, Cuit, Bien cuit)
  - `fallback-ingredients.json` - 20+ ingredients (drinks, cocktails, teas)
  - Loaded when Prisma queries fail
- ✅ **Partial Prerendering (PPR)** - Instant UI skeleton
  - `MenuSkeleton` component shows structure immediately
  - Menu selector, welcome carousel, category placeholders
  - Actual menu data loads in background
- ✅ **Safari Banner Positioning** - Dynamic positioning relative to carousel
  - Positioned at full carousel height when cart is empty
  - Falls back to below menu selector when cart has items
  - Banner remains draggable

#### Innopay Campaign Integration
- ✅ **Active Campaign API** - `GET /api/campaigns/active`
  - Fetches current active campaign with bonus tiers
  - Calculates remaining slots: `maxUsers - bonusCount`
  - Returns campaign data with both 50€ and 100€ tiers
- ✅ **Enhanced Checkout API** - Campaign info in Stripe description
  - Accepts optional `campaign` parameter
  - Builds formatted description with bonus tiers
  - Stores `campaignId` in session metadata for webhook
  - Example: "🎁 Early Adopter Campaign\n• Pay 50€ → Get 5€ bonus (245 slots left)"
- ✅ **Account Creation Flow** - Stripe checkout with campaign bonuses
  - User selects amount (minimum 30€)
  - Campaign bonuses displayed with quick-select buttons
  - Redirects to Stripe with campaign info
  - Amount passed to checkout API

#### Parameter Passing (Indiesmenu → Innopay)
- ✅ **Order Amount Parameter** - Cart total sent to account creation
  - "Créer un compte" link includes `?order_amount=35.50`
  - Sets minimum top-up: `max(30, orderAmount)`
  - Initial top-up amount defaults to order total
- ✅ **Discount Parameter** - Savings amount highlighted
  - "Créer un compte" link includes `&discount=2.50` if applicable
  - Green celebration box: "🎉 Vous économisez 2.50€! 🎉"
  - Encourages account creation by showing existing discount

#### User Experience Enhancements (Innopay)
- ✅ **Campaign Bonus Display** - Yellow frame with two tiers
  - Shows remaining slots for transparency
  - Quick-select buttons: "Choisir 99€" (Tier 1), "Choisir 200€" (Tier 2)
  - Logic: Tier 1 button → `minAmount100 - 1`, Tier 2 button → `minAmount100 × 2`
- ✅ **Amount Input Field** - Flexible top-up selection
  - Label: "Montant de rechargement (EUR)"
  - Shows order amount and minimum if from restaurant
  - User can type any amount ≥ minimum
  - Campaign buttons provide quick selection
- ✅ **Aesthetic Consistency** - Matching frame styles
  - Header: Blue gradient frame (matching Innopay logo blue)
  - Discount: Green gradient frame
  - Campaign: Yellow gradient frame
  - All use `border-2` and gradient backgrounds
- ✅ **French Localization** - Complete translation
  - "Créez votre compte Innopay" (header)
  - "Choisissez un nom d'utilisateur" (input)
  - "Créer un compte Innopay avec le nom suggéré" (checkbox)
  - "Payez X€ ou plus → Recevez X€ de bonus" (campaign)
  - "X places restantes" (remaining slots)
  - "Procéder au paiement (X€)" (button)
  - All user-facing text now in French

### Latest Updates (2025-11-12 - Credential Token System & Complete Flow)

#### Secure Credential Retrieval System
- ✅ **Session Token Architecture** - Secure, one-time credential retrieval
  - New table: `accountCredentialSession` - stores all keys + euroBalance
  - Webhook creates session after account creation (5-minute expiry)
  - `GET /api/account/session?session_id=xxx` - Lookup endpoint (returns token)
  - `POST /api/account/credentials` - Retrieval endpoint (one-time use, marks retrieved)
  - Token-based flow prevents credential exposure in URLs
- ✅ **Polling Architecture** - Success page polls for webhook completion
  - Handles async webhook processing (Stripe → webhook → credentials)
  - Returns 202 (Accepted) while processing, 200 when ready
  - Client polls every 1 second until credentials available
- ✅ **Euro Balance Tracking** - User balance passed through entire flow
  - Stored in credential session: `totalEuro = amountLoaded + bonus - orderCost`
  - Returned in credentials API response
  - Passed to indiesmenu via postMessage for banner display

### Latest Updates (2025-11-13 - Returning Customer Flow)

#### Cross-Origin Credential Storage Fixed
- ✅ **localStorage Isolation Issue** - Browser localStorage is per-origin (localhost:3000 ≠ localhost:3001)
- ✅ **Credential Token Solution** - Pass credentials via URL: `?account_created=true&credential_token=xxx`
- ✅ **CORS Headers Added** - `/api/account/credentials` enables cross-origin retrieval

#### Wallet Balance Indicator (Indiesmenu)
- ✅ **Persistent Balance Display** - Shows EURO token balance from Hive-Engine API
- ✅ **No FX Risk** - EURO tokens = EURO (no EUR/USD conversion)
- ✅ **Draggable** - Touch and mouse support, starts bottom-right
- ✅ **Reopen Button** - 💰 icon when closed

#### Returning Customer Payment Flow
- ✅ **Auto-Detection** - Checks localStorage for credentials
- ✅ **EURO Transfer** - Customer → Innopay (memo = suffix only)
- ✅ **API Call** - Innopay → Restaurant with full order memo + suffix
- ✅ **Server-Side Signing** - New `/api/sign-and-broadcast` route (Node.js crypto)

#### Database Enhancements
- ✅ **`walletuser.userId`** - Track multiple accounts per email (one-to-many)
- ✅ **Backfill SQL** - Populate existing records
- ✅ **Duplicate Email Handling** - Webhook creates topup + updates links

#### New Dependencies
- ✅ **@hiveio/dhive** installed in indiesmenu

#### Comprehensive Memo Tracking
- ✅ **Timestamped Logging** - ISO timestamps at every step
  - Frontend: Memo captured from URL (lines 165-166, 487-494)
  - Checkout API: Request received + metadata added (lines 34-40, 98-105)
  - Webhook: Full metadata dump + critical warnings (lines 236-256, 369-405)
- ✅ **Critical Error Detection** - Warnings if memo missing
  - Frontend: Warning if fallback memo used
  - Checkout API: Warning if no orderMemo provided
  - Webhook: **CRITICAL ERROR** if orderCost > 0 but no memo
- ✅ **Emoji Indicators** - Quick visual scanning in logs
  - 🔄 Attempting transfer
  - ✅ Transfer successful
  - ⚠️ Warning (HBD fallback, missing data)
  - ❌ Critical error

#### Indiesmenu Success Banners
- ✅ **Three-Stage Banner Flow** - Visual feedback for account creation
  - **Yellow Banner**: "Compte créé! Paiement réussi! Commande en cours de transmission..."
    - Spinner animation, shown immediately on return
  - **Green Banner** (if no credentials): "Votre commande a été transmise"
    - Shown after 2 seconds if credentials not available
  - **Blue Banner** (with credentials): "Compte créé avec succès! 🎉"
    - Displays: accountName, masterPassword, euroBalance
    - Semi-transparent info box with grid layout
    - "OK" button to dismiss
- ✅ **PostMessage Enhanced** - euroBalance passed to indiesmenu
  - Message type: `INNOPAY_ACCOUNT_CREATED`
  - Fields: accountName, masterPassword, activeKey, postingKey, euroBalance
  - Triggers banner display with account info

#### Dynamic Host Detection
- ✅ **Request-Based URLs** - Automatic localhost/IP detection
  - Checkout APIs detect `req.headers.get('host')`
  - Stripe redirect URLs use actual request host
  - Works for: localhost, 192.168.x.x (iPhone testing), production domains
  - Fixes: "localhost" redirect when accessing from iPhone
- ✅ **Both Flows Updated**:
  - `/api/checkout/account/route.ts` - Account creation
  - `/api/checkout/guest/route.ts` - Guest checkout

---

## ⏳ TODO (Phase 2 - Frontend Integration)

### Priority 1: Critical Path
- [x] ~~**Indiesmenu Guest Checkout Integration**~~ ✅ COMPLETE
  - Discount/fee system implemented
  - Warning modal with forfeiture calculation
  - Safari/iOS UX improvements
  - Success flow working end-to-end
  - Two-state payment banner (Stripe → Blockchain)
  - Status polling for blockchain confirmation

- [x] ~~**HAF Username Availability Check**~~ ✅ COMPLETE
  - Ultra-fast GET endpoint (<500ms response)
  - Real-time validation with optimistic UX
  - Graceful fallback to post-hoc verification

- [x] ~~**Username Suggestion System**~~ ✅ COMPLETE
  - Sequential gap-finding algorithm
  - HAF database integration
  - SessionStorage caching for instant refresh
  - Progressive rendering for smooth UX

- [x] ~~**Campaign Integration & Account Creation UI**~~ ✅ COMPLETE
  - Amount input with campaign quick-select buttons
  - Order amount parameter passing from Indiesmenu
  - Discount savings display
  - French localization
  - Aesthetic consistency across frames

- [x] ~~**Secure Credential Retrieval System**~~ ✅ COMPLETE
  - Session token architecture implemented
  - One-time use, 5-minute expiry
  - Polling for async webhook completion

- [x] ~~**Account Creation Success Banners**~~ ✅ COMPLETE
  - Three-stage banner flow in indiesmenu
  - PostMessage with euroBalance
  - Account credentials display

- [ ] **TOMORROW: Debug Credential Storage & Transmission** (2-3 hours)
  - **Issue 1**: Direct access to wallet.innopay.lu/user
    - Should check localStorage for existing credentials
    - If found: Display credentials + invite profile completion (lines 951-1125)
    - If not found after indiesmenu account creation: Debug why
  - **Issue 2**: Credential transmission to indiesmenu
    - Credentials should persist in indiesmenu for next visit
    - Add comprehensive logging for postMessage flow
    - Verify localStorage storage in indiesmenu
  - Add logs to both success page and indiesmenu message handler

- [ ] **NEXT: Final Testing & Polish** (2-3 hours)
  - End-to-end test: Indiesmenu order → Account creation → Return with credentials
  - Verify memo tracking works correctly
  - Test remaining slots decrement
  - Test bonus calculation

### Priority 2: Enhancement
- [ ] **Profile Completion RUBIS Incentive** (2-3 hours)
  - Update `/api/update-hive-account` to grant RUBIS
  - Add UI to promote incentive

- [ ] **Testing** (6-8 hours)
  - Test all 3 webhook flows
  - Test HAF integration
  - Test currency conversion
  - End-to-end integration tests

### Priority 3: Operations
- [ ] **Production Deployment** (2-3 hours)
  - Run migrations on production DB
  - Configure Stripe webhooks
  - Set up monitoring

- [ ] **Admin Dashboard** (8-12 hours)
  - Campaign management
  - Guest checkout monitoring
  - Bonus distribution stats

---

## 🔧 TECHNICAL DECISIONS

### Why HAF Database?
- Real-time username availability check
- Faster than blockchain RPC calls
- Can suggest alternatives if taken

### Why EURO Token Fallback for Guest Checkout?
- Innopay has unlimited EURO supply (it's the issuer)
- HBD balance can run low
- EURO tokens can be reconciled daily with actual HBD transfers

### Why Dual Transfer for Account Creation Orders?
- HBD to restaurant (payment)
- EURO from user account to restaurant (using innopay authority)
- User's order is paid from their own balance
- Restaurant receives both HBD and EURO

### Why 30 EUR Minimum?
- Covers Hive account creation cost (3 HIVE ≈ 1 EUR)
- Provides meaningful initial balance
- Aligns with bonus campaign tiers (50/100 EUR)

### HBD = USD Convention
- **Convention**: 1 HBD = 1 USD throughout the application
- **Never fetch** HBD/USD rate from CoinGecko or any external API
- Only EUR/USD rate is fetched from ECB for credit card payments
- This simplifies conversions and aligns with HBD's stablecoin peg

### Development vs Production Recipients
- **Dev Environment** (DATABASE_URL contains "innopaydb"):
  - Transfers go to `indies-test` account
  - Automatically overrides `indies.cafe` → `indies-test`
- **Production Environment**:
  - Transfers go to actual recipients (e.g., `indies.cafe`)
- Override handled in `getRecipientForEnvironment()` (services/hive.ts)

### Walletuser Credentials Storage
- **For Indiesmenu integration**: After account creation with ≥30€ payment
- `walletuser` table stores `seed` and `masterPassword`
- Enables postMessage to send credentials back to Indiesmenu
- Session API retrieves from database (no regeneration needed)

---

## 📦 NEW PACKAGES INSTALLED

```json
{
  "dependencies": {
    "xml2js": "^0.6.2"
  },
  "devDependencies": {
    "@types/xml2js": "^0.4.14"
  }
}
```

---

## 🔐 ENVIRONMENT VARIABLES NEEDED

### Existing (verify in production)
```env
HIVE_ACTIVE_KEY_INNOPAY=...
HIVE_TICKET_HOLDER_ACCOUNT=...
HIVE_ACTIVE_KEY_TICKET_HOLDER=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
DATABASE_URL=postgresql://...
```

### New/Required
```env
HAF_CONNECTION_STRING=postgresql://[haf-server]/[database]
NEXT_PUBLIC_BASE_URL=https://innopay.lu
```

---

## 🧪 TESTING COMMANDS

> **Note for Windows users**: PowerShell's `curl` alias doesn't work the same as Unix curl. Use the PowerShell examples below.

### Test Currency API

**Bash/curl (Unix/Mac/Git Bash):**
```bash
curl http://localhost:3000/api/currency
```

**PowerShell (Windows):**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/currency" -Method Get
```

### Test Username Availability

**Bash/curl (Unix/Mac/Git Bash):**
```bash
curl -X POST http://localhost:3000/api/haf-accounts/check \
  -H "Content-Type: application/json" \
  -d '{"accountName":"testuser"}'
```

**PowerShell (Windows):**
```powershell
$body = @{
    accountName = "testuser"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/haf-accounts/check" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

### Test Guest Checkout

**Bash/curl (Unix/Mac/Git Bash):**
```bash
curl -X POST http://localhost:3000/api/checkout/guest \
  -H "Content-Type: application/json" \
  -d '{
    "hbdAmount": 15.50,
    "eurUsdRate": 1.10,
    "recipient": "indies.cafe",
    "memo": "Table 5"
  }'
```

**PowerShell (Windows):**
```powershell
$body = @{
    hbdAmount = 15.50
    eurUsdRate = 1.10
    recipient = "indies.cafe"
    memo = "Table 5"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/checkout/guest" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

### Test Account Creation

**Bash/curl (Unix/Mac/Git Bash):**
```bash
curl -X POST http://localhost:3000/api/checkout/account \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "testaccount",
    "amount": 50
  }'
```

**PowerShell (Windows):**
```powershell
$body = @{
    accountName = "testaccount"
    amount = 50
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/checkout/account" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

---

## 📚 KEY FILES REFERENCE

### Database
- `prisma/schema.prisma` - Updated with 4 new tables + walletuser enhancement
- `services/database.ts` - Campaign, bonus, guest checkout functions, walletuser helpers
- `prisma/migrations/20251108182945_add_seed_masterpassword_to_walletuser/` - New migration

### Hive Operations
- `services/hive.ts` - HBD, EURO, RUBIS transfer functions + environment-based recipient override

### Currency
- `services/currency.ts` - EUR/USD conversion utilities
- `app/api/currency/route.ts` - ECB integration

### Checkout Flows
- `app/api/checkout/guest/route.ts` - Guest checkout
- `app/api/checkout/account/route.ts` - Account creation checkout
- `app/api/webhooks/route.ts` - Main webhook handler (3 flows) + walletuser credentials storage
- `app/api/session/[sessionId]/route.ts` - Session details retrieval (now from database)

### Frontend
- `app/user/success/page.tsx` - Account creation success
- `app/guest/success/page.tsx` - Guest payment success

---

## 🚨 KNOWN ISSUES / NOTES

1. ~~**Seed regeneration in `/api/session/[sessionId]`**~~: ✅ **FIXED** - Now retrieves from database (walletuser table)

2. **No Stripe refunds implemented**: If account creation fails (username taken), webhook throws error but doesn't trigger refund. Need to implement this for production.

3. **EURO token reconciliation**: Need process for reconciling EURO tokens sent to restaurants with actual HBD balances. Daily reconciliation recommended.

4. **Profile completion detection**: Currently `/api/update-hive-account` doesn't detect first-time completion for RUBIS incentive. Need to add logic.

---

## 💡 ARCHITECTURE NOTES

### Three Webhook Flows

**Flow 1: Guest (`metadata.flow === 'guest'`)**
```
indiesmenu → /api/checkout/guest → Stripe → Webhook
→ transferHbd(recipient, amount, memo)
→ Fallback: transferEuroTokens() if HBD insufficient
```

**Flow 2: Account Creation (`metadata.flow === 'account_creation'`)**
```
/app/user → /api/checkout/account → Stripe → Webhook
→ createAndBroadcastHiveAccount(accountName)
→ Check campaign bonus eligibility
→ transferEuroTokens(amount + bonus)
→ If from indiesmenu: transferHbd() + transferEuroTokensFromAccount()
```

**Flow 3: Legacy (no `metadata.flow`)**
```
/app/page → Stripe payment link → Webhook
→ Email-based, sequential naming (test000-000-XXX)
→ Backward compatible with existing users
```

---

## 📞 INTEGRATION POINTS

### indiesmenu → innopay
1. **"Créer un compte" button**:
   - Generate token: `crypto.randomUUID()`
   - Open: `https://innopay.lu/user?token=${token}&flow=account`
   - Listen for: `postMessage({ type: 'INNOPAY_WALLET_CREATED', username, activeKey })`

2. **"Commandez sans compte" button**:
   - Fetch rate: `GET /api/currency`
   - Calculate HBD from cart total
   - POST to `/api/checkout/guest`
   - Redirect to Stripe checkout URL

### innopay → indiesmenu
- After account creation: `postMessage()` with credentials
- After guest payment: `postMessage()` with success confirmation

---

## 🎓 RESUMING THIS SESSION

1. Pull latest code from Git
2. Read this `PROJECT_STATUS.md` file
3. Review the Word document with full conversation
4. Tell Claude Code: "I want to continue the Innopay refactoring. I've completed Phase 1 (backend infrastructure). Please read PROJECT_STATUS.md and let's continue with Phase 2."

---

## 📝 CAMPAIGN SETUP (Manual)

To activate bonus campaigns, insert into database:

```sql
INSERT INTO campaign (
  name,
  "minAmount50",
  bonus50,
  "maxUsers50",
  "minAmount100",
  bonus100,
  "maxUsers100",
  active
) VALUES (
  'Launch Campaign',
  50.00,
  5.00,
  1000,
  100.00,
  10.00,
  1000,
  true
);
```

---

## 📂 FILES MODIFIED

### 2025-11-13 Session (Returning Customer Flow & Server-Side Signing)

**Innopay Repository:**
```
prisma/schema.prisma                           - Added userId to walletuser (nullable FK to innouser)
prisma/migrations/backfill_walletuser_userid.sql - NEW: SQL to populate userId from bip39seedandaccount
app/api/sign-and-broadcast/route.ts           - NEW: Server-side signing with dhive (Node crypto)
app/api/wallet-payment/route.ts               - NEW: Returning customer payment handler
app/api/account/credentials/route.ts          - Added CORS headers, OPTIONS handler
app/api/webhooks/route.ts                     - Duplicate email handling, userId logic reordered
app/user/success/page.tsx                     - Pass credential_token via URL parameter
services/database.ts                          - Added userId parameter to createWalletUser()
```

**Indiesmenu Repository:**
```
lib/utils.ts                                  - Modified generateDistriatedHiveOp (optional suffix),
                                               createEuroTransferOperation (Hive-Engine custom_json),
                                               signAndBroadcastOperation (deprecated, server-side now)
app/menu/page.tsx                             - Wallet balance indicator (draggable, touch support),
                                               reopen button, returning customer payment flow,
                                               server-side signing API calls, comprehensive logging,
                                               cross-origin credential retrieval
package.json                                  - Added @hiveio/dhive dependency
```

**Migrations Needed:**
```bash
# Innopay
npx prisma migrate dev --name add-userid-to-walletuser
npx prisma db execute --file prisma/migrations/backfill_walletuser_userid.sql
npx prisma generate

# Indiesmenu
npm install @hiveio/dhive
```

### 2025-11-12 Session (Credential Token System & Memo Tracking)

**Innopay Repository:**
```
prisma/schema.prisma                           - Added accountCredentialSession table with euroBalance
app/api/account/session/route.ts              - NEW: Lookup credential token by session_id (polling)
app/api/account/credentials/route.ts          - NEW: One-time credential retrieval with token
app/api/webhooks/route.ts                     - Moved credential session creation after bonus calc,
                                                 comprehensive memo logging with timestamps,
                                                 stores euroBalance in session
app/api/checkout/account/route.ts             - Dynamic host detection for Stripe URLs,
                                                 comprehensive memo logging
app/api/checkout/guest/route.ts               - Dynamic host detection for Stripe URLs
app/user/success/page.tsx                     - Complete rewrite: polling architecture,
                                                 credential retrieval flow, euroBalance in postMessage
app/user/page.tsx                             - Enhanced memo logging with timestamps
```

**Indiesmenu Repository:**
```
app/menu/page.tsx                             - Three-stage success banners (yellow/green/blue),
                                                 enhanced postMessage handler with euroBalance,
                                                 account credentials display in blue banner
```

**Migrations Needed:**
```bash
npx prisma migrate dev --name add-account-credential-session
npx prisma migrate dev --name add-euro-balance-to-credentials
npx prisma generate
```

### 2025-11-10 Session (Campaign Integration & Menu Optimization)

**Indiesmenu Repository:**
```
lib/data/menu.ts                           - Server-side caching, error handling, fallback files
lib/data/fallback-cuissons.json            - NEW: Static cuisson data (5 cooking levels)
lib/data/fallback-ingredients.json         - NEW: Static ingredients data (20+ items)
app/api/menu/route.ts                      - Three-tier error handling, 3-hour browser cache
app/menu/page.tsx                          - PPR skeleton, Safari banner positioning, URL params
```

**Innopay Repository:**
```
app/api/campaigns/active/route.ts          - NEW: Active campaign API with remaining slots
app/api/checkout/account/route.ts          - Campaign parameter, formatted Stripe description
app/user/page.tsx                          - Campaign display, amount input, discount savings,
                                            French localization, blue header frame, parameter parsing
```

### 2025-11-09 Session (HAF Integration)

**Innopay Repository:**
```
app/api/checkout/guest/route.ts                        - Fixed URL parameter concatenation, CORS
app/api/webhooks/route.ts                              - Fixed EURO token amount, added memo support
app/api/checkout/status/route.ts                       - NEW: Status polling endpoint
app/api/haf-accounts/check/route.ts                    - NEW: Ultra-fast HAF username check
app/api/suggest-username/route.ts                      - NEW: Sequential gap-finding algorithm
services/hive.ts                                        - Added memo parameter to transferEuroTokens()
app/user/page.tsx                                       - Complete rewrite: lazy user flow, HAF checks,
                                                          sessionStorage caching, progressive rendering
prisma/schema.prisma                                    - STATUS column VARCHAR(20)→VARCHAR(30)
prisma/migrations/20251109013347_expand_status_column/ - New migration
PROJECT_STATUS.md                                       - Updated comprehensively
```

### Indiesmenu Repository (Morning)
```
lib/data/menu.ts                    - Added discount field to dishes and drinks
app/context/CartContext.tsx         - Added getTotalEurPriceNoDiscount(), getDiscountAmount()
app/menu/page.tsx                   - Safari detection, draggable banner, smart cart clearing,
                                     guest warning modal, two-state payment banner,
                                     blockchain status polling
app/globals.css                     - Cart header styling update
```

---

## 🌐 LANGUAGE MANAGEMENT

### Current Implementation (French-only)
All user-facing text hardcoded in French. No language switching needed yet.

### Recommended Approach (Option 1 - Simple Translation Object)
When English support is needed:
```typescript
const translations = {
  fr: {
    createAccount: "Créez votre compte Innopay",
    preparing: "Préparation de votre compte...",
    proceedPayment: (amount: number) => `Procéder au paiement (${amount}€)`,
    // ...
  },
  en: {
    createAccount: "Create Your Innopay Account",
    preparing: "Preparing your account...",
    proceedPayment: (amount: number) => `Proceed to payment (€${amount})`,
    // ...
  }
};

const t = translations['fr']; // or from URL param/context
```

Benefits: Simple, TypeScript-friendly, no external dependencies
Future: Can upgrade to next-intl or React Context if needed

---

### Latest Updates (2025-11-14 - EURO Token Polling for Restaurant Backend)

#### Indiesmenu Restaurant Backend - EURO Transfer Detection
- ✅ **EURO Token Polling Endpoint** - `/api/poll-euro` created
  - Polls `hafsql.operation_custom_json_view` every 6 seconds for EURO token transfers
  - Filters for `ssc-mainnet-hive` custom_json operations with EURO transfers to restaurant account
  - Uses session-level `statement_timeout` to prevent PostgreSQL timeouts
  - Dynamic block range: queries `hafsql.haf_blocks` for current head block, searches last 10k blocks (≈8 hours)
  - Handles non-string memo fields (can be objects or other types)
  - Inserts new EURO transfers into `transfers` table with `symbol = 'EURO'`, `fulfilled = false`

- ✅ **Baseline EURO Insertion Endpoint** - `/api/baseline-euro` created
  - One-time setup endpoint to insert historical EURO transfers as fulfilled
  - Searches last 100,000 blocks (≈3.5 days) from current head block
  - Marks baseline transfers as `fulfilled = true` to establish starting point
  - Can be called with `?count=N` parameter to limit insertions

- ✅ **Frontend Dual Polling** - Modified `indiesmenu/app/page.tsx`
  - Now polls both `/api/poll-hbd` (HBD transfers) and `/api/poll-euro` (EURO transfers) every 6 seconds
  - Separate state tracking: `lastIdHbd` and `lastIdEuro`
  - Merges transfers from both sources for unified display
  - Sound alerts work for both HBD and EURO transfers

- ✅ **Database Schema** - No changes needed!
  - Both HBD and EURO transfers use same `transfers` table
  - HBD IDs: From `hafsql.operation_transfer_table.id` (e.g., 411975049738723586)
  - EURO IDs: From `hafsql.operation_custom_json_view.id` (e.g., 434348024009854994)
  - Both are BigInt, unique, no collisions

#### Technical Challenges Resolved
- ✅ **PostgreSQL Timeout Issues**
  - Issue: Default statement timeout too short for HAF view queries
  - Solution: Get dedicated client from pool, set `statement_timeout` at session level
  - `await client.query('SET statement_timeout = 60000')` before queries

- ✅ **Block Range Optimization**
  - Issue: `MAX(block_num)` query timed out and killed connections
  - Solution: Query `hafsql.haf_blocks` directly for current block (fast, indexed)
  - Dynamic ranges: last 100k blocks (baseline), last 10k blocks (polling)

- ✅ **Query Performance**
  - Issue: LIKE operations on JSON columns too slow
  - Solution: Use only indexed columns (`block_num`, `custom_id`), filter in JavaScript
  - Fetch all Hive-Engine operations, parse and filter in Node.js

- ✅ **Sort Order Bug**
  - Issue: `ORDER BY block_num DESC` returned newest blocks first, missing older EURO transfers
  - Solution: `ORDER BY block_num ASC` for baseline to get oldest transfers first
  - Increased LIMIT to 100,000 to ensure coverage

- ✅ **Non-String Memo Fields**
  - Issue: `memo.substring()` crashed when memo was object/array
  - Solution: Type-check and convert: `typeof memo === 'string' ? memo : JSON.stringify(memo)`
  - Applied to both filtering and storage logic

#### Files Modified (Indiesmenu Repository)

**Created:**
- `app/api/poll-euro/route.ts` - EURO token polling endpoint
- `app/api/baseline-euro/route.ts` - One-time baseline insertion endpoint

**Modified:**
- `app/page.tsx` - Dual polling (HBD + EURO), separate state tracking, merged display

**History Page:**
- No changes needed - already compatible with multiple symbols

---

### Latest Updates (2025-11-14 Afternoon - Guest Checkout Error Handling & Timestamp Fixes)

#### Indiesmenu Guest Checkout UX Improvements
- ✅ **Cart Persistence Fixed** - Cart now survives Stripe redirect
  - Issue: `clearCart()` called immediately after redirecting to Stripe (line 917)
  - Solution: Removed premature clearCart(), now only clears on blockchain completion or manual "Effacer" button
  - Cart stays in localStorage through entire payment flow

- ✅ **Transmission Error Banner Enhanced** - Grey error banner when blockchain timeout occurs
  - Removed warning emoji (⚠️) - cleaner appearance
  - Added two action buttons:
    - **"Commande"** (blue) - Opens modal showing cart composition
    - **"Effacer"** (red) - Clears cart and dismisses both banners
  - Buttons use muted colors: `bg-blue-500`/`bg-red-500` with `opacity-80`
  - Banner stacks below yellow "Paiement réussi!" banner (top: 60px)

- ✅ **Cart Composition Modal** - Full order details display
  - Shows item name, size, cuisson, ingredients, quantity, and price
  - Properly accesses CartItem structure: `item.options.size`, `item.options.cuisson`, `item.options.selectedIngredients`
  - Price calculation fixed: `parseFloat(item.price) * item.quantity`
  - Modal overlay with centered card, scrollable for long orders
  - Click outside or × button to close
  - High z-index (10000) for visibility

#### Timestamp Accuracy Improvements
- ✅ **EURO Transfer Timestamps** - Accurate blockchain timestamps with timezone conversion
  - Created `utcToLuxembourg()` helper function in `/api/poll-euro`
  - Fetches `timestamp` field from `hafsql.operation_custom_json_view` (available for custom_json ops)
  - Converts UTC timestamps from HAF to Luxembourg/Paris timezone (UTC+1/+2 with DST)
  - Uses `sv-SE` locale with `Europe/Luxembourg` timezone for reliable conversion
  - Changed from `new Date(transfer.timestamp)` to `utcToLuxembourg(transfer.timestamp)`
  - Preserves actual transfer time even if server is down for hours

- ⚠️ **HBD Transfer Timestamps** - Limitation in HAF database
  - `hafsql.operation_transfer_table` does NOT have a `timestamp` column
  - Currently uses `new Date()` which gives server time, not actual blockchain transfer time
  - Known limitation: If server is down, transfers retrieved later show retrieval time, not transfer time
  - TODO: Future improvement - join with `haf_blocks` or `operation_view` to get real timestamp
  - Documented in code comments for future iteration

#### Technical Benefits
- **No Data Loss**: Cart persists through payment interruptions
- **Better Error Handling**: Users can view their order and manually clear after timeout
- **Accurate EURO Timestamps**: EURO transfers show actual blockchain time, not server retrieval time
- **Timezone Consistency**: EURO timestamps display in restaurant's local timezone (Luxembourg/Paris)
- **HBD Timestamp Trade-off**: Server time used for HBD transfers (acceptable for real-time polling)

#### Files Modified (Indiesmenu Repository)

**Modified:**
- `app/menu/page.tsx`:
  - Removed `clearCart()` from line 917 (after Stripe redirect)
  - Added `clearCart()` to blockchain completion handler (line 283)
  - Added `showCartComposition` state
  - Updated grey error banner with buttons (lines 1143-1159)
  - Created cart composition modal (lines 1560-1627)
  - Fixed CartItem structure access in modal
  - Made button colors more muted with opacity

- `app/api/poll-hbd/route.ts`:
  - Added NOTE comment explaining `operation_transfer_table` has no timestamp column
  - Continues using `new Date()` for server time (known limitation)
  - TODO comment added for future improvement with block joins

- `app/api/poll-euro/route.ts`:
  - Added `utcToLuxembourg()` helper function
  - Changed `received_at: new Date()` to `received_at: utcToLuxembourg(transfer.timestamp)` (line 126)

---

**Next Session Focus**:
1. **Test Complete Guest Checkout Flow** - Desktop and mobile
   - Test successful payment → blockchain confirmation → cart cleared
   - Test timeout scenario → grey banner → "Commande" modal → "Effacer" button
   - Verify cart persists through Stripe redirect
   - Verify EURO timestamps show correct Luxembourg time (HBD uses server time)

2. **Mobile Testing** - iPhone Safari
   - Test draggable components (wallet banner, mini wallet indicator)
   - Test cart composition modal touch interactions
   - Test guest checkout warning modal
   - Test transmission error banner buttons

3. **Future Improvements**
   - **HBD Timestamp Accuracy** - Join `operation_transfer_table` with `haf_blocks` or `operation_view`
     - Get actual blockchain timestamp for HBD transfers
     - Convert to Luxembourg timezone like EURO transfers
     - Low priority since server polls every 6 seconds (acceptable latency)

4. **Production Deployment Checklist**
   - Ensure `HIVE_ACCOUNT` env var set correctly (indies.cafe in prod, indies-test in dev)
   - Verify HAF connection string (`PG_CONNECTION_STRING`) in production
   - Test both HBD and EURO polling in production environment
   - Monitor server logs for timeout errors
   - Verify Stripe webhook configuration: `stripe listen --forward-to localhost:PORT/api/webhooks`

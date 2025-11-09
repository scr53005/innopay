# INNOPAY REFACTORING - PROJECT STATUS

**Last Updated**: 2025-11-08
**Session ID**: Refactoring continuation session
**Status**: Phase 1 Complete + Clarifications Applied ✅

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

---

## ⏳ TODO (Phase 2 - Frontend Integration)

### Priority 1: Critical Path
- [ ] **Refactor `/app/user/page.tsx`** (4-6 hours)
  - Add HAF username availability check
  - Add amount input (min 30 EUR)
  - Redirect to checkout instead of direct creation
  - Remove localStorage-only approach

- [ ] **postMessage Security** (2-3 hours)
  - Implement nonce/token generation
  - Token validation before sending credentials
  - Timestamp expiry (5-minute window)

- [ ] **indiesmenu Integration** (3-4 hours)
  - Add "Créer un compte" button with token
  - Add "Commandez sans compte" button
  - Implement postMessage listeners

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

**Next Session**: Start with Priority 1 tasks (refactor `/app/user/page.tsx`, implement postMessage security, integrate with indiesmenu)

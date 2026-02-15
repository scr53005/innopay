# Innopay Business Model Brief

> **Purpose of this document**: Explain the Innopay business model to colleagues who have seen the product grow but may not have a clear picture of how it all fits together as a business. This document was drafted with Claude Code (which has full access to the codebase) and should be refined further in conversation with Claude on the web interface — in particular: working through financial projections with real numbers and stress-testing scenarios.

---

## What is Innopay?

Innopay is an **incipient digital economy** — a payment system, a savings vehicle, and a merchant efficiency tool rolled into one. It means different things to different stakeholders, and that's by design.

---

## The Stakeholders

### 1. Merchants (restaurants first)

**Why restaurants?** Restaurants have a cost structure similar to airlines: high fixed costs, low variable costs. Whether 20 or 40 people eat tonight, the rent, the chef's salary, and the electricity bill are the same. The ingredients cost more when the restaurant is fuller, but that marginal cost is small. The difference between a half-full and a full restaurant is almost pure profit.

Airlines figured this out decades ago and invested heavily in yield management and dynamic pricing to fill every seat. Restaurants haven't — they still operate with the same service model they had 50 years ago.

**The problem Innopay solves:** A restaurant has two types of customers sitting at the same tables:

- **Experience seekers** — they came for the atmosphere, the interaction with the staff, the recommendation from the waiter. They *want* to be attended to.
- **Efficiency seekers** — they're hungry, they're with friends, they have limited time. Waiting for a waiter to come, then waiting again for the bill, is friction they'd rather skip.

Without Innopay, the restaurant can only serve the first group well. The second group gets frustrated, and worse — the staff time spent on routine order-taking and bill-settling for efficiency seekers is time *not* spent giving experience seekers the attention they value.

**With Innopay**, efficiency seekers scan a QR code, order, and pay in under a minute. The staff is freed up to give experience seekers *better* service. The restaurant serves both segments well, which means more covers, happier customers, and higher profit — without hiring more staff.

**Bonus value for merchants:**
- **Zero credit card fees.** This gets restaurant owners' attention immediately.
- **Resilience.** When credit card networks go down (and they do), Innopay still works — it runs on a completely independent infrastructure (the Hive blockchain).

### 2. Customers

Customers are offered — but never forced — to:
- **Order faster** by scanning a QR code at their table
- **Pay without waiting** for the bill
- **Earn cashback** via Distriator (a Hive ecosystem loyalty program)
- **Keep a wallet** with a balance that earns interest on deposits

The 5% surcharge on guest checkout (of which Stripe takes 3%) exists as a **nudge**, not as a revenue stream. It encourages customers to create an Innopay account, after which all future payments are fee-free.

### 3. Innopay (us)

**We charge no fees to merchants. We charge no fees to customers.**

So how do we make money? **The same way a commercial bank does.**

The Hive blockchain acts as our "central bank." It issues a stablecoin (HBD, pegged 1:1 to USD) and offers a **15% annual interest rate** on HBD savings — think of it as a reverse repo rate.

Here's the cycle:

1. **Customers give us euros** (via Stripe top-ups)
2. **We give them HBD** (the digital currency they use inside Innopay)
3. **They transact** — ordering food, paying merchants
4. **Unused HBD sits in their wallets** as deposits
5. **We sweep those deposits into savings** on the blockchain, earning 15%
6. **We share a portion with depositors** (currently 15% of the 15% = ~2.25% effective rate)
7. **We keep the spread** (~12.75%) to cover our risks and costs

Our risks:
- **Liquidity risk** — customers may withdraw at any time; we need liquid reserves (currently targeting 4% of AUM)
- **Exchange rate risk** — HBD is pegged to USD, but our customers pay in EUR
- **Operational costs** — development, infrastructure, marketing, merchant onboarding

Our revenue scales with **Assets Under Management (AUM)** — the more HBD deposited in the system, the more interest we earn. This aligns our incentives: we want customers to use Innopay regularly and keep balances, which means we need to make the product genuinely useful (for both merchants and customers).

### 4. Investors

An investor lending capital to Innopay accelerates growth (more merchants onboarded, more customers acquired, faster AUM growth) in exchange for a share of the interest spread.

---

## Why This Works

The model has a virtuous cycle:

```
More merchants --> more reasons for customers to use Innopay
    --> more HBD in the system --> more AUM --> more interest revenue
        --> more resources to onboard merchants --> repeat
```

And critically: **nobody pays fees**. The revenue comes from the float, not from taxing transactions. This removes the biggest objection from both sides of the marketplace.

---

## Technical Context (for reference)

The following details are not part of the business pitch but provide context for anyone refining this document who needs to understand the mechanics.

### Architecture

Innopay is a **hub-and-spokes** system:
- **Hub** (`wallet.innopay.lu`): Central payment processor, account management, Stripe integration, blockchain operations
- **Spokes**: Individual restaurant apps (currently 2: Indies, Croque-Bedaine) that integrate with the hub for payments
- **Merchant Hub**: Centralized blockchain polling service that detects payments and notifies restaurant staff in real time
- **Liman**: Liquidity management app that handles savings optimization, interest harvesting, and debt tracking

### Payment flows

- **Guest checkout (Flow 3)**: Customer pays via Stripe, 5% fee, no account created
- **Account creation (Flow 4/5)**: Customer creates a blockchain wallet, tops up via Stripe, gets HBD
- **Pay with account (Flow 6)**: Fastest path — customer pays from wallet balance, two-leg dual-currency transfer (Customer -> innopay -> Restaurant)
- **Topup + pay (Flow 7)**: Customer tops up via Stripe and pays in one atomic operation

### Liquidity management (Liman)

Liman runs an hourly cron that, for each managed account:
- **Sweeps** excess liquid HBD into savings (to earn interest)
- **Tops up** liquid HBD when it's too low (3-day unlock from savings)
- **Harvests interest**: triggers accrual and extracts Innopay's configurable share

All operations go through an **airlock** (4-eyes review) before being broadcast to the blockchain.

### The HBD interest mechanic

- HBD (Hive Backed Dollars) is a stablecoin pegged to USD
- HBD held in savings earns interest (currently 15% APR, set by Hive witnesses/governance)
- Interest accrues continuously but is only credited when a savings operation occurs (deposit/withdraw)
- Liman triggers accrual via small "dummy" transfers, then extracts Innopay's share
- The extraction rate per account is configurable (currently 85% to Innopay, 15% to account holder)

### Current numbers (as of February 2026)

- **Restaurants onboarded**: 2 (Indies, Croque-Bedaine)
- **HBD interest rate**: 15% APR
- **Extraction rate**: 85% (Innopay keeps 85% of interest earned)
- **Depositor share**: 15% of interest earned (effectively ~2.25% APR for depositors)
- **Liquidity reserve target**: 4% of AUM
- **Savings unlock period**: 3 days (Hive blockchain rule)

### Key financial parameters

| Parameter | Value | Notes |
|---|---|---|
| HBD interest rate | 15% APR | Set by Hive governance, has been stable but can change |
| Extraction rate | 85% | Configurable per account in Liman |
| Guest checkout fee | 5% | Of which Stripe takes ~3% |
| Stripe fee (account topup) | ~3% | Paid by Innopay, absorbed as customer acquisition cost |
| EUR/USD exposure | Variable | HBD is pegged to USD, customers pay in EUR |
| Savings unlock period | 3 days | Hive blockchain rule, creates liquidity timing risk |
| Liquidity reserve | 4% of AUM | Minimum liquid HBD Innopay must hold |

---

## Areas to Develop Further

The following sections need to be fleshed out with real numbers and analysis. This is best done in conversation.

### Financial Projections

- **Revenue at different AUM levels**: What does 10k, 100k, 1M HBD in AUM produce annually?
- **Break-even analysis**: At what AUM do revenues cover operational costs?
- **Growth trajectory**: How fast can AUM grow with N restaurants and M customers per restaurant?
- **Unit economics**: What does it cost to onboard one restaurant? One customer? What's the lifetime value?

### Stress Scenarios

These are the "what could go wrong" questions that colleagues and investors will ask:

1. **HBD interest rate drops** — What if Hive governance reduces the rate from 15% to 5%? To 0%?
2. **HBD peg breaks** — What if HBD depegs from USD? (Historical precedent: it briefly traded above $1 in 2022)
3. **Bank run** — What if many customers withdraw simultaneously and we can't meet liquidity demands? (3-day unlock period creates a gap)
4. **EUR/USD moves sharply** — We hold USD-pegged assets but owe EUR to customers
5. **Hive blockchain risk** — What if the blockchain has extended downtime or a consensus failure?
6. **Regulatory risk** — Are we operating as an unlicensed bank / payment institution? What are the regulatory requirements in Luxembourg?
7. **Competition** — What if a well-funded competitor copies the model?
8. **Merchant churn** — What if restaurants stop using Innopay?
9. **Stripe dependency** — What if Stripe changes terms or increases fees?
10. **Smart contract / key security** — What if the active key is compromised?

Each scenario needs: likelihood assessment, impact severity, mitigation measures already in place, and additional mitigations to implement.

### Competitive Positioning

- **vs. SumUp / Stripe / traditional POS**: We charge zero fees to merchants (they charge 1.5-3%)
- **vs. crypto payment systems** (e.g., BitPay): We abstract the blockchain away; customers see euros, not crypto
- **vs. QR code ordering systems** (e.g., Sunday, Obypay): We're a full payment system, not just an ordering overlay on top of credit cards
- **Unique advantage**: The interest spread model means we can genuinely offer zero fees — it's not a loss leader, it's the business model

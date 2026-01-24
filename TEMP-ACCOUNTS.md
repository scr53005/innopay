# Temporary Accounts with Short Seed Phrases

This document explores alternatives to BIP39's 12-word seed phrases for generating temporary or "throw away" accounts with easily memorable 4-word (or 3-word) phrases.

---

## Background: How BIP39 Works

The `bip39.generateMnemonic()` function (used in `services/hive.ts:64`) generates a BIP39 mnemonic seed phrase.

### The Parameter: Entropy in Bits

The parameter represents **entropy size in bits**, not the number of words:

| Entropy (bits) | Words | Security Level |
|----------------|-------|----------------|
| 128            | 12    | Standard (recommended minimum) |
| 160            | 15    | Enhanced |
| 192            | 18    | High |
| 224            | 21    | Very High |
| 256            | 24    | Maximum |

### The Math Behind It

1. **Wordlist**: BIP39 uses 2048 words (2^11 = 2048)
2. **Each word encodes 11 bits** of information
3. **Checksum**: Portion of entropy bits used for checksum
   - 128 bits → 4 checksum bits → 132 total bits
   - 132 bits ÷ 11 bits/word = **12 words**

Formula: `words = (entropy_bits + checksum_bits) / 11`

### Why 12 Words is Common

- **Security**: 128 bits = ~2^128 combinations (cryptographically secure)
- **Usability**: Easier to write down and remember than 24 words
- **Balance**: Industry-standard compromise

---

## The Problem: BIP39 Doesn't Support Short Phrases

BIP39 standard only supports: 128, 160, 192, 224, 256 bits (12, 15, 18, 21, 24 words).

**We cannot generate 4-word phrases using the BIP39 standard.**

---

## Alternative Approaches for 4-Word Phrases

### 1. Use BIP39 Wordlist, But Not BIP39 Standard

Use the BIP39 wordlist (2048 words) but pick 4 random words without following the full spec:

```typescript
import * as bip39 from 'bip39';
import { randomBytes } from 'crypto';

function generateSimple4WordPhrase(): string {
  const wordlist = bip39.wordlists.EN; // 2048 words
  const words: string[] = [];

  for (let i = 0; i < 4; i++) {
    // Generate random index (0-2047)
    const randomIndex = randomBytes(2).readUInt16BE(0) % 2048;
    words.push(wordlist[randomIndex]);
  }

  return words.join(' ');
}

// Example: "umbrella oxygen laptop forest"
```

**Entropy**: ~44 bits (2048^4 ≈ 2^44 combinations)

### 2. EFF Short Wordlist (1,296 words)

Electronic Frontier Foundation's shorter, more memorable wordlist:

```typescript
// https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt

const EFF_SHORT_WORDLIST = [
  'able', 'acid', 'acre', 'acts', 'aged', /* ... 1296 words */
];

function generateEff4WordPhrase(): string {
  const words: string[] = [];

  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * 1296);
    words.push(EFF_SHORT_WORDLIST[randomIndex]);
  }

  return words.join(' ');
}

// Example: "acid lunar fish metro"
```

**Entropy**: ~41 bits (1296^4 ≈ 2^41 combinations)

### 3. Stripe-Style Approach (200-400 words)

Curated list of simple, unambiguous words:

```typescript
// Simplified wordlist - easier to type and say over phone
const SIMPLE_WORDLIST = [
  'apple', 'beach', 'cloud', 'dance', 'eagle', 'flame',
  'grape', 'house', 'island', 'jumbo', 'kite', 'lunar',
  'magic', 'ninja', 'ocean', 'piano', 'queen', 'river',
  // ... ~200-400 simple words
];

function generateStripeStylePhrase(): string {
  const words: string[] = [];

  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * SIMPLE_WORDLIST.length);
    words.push(SIMPLE_WORDLIST[randomIndex]);
  }

  return words.join('-'); // or join with spaces
}

// Example: "apple-ninja-river-cloud"
```

**Entropy**: ~31 bits (256^4 ≈ 2^32 combinations)

---

## Larger Wordlists (Better than BIP39)

### EFF Long Wordlist - 7,776 words ⭐ RECOMMENDED

The Electronic Frontier Foundation's long wordlist designed for Diceware passphrases:
- Unambiguous (no similar-sounding words)
- Memorable (concrete, vivid words)
- Typed-friendly (no special characters)

```typescript
// Download from: https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt

// 7,776 words = 6^5 (designed for 5 dice rolls)
// Entropy per word: ~12.9 bits (log2(7776))
// 4 words = ~52 bits entropy
// 3 words = ~39 bits entropy

const EFF_LARGE_WORDLIST = [
  'abacus', 'abdomen', 'abdominal', 'abide', 'abiding', 'ability',
  // ... 7,776 words total
];

function generateEff4WordPhrase(): string {
  const words: string[] = [];

  for (let i = 0; i < 4; i++) {
    const randomValue = randomBytes(2).readUInt16BE(0);
    const randomIndex = randomValue % 7776;
    words.push(EFF_LARGE_WORDLIST[randomIndex]);
  }

  return words.join(' ');
}

// Example: "mystify renovate bunny outage"
```

**Benefits over BIP39 4-word:**
- 7776^4 = ~3.6 trillion combinations
- ~52 bits of entropy (vs 44 bits with BIP39)
- **20% more security** than BIP39 4-word phrases

---

## Security Comparison

### Entropy by Approach

| Approach | Entropy | Collision Risk (1M accounts) | Best For |
|----------|---------|------------------------------|----------|
| BIP39 12-word | 128 bits | ~0% | Permanent accounts |
| 4-word (2048 list) | 44 bits | ~0.003% | Temporary accounts |
| 4-word (1296 list) | 41 bits | ~0.02% | Short-lived sessions |
| 4-word (256 list) | 32 bits | ~12% | Human verification only |
| **4-word (7776 list)** | **52 bits** | **~0.0003%** | **Temp accounts (BEST)** |

### Words by Wordlist Size

| Wordlist Size | 3 Words | 4 Words | 5 Words |
|---------------|---------|---------|---------|
| 256 (Stripe-style) | 24 bits | 32 bits | 40 bits |
| 1,296 (EFF Short) | 31 bits | 41 bits | 51 bits |
| 2,048 (BIP39) | 33 bits | 44 bits | 55 bits |
| 4,096 (custom) | 36 bits | 48 bits | 60 bits |
| **7,776 (EFF Long)** | **39 bits** | **52 bits** | **65 bits** |

---

## Recommended Implementation for Innopay

### For Temporary/Throwaway Accounts

Use **EFF Long Wordlist (7,776 words)** with either:
- **4 words** → 52 bits entropy (recommended)
- **3 words** → 39 bits entropy (for very short-lived accounts)

### Implementation

```typescript
// services/wordlists.ts (new file)

import { randomBytes } from 'crypto';

// Include the EFF long wordlist (7,776 words)
// Download from: https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt
export const EFF_LARGE_WORDLIST = [
  /* 7,776 words here */
];

/**
 * Generates a short seed phrase for temporary accounts
 * Uses EFF long wordlist (7,776 words) for better entropy
 * @param wordCount - Number of words (3 or 4)
 * @returns Space-separated word phrase
 */
export function generateTempAccountSeed(wordCount: 3 | 4 = 4): string {
  const words: string[] = [];

  for (let i = 0; i < wordCount; i++) {
    // Generate secure random index
    const randomValue = randomBytes(2).readUInt16BE(0);
    const randomIndex = randomValue % 7776;
    words.push(EFF_LARGE_WORDLIST[randomIndex]);
  }

  return words.join(' ');
}

/**
 * Generates Hive keys from a short seed phrase
 * Hashes the phrase first to ensure sufficient entropy
 */
export function generateHiveKeysFromShortSeed(
  accountName: string,
  shortSeed: string
): Keychain {
  const crypto = require('crypto');

  // Hash the short seed to get full 256 bits for key derivation
  const hashedSeed = crypto.createHash('sha256').update(shortSeed).digest('hex');

  // Use existing key generation logic
  return generateHiveKeys(accountName, hashedSeed);
}
```

### Usage in services/hive.ts

```typescript
// Add to services/hive.ts

export function getThrowAwaySeed(accountName?: string): string {
  const seed = generateTempAccountSeed(4); // 4-word phrase, 52 bits
  console.log("For temp account '"+accountName+"' generated 4-word seed: "+seed);
  return seed;
}

// Keep existing getSeed() for permanent accounts
export function getSeed(accountName?: string): string {
  const seed = bip39.generateMnemonic(128); // 12-word seed, 128 bits
  console.log("For account '"+accountName+"' generated BIP-39 seed: "+seed);
  return seed;
}
```

### Best Practices for Temporary Accounts

1. **Clear UI Indication**: Mark these as temporary/throwaway accounts
2. **Set Expiration**: Auto-expire after 24-48 hours
3. **Prefix Convention**: Use `temp-{4words}-{timestamp}` format
4. **Limited Funds**: Cap maximum balance for temp accounts
5. **Easy Upgrade Path**: Allow users to upgrade to permanent account

### Example Flow

```typescript
// For temporary guest checkout
const tempSeed = getThrowAwaySeed(); // "mystify renovate bunny outage"
const tempAccount = `temp-${Date.now()}`; // temp-1737673200000

// Display to user: "Your temporary account phrase is: mystify renovate bunny outage"
// "Write this down to access your account for the next 24 hours"
```

---

## Resources

- **EFF Long Wordlist**: https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt
- **EFF Short Wordlist**: https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt
- **BIP39 Spec**: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
- **Diceware**: https://theworld.com/~reinhold/diceware.html

---

## Conclusion

For Innopay's temporary accounts:
- **Use EFF Long Wordlist (7,776 words)**
- **4-word phrases provide 52 bits entropy** (sufficient for temporary use)
- **Hash the phrase before key derivation** to ensure full key strength
- **Clearly mark as temporary** with expiration time
- **Keep 12-word BIP39** for permanent accounts with stored funds

This approach balances **memorability** (4 easy words) with **security** (52 bits entropy) for temporary account use cases.

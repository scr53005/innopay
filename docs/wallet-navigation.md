# Wallet hub layout

The wallet home `/` and existing-wallet view `/user` share the compact Innopay logo,
title, avatar and four flag buttons. The avatar on `/` opens `/user`; the logo returns
to `/`. The existing profile editor still opens from the avatar on `/user`.

MiniWallet remains the branded balance object. On the home page, its reserved gap
is about 30% smaller (76px instead of 108px). It starts flush with the viewport's
right edge, slightly overlapping the flags, scanner action and shops title on
phones. The scanner shares that reserved space instead of adding a row below
the shops. The account page keeps its previous reserved/side position.
Minimizing keeps the purse available above BottomBanner, including its expanded
state. Cached values are presentation fallbacks only; the checkout balance and its
post-payment trust window are unchanged. An unavailable balance displays `… €`.

Shops remain accessible below the existing low-balance threshold. The faint tint
and translated reminder do not disable navigation. The shop window has room for
two 88px cards and approximately 12% of the next card. Card padding, list gaps and
window padding are 6px. Viewports up to 350px wide use 96px cards and 64px photos
to accommodate wrapped names/actions, tighter text leading and badges over the
photo corner. Other viewports keep 72px photos and inline badges beside names.
Short viewports can scroll. Flag graphics remain 26×17px inside compact 36×32px
buttons, separated by 6px and retaining the blue selection outline.
Zenbar carries an explicit translated Bucharest/Romania label. Farm opens the
directory root while retaining its coming-soon badge until its businesses are live;
its per-vendor checkout return path in the spoke registry is not changed.

The account page refreshes the associated email from the existing account/email
endpoint on standalone wallet visits. A missing browser email no longer hides an
existing database association. This display refresh does not write email into
checkout storage or run inside restaurant handoffs.

For a standalone existing wallet, `/user` provides a prominent recharge link to
`/#top-up`. History is retained below the other actions. The recharge shortcut is
omitted when restaurant context is present; header links retain that context.
No-wallet onboarding, payment handlers, Stripe requests, credential handoffs,
checkout modals and restaurant return actions retain their existing behaviour.

On the standalone home page, the form gap is 10px instead of 16px, and the amount
input's vertical padding is 6px instead of 8px. Restaurant order context retains
its previous spacing. Shop actions, coming-soon badges/alerts, the empty directory
and the processing label follow the selected FR/EN/DE/LB language.

## Known issues (2026-10-28)

The hub's [project status](../PROJECT_STATUS.md#known-issues--shop-card-navigation)
tracks the deferred shop-card/new-tab requirement and the reported Millewee Flow 4
credential-redemption/banner errors. These are not fixed by the layout changes.

## QR scanner

A centered 70px outlined scanner action sits between the flags and the shops
heading on standalone `/`, about 80% of the normal 88px MiniWallet height. It
shares the existing 76px reserved row, with MiniWallet overlapping its right-hand
portion on a phone. Without a wallet, the centered action occupies the same
compact row. It is absent when
restaurant context is present.
The action is a normal `/scan` link with `target="_blank"` and `noopener noreferrer`:
the initial tap opens a scanner tab, leaving the wallet tab available. Approved
web links automatically replace that scanner tab without a site confirmation.
This avoids asking a mobile browser to create a popup after asynchronous decoding.
The recharge button remains full width. All scanner copy follows FR/EN/DE/LB.

`qr-scanner` 1.4.2 is loaded for the camera after opening the native modal.
Image import uses lazily loaded `zxing-wasm` 3.1.6 first, with rotation, inversion,
accuracy and downscale attempts enabled; the older reader is a fallback. The
version-matched WASM binary is served locally from `public/qr/`, so images stay
on-device and decoding does not depend on a third-party CDN. Decoder diagnostics
log only engine/outcome/duration. Startup failure has its own localized message.
Camera access requires a secure context and requests the rear camera;
camera selection and torch controls appear when supported. Closing destroys the
scanner/stream and releases the page scroll lock. Closing `/scan` closes its tab
when allowed, with `/` as the fallback. Image scanning
works without camera access, including on HTTP LAN development origins.

Approved web destinations always use HTTPS and have an exact or dot-delimited
subdomain match for `innopay.lu` or `offchain.lu`. Legacy HTTP links in existing
Indies stickers are upgraded after validating the original host, credentials
and port. This preserves path/query/table while never offering HTTP navigation.
URL credentials and nonstandard ports are rejected. An approved web link is
followed immediately in the scanner tab; no wallet credentials are attached. Initial
host validation does not constrain redirects issued by an approved server.

Single-operation `hive://sign/op/…` requests support native HIVE/HBD transfers
and Hive-Engine `tokens.transfer` for EURO/LEI (`ssc-mainnet-hive`). Native amounts
use three decimal places; token quantities allow up to three. Only the saved
wallet can send, and `__signer` placeholders resolve to it. The full sender,
recipient, quantity, symbol and memo are reviewed before explicit confirmation.
Multi-operation/transaction links, other operations/contracts/tokens, callbacks,
sign-only and authority-selection options are rejected, rather than silently
changing their meaning. Optional `s` must match the saved wallet.

`POST /api/wallet/qr-transfer` revalidates the original QR and canonical operation,
requires a secure same-origin request and a user-supplied active key, and never
uses hub authority, order APIs or Stripe. Confirmation is latched against repeated
clicks. Broadcast acceptance is shown as submitted/pending, with the transaction
ID; it is not proof of token-contract execution. An uncertain network outcome
is not retried automatically. An ephemeral cross-tab notice refreshes the original
wallet's existing balance hook after 15s, without altering checkout balance
calculations or trust windows. The notice contains only the account/timestamp,
is removed immediately, and is ignored by wallets for a different account.

## Validation

Run the entire existing suite from `innopay` with `npm test`. New tests cover header
navigation, flags, zero-balance discovery, saved/pending balances, minimization,
footer coordination, profile editing, balance trust, onboarding and checkout payloads.
QR tests cover destination policy, UTF-8 decoding, the four assets, signer binding,
canonical server validation, explicit confirmation, duplicate clicks, camera
cleanup, image fallback and uncertain submissions. Agent does not run the suite.

2026-10-28: user reported 242 tests passed. Browser review covered desktop, 390px
phone width, 320px German text fit, and decoding an approved-link QR image into
the destination-review screen. Real-device camera quality and live transfers
remain manual checks. `scripts/generate-qr-scanner-fixtures.cjs` creates link and
transfer review samples; generating/scanning samples alone never sends funds.

The original image test was too narrow: a generated plain QR decoded, while the
existing rounded-finder Indies sticker did not. The stronger decoder read both
the original sticker and the user's exact table-16 photograph in local diagnostics.
Both encode HTTP despite the printed HTTPS caption. The full suite now includes
an actual WASM decode of the original sticker and HTTPS/table preservation, in
addition to mocked component/control-flow coverage. The user's photograph stays
outside the repository. Run `npm test` again for this image-reader fix.

The user confirmed the photo works in Samsung Internet after restarting the dev
server. `[QR IMAGE]` diagnostics identify file-read/import/initialization/decode
stages; async stages time out and the UI stops waiting after 28 seconds, ignoring
late results. The initial stall's exact stage was not captured. Link confirmation
was removed at the user's request; transfers retain their explicit confirmation.
The user subsequently confirmed that the complete suite passed and Samsung
image scanning opens the approved destination directly. The later placement,
right-edge docking and drag/reopen regression changes require a fresh suite run.

Manually inspect `/` and `/user` at desktop, typical phone and short phone sizes.
Check the real avatar, flag outlines, two-and-a-fraction shop cards, recharge anchor,
expanded wallet, minimized purse, and collapsed/expanded BottomBanner. Exercise
existing restaurant flows in the usual development environment before release.

import { describe, expect, it } from 'vitest';
import { canBrowsePartner, hasRestaurantContext, initialHubWalletPosition, partnerImage, partnerLocation, readSavedDisplayBalance, standaloneTopUpHref, walletPageHref } from './wallet-navigation';

describe('hub navigation stays outside restaurant payment routing', () => {
  it.each(['flow', 'restaurant', 'restaurant_account', 'table', 'order_amount', 'order_memo', 'memo', 'return_url', 'spoke_handle', 'order_id', 'topup_for'])('keeps %s in its existing checkout journey', key => {
    const search = `?${key}=value&table=12&return_url=https%3A%2F%2Fmerchant.example%2Fmenu%3Ftable%3D12`;
    expect(hasRestaurantContext(search)).toBe(true);
    expect(standaloneTopUpHref(search)).toBeNull();
    expect(walletPageHref('/user', search)).toBe(`/user${search}`);
    expect(walletPageHref('/', search)).toBe(`/${search}`);
  });
  it('links a standalone wallet to the existing recharge form without replaying Stripe flags', () => {
    expect(standaloneTopUpHref('?account_created=true')).toBe('/#top-up');
    expect(walletPageHref('/', '?topup_success=true&session_id=old-session')).toBe('/');
    expect(walletPageHref('/user', '')).toBe('/user');
  });
});

describe('display-only wallet fallback', () => {
  const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
  it('keeps a genuine zero balance visible', () => {
    expect(readSavedDisplayBalance(storage({ innopay_accountName: 'alice', innopay_lastBalance: '0' }), 'alice')).toBe(0);
  });
  it('does not borrow another account’s cached funds', () => {
    expect(readSavedDisplayBalance(storage({ innopay_accountName: 'bob', innopay_lastBalance: '45' }), 'alice')).toBeNull();
  });
  it.each(['', ' ', 'not-a-number', 'Infinity', '-1'])('does not turn invalid cache %j into a balance', raw => {
    expect(readSavedDisplayBalance(storage({ innopay_accountName: 'alice', innopay_lastBalance: raw }), 'alice')).toBeNull();
  });
  it('accepts the existing legacy account-name key', () => {
    expect(readSavedDisplayBalance(storage({ innopayAccountName: 'alice', innopay_lastBalance: '12.50' }), 'alice')).toBe(12.5);
  });
});

describe('initial wallet placement', () => {
  it.each([320, 390, 1280])('starts the home wallet against the right edge of a %ipx viewport', viewportWidth => {
    const position = initialHubWalletPosition({ left: 24, top: 104, width: 272 }, viewportWidth, true);
    expect(position.x + 196).toBe(viewportWidth);
    expect(position.y).toBe(94);
  });
  it('uses the reserved slot on narrow screens', () => {
    expect(initialHubWalletPosition({ left: 28, top: 104, width: 334 }, 390)).toEqual({ x: 97, y: 104 });
  });
  it('uses free space beside the content on wide screens', () => {
    expect(initialHubWalletPosition({ left: 376, top: 104, width: 528 }, 1280)).toEqual({ x: 920, y: 104 });
  });
});

describe('partner discovery', () => {
  it('uses the supplied photos when the registry has no image, while respecting registered replacements', () => {
    expect(partnerImage('innohatch', null)).toBe('/images/businesses/innopay-farm.jpg');
    expect(partnerImage('zenbar', null)).toBe('/images/businesses/zenbar-bucharest.jpg');
    expect(partnerImage('zenbar', '/replacement.jpg')).toBe('/replacement.jpg');
    expect(partnerImage('indies', null)).toBeNull();
  });
  it('allows the test-only Farm directory to open while preserving its readiness flag', () => {
    const farm = { id: 'innohatch', ready: false };
    expect(canBrowsePartner(farm)).toBe(true);
    expect(farm.ready).toBe(false);
    expect(canBrowsePartner({ id: 'al21', ready: false })).toBe(false);
  });
  it('labels Zenbar’s city and country in the selected language', () => {
    expect(partnerLocation('zenbar', 'fr')).toBe('Bucarest · Roumanie');
    expect(partnerLocation('zenbar', 'en')).toBe('Bucharest · Romania');
    expect(partnerLocation('zenbar', 'de')).toBe('Bukarest · Rumänien');
    expect(partnerLocation('zenbar', 'lb')).toBe('Bukarest · Rumänien');
    expect(partnerLocation('innohatch', 'fr')).toBeNull();
  });
});

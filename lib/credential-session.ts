/**
 * Credential Session Utility
 *
 * Creates a credential session for importing existing account credentials
 * from Innopay hub to a spoke application (Flow 4).
 *
 * This utility is used by:
 * - app/page.tsx (main hub) - when clicking on a spoke with existing account
 * - app/user/page.tsx (account creation page) - when clicking "Explorer" button
 */

interface CredentialKeys {
  owner: { privateKey: string; publicKey: string };
  active: { privateKey: string; publicKey: string };
  posting: { privateKey: string; publicKey: string };
  memo: { privateKey: string; publicKey: string };
}

interface CreateCredentialSessionParams {
  accountName: string;
  masterPassword: string;
  keys: CredentialKeys;
  euroBalance: number;
  email?: string;
}

interface CreateCredentialSessionResult {
  success: boolean;
  credentialToken?: string;
  error?: string;
}

/**
 * Creates a credential session by calling the API
 * Returns the credential token or null if failed
 */
export async function createCredentialSession(
  params: CreateCredentialSessionParams
): Promise<CreateCredentialSessionResult> {
  try {
    console.log('[CREDENTIAL SESSION] Creating session for account:', params.accountName);

    const response = await fetch('/api/account/create-credential-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (response.ok) {
      const data = await response.json();
      const credentialToken = data.credentialToken;

      console.log('[CREDENTIAL SESSION] Session created:', credentialToken);

      return {
        success: true,
        credentialToken
      };
    } else {
      console.error('[CREDENTIAL SESSION] Failed to create session:', response.status);
      return {
        success: false,
        error: `HTTP ${response.status}`
      };
    }
  } catch (error: any) {
    console.error('[CREDENTIAL SESSION] Error creating session:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Reads credential data from localStorage
 * Returns null if any required field is missing
 */
export function getCredentialsFromLocalStorage(): CreateCredentialSessionParams | null {
  const accountName = localStorage.getItem('innopay_accountName');
  const masterPassword = localStorage.getItem('innopay_masterPassword');
  const activePrivate = localStorage.getItem('innopay_activePrivate');
  const activePublic = localStorage.getItem('innopay_activePublic');
  const postingPrivate = localStorage.getItem('innopay_postingPrivate');
  const postingPublic = localStorage.getItem('innopay_postingPublic');
  const memoPrivate = localStorage.getItem('innopay_memoPrivate');
  const memoPublic = localStorage.getItem('innopay_memoPublic');
  const ownerPrivate = localStorage.getItem('innopay_ownerPrivate');
  const ownerPublic = localStorage.getItem('innopay_ownerPublic');
  const lastBalance = localStorage.getItem('innopay_lastBalance');
  const email = localStorage.getItem('innopay_email');

  // Check if minimum required fields exist
  if (!accountName || !masterPassword || !activePrivate || !postingPrivate || !memoPrivate) {
    return null;
  }

  return {
    accountName,
    masterPassword,
    keys: {
      owner: {
        privateKey: ownerPrivate || '',
        publicKey: ownerPublic || ''
      },
      active: {
        privateKey: activePrivate,
        publicKey: activePublic || ''
      },
      posting: {
        privateKey: postingPrivate,
        publicKey: postingPublic || ''
      },
      memo: {
        privateKey: memoPrivate,
        publicKey: memoPublic || ''
      }
    },
    euroBalance: parseFloat(lastBalance || '0'),
    email: email || undefined
  };
}

/**
 * Adds credential_token and flow marker to a spoke URL
 * Returns the modified URL string
 */
export function addCredentialTokenToUrl(
  spokeUrl: string,
  credentialToken: string,
  flowNumber: string = '4'
): string {
  const urlObj = new URL(spokeUrl);
  urlObj.searchParams.set('credential_token', credentialToken);
  urlObj.searchParams.set('account_created', 'true'); // Triggers credential fetch in spoke
  urlObj.searchParams.set('flow', flowNumber); // Flow 4: Import existing account

  return urlObj.toString();
}

/**
 * High-level function that orchestrates the entire credential import flow
 *
 * 1. Reads credentials from localStorage
 * 2. Creates credential session
 * 3. Adds token to spoke URL
 *
 * Returns the modified URL or the original URL if credentials not found/session creation failed
 */
export async function prepareUrlWithCredentials(
  spokeUrl: string,
  flowNumber: string = '4'
): Promise<string> {
  // Try to get credentials from localStorage
  const credentials = getCredentialsFromLocalStorage();

  if (!credentials) {
    console.log('[CREDENTIAL SESSION] No credentials found in localStorage, navigating without import');
    return spokeUrl;
  }

  // Create credential session
  const result = await createCredentialSession(credentials);

  if (!result.success || !result.credentialToken) {
    console.error('[CREDENTIAL SESSION] Failed to create session, navigating without credentials');
    return spokeUrl;
  }

  // Add token to URL
  const urlWithToken = addCredentialTokenToUrl(spokeUrl, result.credentialToken, flowNumber);

  console.log('[CREDENTIAL SESSION] URL prepared with credentials:', urlWithToken);

  return urlWithToken;
}

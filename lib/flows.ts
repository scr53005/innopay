/**
 * Flow Management System for Innopay
 *
 * Defines and tracks user flows through account creation, top-ups, and payments.
 * Flows are categorized as INTERNAL (stay on innopay) or EXTERNAL (from/to restaurants).
 */

// ============================================================================
// FLOW TYPE DEFINITIONS
// ============================================================================

/**
 * INTERNAL FLOWS - User interacts directly with innopay
 * Stay on wallet.innopay.lu throughout
 */
export type InternalFlow =
  | 'new_account'      // Create new account directly on innopay (no restaurant)
  | 'topup';           // Top-up existing account directly on innopay

/**
 * EXTERNAL FLOWS - User comes from restaurant (e.g., indiesmenu)
 * Return to restaurant after completion
 */
export type ExternalFlow =
  | 'guest_checkout'           // Pay as guest (no account) → Return to restaurant
  | 'create_account_only'      // Create account, no order → Return to restaurant
  | 'create_account_and_pay'   // Create account + pay order → Return to restaurant
  | 'pay_with_account'         // Pay with existing account (sufficient balance) → Return to restaurant
  | 'pay_with_topup'           // Top-up + pay order (insufficient balance) → Return to restaurant
  | 'import_account';          // Import existing Hive account (external for now)

export type Flow = InternalFlow | ExternalFlow;

// ============================================================================
// FLOW DETECTION PARAMETERS
// ============================================================================

export interface FlowContext {
  // User state
  hasLocalStorageAccount: boolean;
  accountName?: string;

  // URL/Request parameters
  table?: string | null;
  orderAmount?: string | null;
  orderMemo?: string | null;
  topupAmount?: string | null;

  // Account state (for payment flows)
  accountBalance?: number;
}

// ============================================================================
// FLOW METADATA
// ============================================================================

export interface FlowMetadata {
  flow: Flow;
  category: 'internal' | 'external';
  requiresRedirect: boolean;
  redirectTarget?: 'restaurant' | 'innopay';
  description: string;
}

export const FLOW_METADATA: Record<Flow, FlowMetadata> = {
  // INTERNAL FLOWS
  new_account: {
    flow: 'new_account',
    category: 'internal',
    requiresRedirect: false,
    redirectTarget: 'innopay',
    description: 'Create new account directly on innopay (no restaurant order)',
  },
  topup: {
    flow: 'topup',
    category: 'internal',
    requiresRedirect: false,
    redirectTarget: 'innopay',
    description: 'Top-up existing account directly on innopay',
  },

  // EXTERNAL FLOWS
  guest_checkout: {
    flow: 'guest_checkout',
    category: 'external',
    requiresRedirect: true,
    redirectTarget: 'restaurant',
    description: 'Guest checkout with no account creation',
  },
  create_account_only: {
    flow: 'create_account_only',
    category: 'external',
    requiresRedirect: true,
    redirectTarget: 'restaurant',
    description: 'Create account only, no order payment',
  },
  create_account_and_pay: {
    flow: 'create_account_and_pay',
    category: 'external',
    requiresRedirect: true,
    redirectTarget: 'restaurant',
    description: 'Create account and pay restaurant order',
  },
  pay_with_account: {
    flow: 'pay_with_account',
    category: 'external',
    requiresRedirect: true,
    redirectTarget: 'restaurant',
    description: 'Pay with existing account (sufficient balance)',
  },
  pay_with_topup: {
    flow: 'pay_with_topup',
    category: 'external',
    requiresRedirect: true,
    redirectTarget: 'restaurant',
    description: 'Top-up account and pay restaurant order',
  },
  import_account: {
    flow: 'import_account',
    category: 'external',
    requiresRedirect: true,
    redirectTarget: 'restaurant',
    description: 'Import existing Hive account',
  },
};

// ============================================================================
// FLOW DETECTION LOGIC
// ============================================================================

/**
 * Detects the current flow based on context
 * This is the single source of truth for flow detection
 */
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
    // Distinguish between guest_checkout and create_account_and_pay:
    // - guest_checkout: No account creation (no accountName provided)
    // - create_account_and_pay: Creates account (accountName provided) + pays order

    if (hasOrder && !hasLocalStorageAccount) {
      // If accountName provided, user wants to create account AND pay
      if (accountName) {
        return 'create_account_and_pay';
      }
      // Otherwise, it's a guest checkout (no account creation)
      return 'guest_checkout';
    }

    // Create account only - from restaurant but no order (just table parameter)
    if (!hasOrder && !hasLocalStorageAccount && accountName) {
      return 'create_account_only';
    }

    // Pay with account - has account with sufficient balance
    if (hasOrder && hasLocalStorageAccount && accountBalance !== undefined) {
      if (accountBalance >= parseFloat(orderAmount)) {
        return 'pay_with_account';
      } else {
        return 'pay_with_topup';
      }
    }

    // Pay with top-up - has account but insufficient balance (or no balance info)
    if (hasOrder && hasLocalStorageAccount) {
      return 'pay_with_topup';
    }
  }

  // INTERNAL FLOWS (direct innopay access)
  if (!hasRestaurantContext) {
    // Top-up - has existing account
    if (hasLocalStorageAccount) {
      return 'topup';
    }

    // New account - no existing account
    return 'new_account';
  }

  // Default fallback
  console.warn('[FLOW] Could not determine flow, defaulting to new_account', context);
  return 'new_account';
}

/**
 * Gets redirect URL based on flow
 */
export function getRedirectUrl(
  flow: Flow,
  baseUrl: string,
  params?: {
    table?: string;
    sessionId?: string;
    amount?: number;
  }
): { success: string; cancel: string} {
  const metadata = FLOW_METADATA[flow];

  if (metadata.category === 'internal') {
    // Internal flows stay on innopay
    // Include amount for optimistic balance display
    const amountParam = params?.amount ? `&amount=${params.amount}` : '';
    return {
      success: `${baseUrl}/?topup_success=true${params?.sessionId ? `&session_id=${params.sessionId}` : ''}${amountParam}`,
      cancel: `${baseUrl}/?cancelled=true`,
    };
  }

  // External flows redirect to restaurant
  let restaurantUrl = baseUrl
    .replace('wallet.innopay.lu', 'indies.innopay.lu')
    .replace('localhost:3000', 'localhost:3001');

  // Handle IP addresses for phone testing (e.g., 192.168.1.100:3000 -> 192.168.1.100:3001)
  restaurantUrl = restaurantUrl.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):3000/, '$1:3001');

  // Add /menu path if not present
  const menuUrl = restaurantUrl.endsWith('/menu') ? restaurantUrl : `${restaurantUrl}/menu`;

  // For account creation flows, add session_id to fetch credentials
  const sessionParam = (flow === 'create_account_only' || flow === 'create_account_and_pay') && params?.sessionId
    ? `&session_id=${params.sessionId}`
    : '';

  // For both account creation flows, add amount for optimistic balance
  // create_account_only: amount = total paid (order cost = 0)
  // create_account_and_pay: amount = total paid - order cost
  const amountParam = (flow === 'create_account_only' || flow === 'create_account_and_pay') && params?.amount
    ? `&amount=${params.amount}`
    : '';

  return {
    success: `${menuUrl}?${params?.table ? `table=${params.table}&` : ''}topup_success=true${sessionParam}${amountParam}`,
    cancel: `${menuUrl}?${params?.table ? `table=${params.table}&` : ''}cancelled=true`,
  };
}

/**
 * Checks if flow requires return to restaurant
 */
export function requiresRestaurantRedirect(flow: Flow): boolean {
  return FLOW_METADATA[flow].category === 'external';
}

/**
 * Gets user-friendly flow description
 */
export function getFlowDescription(flow: Flow): string {
  return FLOW_METADATA[flow].description;
}

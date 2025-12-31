import 'dotenv/config';
import * as bip39 from 'bip39';
import { PrivateKey, Client, Transaction } from '@hiveio/dhive';
import { formatAccountName } from './utils';

// Configure the Hive client to connect to a public node.
const hiveClient = new Client(['https://api.hive.blog', 'https://api.syncad.com', 'https://api.openhive.network']);
// Use a single, known-good node for better reliability.
// const hiveClient = new Client('https://api.deathwing.me');

/**
 * Override recipient for testing in dev environment
 * Convention: 1 HBD = 1 USD (never fetch from external APIs)
 * Dev environment uses 'indies-test' instead of 'indies.cafe'
 * @param {string} recipient - The original recipient
 * @returns {string} The recipient to use (overridden if in dev)
 */
export function getRecipientForEnvironment(recipient: string): string {
  // Priority 1: Explicit recipient override for testing (e.g., acceptance environment)
  const recipientOverride = process.env.RECIPIENT_OVERRIDE;
  if (recipientOverride && recipient === 'indies.cafe') {
    console.log(`[OVERRIDE] Redirecting 'indies.cafe' to '${recipientOverride}' (RECIPIENT_OVERRIDE env var)`);
    return recipientOverride;
  }

  // Priority 2: Check if we're in dev environment by checking DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL || '';
  const isDev = databaseUrl.includes('innopaydb');

  // In dev, override indies.cafe with indies-test
  if (isDev && recipient === 'indies.cafe') {
    console.log(`[DEV] Overriding recipient from 'indies.cafe' to 'indies-test'`);
    return 'indies-test';
  }

  return recipient;
}

/**
 * Defines the structure for a Keychain object, containing all necessary
 * Hive account keys derived from a seed.
 */
export type Keychain = {
  masterPassword: string;
  owner: {
    privateKey: string;
    publicKey: string;
  };
  active: {
    privateKey: string;
    publicKey: string;
  };
  posting: {
    privateKey: string;
    publicKey: string;
  };
  memo: {
    privateKey: string;
    publicKey: string;
  };
};

export function getSeed(accountName?: string): string {
  const seed = bip39.generateMnemonic(128); // 12-word seed
  console.log("For account name '"+accountName+"' generated BIP-39 seed phrase: "+seed);
  return seed;
}

/**
 * Checks if a given Hive account name already exists on the blockchain.
 * @param {string} accountName - The name of the account to check.
 * @returns {Promise<boolean>} - True if the account exists, false otherwise.
 */
export async function accountExists(accountName: string): Promise<boolean> {
  try {
    console.log('In accountExists function, checking for account:', accountName);
    const accounts = await hiveClient.database.getAccounts([accountName]);
    console.log('Received response from Hive:', accounts);
    return accounts.length > 0;
  } catch (error) {
    console.error(`Error checking for account existence on Hive: ${error}`);
    // Assume the account does not exist if the check fails to avoid false positives.
    return false;
  }
}

/**
 * Test function to ensure a connection can be made to the Hive blockchain.
 */
export async function testHiveConnection() {
  console.log('Attempting to connect to the Hive blockchain...');
  try {
    const properties = await hiveClient.database.getDynamicGlobalProperties();
    console.log('Successfully connected to Hive! Current head block is:', properties.head_block_number);
    return true;
  } catch (error) {
    console.error('Failed to connect to the Hive blockchain. Error:', error);
    return false;
  }
}

/**
 * Finds the next available account name in the sequential 'testxxx-xxx-xxx' format.
 * It starts checking from the given lastAccountName and increments until it finds an unused name on the blockchain.
 * @param {string | null} lastAccountName - The last account name from the database.
 * @returns {Promise<string>} The first available account name on the blockchain.
 */
export async function findNextAvailableAccountName(lastAccountName: string | null): Promise<string> {
  let nextNumber = lastAccountName ? parseInt(lastAccountName.slice(4).replace(/-/g, '')) : 0;
  let availableAccountName = '';

  console.log(`Starting search for next available account name from number: ${nextNumber}`);
  while (true) {
    const candidateName = formatAccountName(nextNumber);
    if (!(await accountExists(candidateName))) {
      availableAccountName = candidateName;
      console.log(`Found an available account name on the blockchain: ${availableAccountName}`);
      break;
    }
    console.log(`Account '${candidateName}' already exists, trying next...`);
    nextNumber++;
  }

  return availableAccountName;
}

export function getPostingKey(accountName: string, masterKey: string): PrivateKey {
  const postingPrivateKey = PrivateKey.fromLogin(accountName, masterKey, 'posting');
  return postingPrivateKey;
}

export function generateHiveKeys(accountName: string, seed: string): Keychain {
  const masterKey = 'P' + PrivateKey.fromSeed(seed).toString();
  console.log(`Using master key for account ${accountName} with seed ${seed}: ${masterKey}`);

  const owner = PrivateKey.fromLogin(accountName, masterKey, 'owner');
  const active = PrivateKey.fromLogin(accountName, masterKey, 'active'); 
  const posting = PrivateKey.fromLogin(accountName, masterKey, 'posting');
  const memo = PrivateKey.fromLogin(accountName, masterKey, 'memo');

  const ownerPublic = owner.createPublic().toString()
  const activePublic = active.createPublic().toString();
  const postingPublic = posting.createPublic().toString();
  const memoPublic = memo.createPublic().toString();

  let keychain: Keychain = {
    masterPassword: masterKey,
    owner: {
      privateKey: owner.toString(),
      publicKey: ownerPublic,
    },
    active: {
      privateKey: active.toString(),
      publicKey: activePublic,
    },
    posting: {
      privateKey: posting.toString(),
      publicKey: postingPublic,
    },
    memo: {
      privateKey: memo.toString(),
      publicKey: memoPublic,
    },
  };
  console.log(`Generated Hive keys for account ${accountName}:`, keychain);
  return keychain;
}

// Utility function to build the common account authority structures.
// This factors out the shared JSON parts for easier maintenance.
function buildAccountAuthorities(
  keychain: Keychain,
  fallbackAccount: string
) {
  const commonAuthorities = {
    owner: {
      weight_threshold: 1,
      account_auths: [
        [fallbackAccount, 1]
      ],
      key_auths: [
        [keychain.owner.publicKey, 1]
      ],
    },
    active: {
      weight_threshold: 1,
      account_auths: [
        [fallbackAccount, 1]
      ],
      key_auths: [
        [keychain.active.publicKey, 1]
      ],
    },
    posting: {
      weight_threshold: 1,
      account_auths: [
        [fallbackAccount, 1]
      ],
      key_auths: [
        [keychain.posting.publicKey, 1]
      ],
    },
    memo_key: keychain.memo.publicKey,
    json_metadata: '{}',
    extensions: [],
  };

  return commonAuthorities;
}

// Utility function to get the base transaction object with blockchain block details.
async function getBaseTransaction(): Promise<Transaction> {
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration
  console.log(`Using block data: Block Num: ${headBlockNumber}, Ref Num: ${refBlockNum}, Prefix: ${refBlockPrefix}`);

  return {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [],
    extensions: [],
  };
}

// Utility function to build the claimed transaction JSON using create_claimed_account.
// Prepares the transaction only if called; assumes ticketHolderAccount is available (checked by caller).
function claimed_innopay_tx(
  baseTransaction: Transaction,
  accountName: string,
  keychain: Keychain,
  ticketHolderAccount: string,
  fallbackAccount: string
): Transaction {
  const commonAuthorities = buildAccountAuthorities(keychain, fallbackAccount);

  const createClaimedOp = [
    'create_claimed_account',
    {
      creator: ticketHolderAccount,
      new_account_name: accountName,
      ...commonAuthorities,
    },
  ];

  return {
    ...baseTransaction,
    operations: [createClaimedOp as any],
  };
}

// Utility function to build the paid transaction JSON using account_create.
// Prepares the transaction only if called; assumes fallbackAccount is available (checked by caller).
function paid_innopay_tx(
  baseTransaction: Transaction,
  accountName: string,
  keychain: Keychain,
  fallbackAccount: string
): Transaction {
  const commonAuthorities = buildAccountAuthorities(keychain, fallbackAccount);

  const createPaidOp = [
    'account_create',
    {
      fee: '3.000 HIVE',
      creator: fallbackAccount,
      new_account_name: accountName,
      ...commonAuthorities,
    },
  ];

  return {
    ...baseTransaction,
    operations: [createPaidOp as any],
  };
}

// Refactored main function: Orchestrates utility calls to prepare transactions,
// then handles cascade broadcasting with optional mocking.
// Checks are kept early in the orchestrator for quick failure if neither method is viable,
// and lazy-prepared only when a path is taken, to avoid unnecessary computation.
export async function createAndBroadcastHiveAccount(
  accountName: string,
  keychain: Keychain,
  options: { mockBroadcast?: boolean; simulateClaimedFailure?: boolean } = {}
): Promise<string> {
  // --- Step 1: Securely retrieve the private keys from environment variables ---
  const ticketHolderAccount = process.env.HIVE_TICKET_HOLDER_ACCOUNT;
  const ticketHolderPrivateKey = process.env.HIVE_ACTIVE_KEY_TICKET_HOLDER;
  
  // Fallback account if the claimed account method fails
  const fallbackAccount = 'innopay';
  const fallbackPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;

  // Early check: Fail fast if neither method is viable
  if ((!ticketHolderPrivateKey || !ticketHolderAccount) && (!fallbackPrivateKey)) {
    throw new Error('Neither ticket holder nor innopay keys found in the environment.');
  }

  // --- Step 2: Prepare the base transaction ---
  const baseTransaction = await getBaseTransaction();

  // --- Step 3: Prepare the two transaction JSONs using utilities (lazy, only if creds available) ---
  let claimedTransaction: Transaction | null = null;
  if (ticketHolderPrivateKey && ticketHolderAccount) {
    claimedTransaction = claimed_innopay_tx(baseTransaction, accountName, keychain, ticketHolderAccount, fallbackAccount);
  }

  let paidTransaction: Transaction | null = null;
  if (fallbackPrivateKey) {
    paidTransaction = paid_innopay_tx(baseTransaction, accountName, keychain, fallbackAccount);
  }

  // --- Step 4: Broadcast in cascade (claimed first, paid as fallback) with mocking toggle ---
  try {
    if (claimedTransaction) {
      console.log(`Attempting to create account using 'create_claimed_account' via ${ticketHolderAccount}`);
      const signedClaimedTransaction = hiveClient.broadcast.sign(claimedTransaction, [PrivateKey.fromString(ticketHolderPrivateKey!)]);

      if (options.mockBroadcast) {
        if (options.simulateClaimedFailure) {
          throw new Error('Mock claimed account failure - triggering fallback');
        } else {
          console.log('Mock: Successfully broadcasted "create_claimed_account" transaction');
          return 'mock_claimed_tx_id';
        }
      }

      const broadcastResult = await hiveClient.broadcast.send(signedClaimedTransaction);
      console.log('Successfully broadcasted "create_claimed_account" transaction:', broadcastResult);
      return broadcastResult.id;
    } else {
      // If no claimed available, trigger fallback logic
      throw new Error('Claimed account credentials not available - falling back to paid creation');
    }
  } catch (error) {
    console.warn(`'create_claimed_account' failed, falling back to paid account creation.`);
    console.error(error);

    if (paidTransaction) {
      try {
        console.log(`Attempting to create account by paying 3 HIVE from ${fallbackAccount}`);
        const signedPaidTransaction = hiveClient.broadcast.sign(paidTransaction, [PrivateKey.fromString(fallbackPrivateKey!)]);

        if (options.mockBroadcast) {
          console.log('Mock: Successfully broadcasted paid account creation transaction');
          return 'mock_paid_tx_id';
        }

        const broadcastResult = await hiveClient.broadcast.send(signedPaidTransaction);
        console.log('Successfully broadcasted paid account creation transaction:', broadcastResult);
        return broadcastResult.id;
      } catch (paidError) {
        console.error('Paid account creation failed:', paidError);
        throw new Error(`Failed to create Hive account via paid method: ${paidError}`);
      }
    }

    // If neither method succeeded or was available
    const hasClaimed = !!(ticketHolderPrivateKey && ticketHolderAccount);
    const errorMessage = hasClaimed
      ? 'Claimed account creation failed, and fallback credentials are not available.'
      : 'Claimed account credentials not available, and fallback credentials are not available for account creation.';
    throw new Error(errorMessage);
  }
}

export async function updateHiveAccountMetadata(
  accountName: string,
  postingKey: PrivateKey,
  metadata: { name: string; about: string; website: string; location: string; avatarUri: string; backgroundUri: string }
): Promise<{ txid: string; metadata: any }> {
  // Get base transaction (reuse your existing getBaseTransaction)
  const baseTransaction = await getBaseTransaction();
  // Build JSON metadata (Hive format: profile object)
  const postingJsonMetadata = JSON.stringify({
    profile: {
      name: metadata.name,
      about: metadata.about,
      website: metadata.website,
      location: metadata.location,
      profile_image: metadata.avatarUri,
      cover_image: metadata.backgroundUri,
    },
  });  
  console.log(`Prepared posting JSON metadata for account ${accountName}:`, postingJsonMetadata);
   // Account update operation
  const updateOp = [
    'account_update2',
    {
      account: accountName,
      json_metadata: '', // Required as empty string to satisfy serialization (general metadata)
      posting_json_metadata: postingJsonMetadata,
      extensions: [],
    },
  ];

  const updateTransaction = {
    ...baseTransaction,
    operations: [updateOp as any],
  };

  // Sign with posting key (standard for metadata updates)
  const signedTransaction = hiveClient.broadcast.sign(updateTransaction, postingKey); // Assume private keys in keychain

  try {
    const broadcastResult = await hiveClient.broadcast.send(signedTransaction);
    console.log('Successfully updated Hive account metadata:', broadcastResult);
    return { txid: broadcastResult.id, metadata };
  } catch (error) {
    console.error('Failed to update Hive account metadata:', error);
    throw new Error(`Failed to update Hive account metadata: ${error}`);
  }
}

/**
 * Transfers a specified amount of 'EURO' tokens from 'innopay' to a new Hive account.
 * This function uses a custom_json operation to interact with the Hive-Engine smart contract.
 * @param {string} toAccount - The recipient's Hive account name.
 * @param {number} amountInEuro - The amount of EURO to transfer.
 * @param {string} memo - Optional custom memo for the transfer. Defaults to generic top-up message.
 * @returns {Promise<string>} The transaction ID of the transfer.
 */
export async function transferEuroTokens(toAccount: string, amountInEuro: number, memo?: string): Promise<string> {
  // --- Step 1: Override recipient for dev environment ---
  const recipient = getRecipientForEnvironment(toAccount);

  // --- Step 2: Securely retrieve the private key from environment variables ---
  const innopayPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;
  const innopayAccount = 'innopay';

  if (!innopayPrivateKey) {
    throw new Error("Missing HIVE_ACTIVE_KEY_INNOPAY environment variable.");
  }

  // --- Step 3: Construct the Hive-Engine transfer payload ---
  const transferPayload = {
    contractName: 'tokens',
    contractAction: 'transfer',
    contractPayload: {
      symbol: 'EURO',
      to: recipient,
      quantity: amountInEuro.toFixed(2), // Hive-Engine amounts are typically fixed-point with 8 decimals
      memo: memo || `Top-up via Innopay for ${amountInEuro} EUR.`,
    },
  };

  const transferOperation = [
    'custom_json',
    {
      required_auths: [innopayAccount],
      required_posting_auths: [],
      id: 'ssc-mainnet-hive', // The ID for Hive-Engine smart contracts
      json: JSON.stringify(transferPayload),
    },
  ];

  // --- Step 4: Get current blockchain block details for transaction validity ---
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

  const baseTransaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [transferOperation as any],
    extensions: [],
  };

  // --- Step 5: Sign and broadcast the transaction ---
  console.log(`Broadcasting EURO token transfer of ${amountInEuro} to account '${recipient}' (original: ${toAccount}).`);
  const signedTransaction = hiveClient.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayPrivateKey)]);
  const broadcastResult = await hiveClient.broadcast.send(signedTransaction);

  console.log("Successfully broadcasted Hive-Engine transfer transaction:", broadcastResult);
  return broadcastResult.id;
}

/**
 * Transfers HBD from 'innopay' account to a recipient
 * Used for guest checkout flow where user pays in EUR and innopay sends HBD to restaurant
 * @param {string} toAccount - The recipient's Hive account name (e.g., 'indies.cafe')
 * @param {number} amountHbd - The amount of HBD to transfer
 * @param {string} memo - The memo for the transfer (includes table info, order details)
 * @returns {Promise<string>} The transaction ID of the transfer
 */
export async function transferHbd(toAccount: string, amountHbd: number, memo: string): Promise<string> {
  // --- Step 1: Override recipient for dev environment ---
  const recipient = getRecipientForEnvironment(toAccount);

  // --- Step 2: Securely retrieve the private key from environment variables ---
  const innopayPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;
  const innopayAccount = 'innopay';

  if (!innopayPrivateKey) {
    throw new Error("Missing HIVE_ACTIVE_KEY_INNOPAY environment variable.");
  }

  // --- Step 3: Construct the HBD transfer operation ---
  const transferOperation = [
    'transfer',
    {
      from: innopayAccount,
      to: recipient,
      amount: `${amountHbd.toFixed(3)} HBD`, // HBD uses 3 decimal places
      memo: memo,
    },
  ];

  // --- Step 4: Get current blockchain block details for transaction validity ---
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

  const baseTransaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [transferOperation as any],
    extensions: [],
  };

  // --- Step 5: Sign and broadcast the transaction ---
  console.log(`Broadcasting HBD transfer of ${amountHbd.toFixed(3)} to account '${recipient}' with memo: ${memo}`);
  const signedTransaction = hiveClient.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayPrivateKey)]);
  const broadcastResult = await hiveClient.broadcast.send(signedTransaction);

  console.log("Successfully broadcasted HBD transfer transaction:", broadcastResult);
  return broadcastResult.id;
}

/**
 * Transfers HBD from a specified account to innopay (using innopay's active authority)
 * Used when customer needs to pay HBD to innopay for restaurant orders
 * @param {string} fromAccount - The sender's Hive account name (customer account)
 * @param {string} toAccount - The recipient's Hive account name (usually 'innopay')
 * @param {number} amountHbd - The amount of HBD to transfer
 * @param {string} memo - The memo for the transfer
 * @returns {Promise<string>} The transaction ID of the transfer
 */
export async function transferHbdFromAccount(
  fromAccount: string,
  toAccount: string,
  amountHbd: number,
  memo: string
): Promise<string> {
  // --- Step 1: Override recipient for dev environment ---
  const recipient = getRecipientForEnvironment(toAccount);

  // --- Step 2: Securely retrieve the innopay private key (has active authority over customer accounts) ---
  const innopayPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;

  if (!innopayPrivateKey) {
    throw new Error("Missing HIVE_ACTIVE_KEY_INNOPAY environment variable.");
  }

  // --- Step 3: Construct the HBD transfer operation ---
  const transferOperation = [
    'transfer',
    {
      from: fromAccount, // Transfer FROM the customer account
      to: recipient,
      amount: `${amountHbd.toFixed(3)} HBD`, // HBD uses 3 decimal places
      memo: memo,
    },
  ];

  // --- Step 4: Get current blockchain block details for transaction validity ---
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

  const baseTransaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [transferOperation as any],
    extensions: [],
  };

  // --- Step 5: Sign and broadcast the transaction using innopay's authority ---
  console.log(`Broadcasting HBD transfer of ${amountHbd.toFixed(3)} from '${fromAccount}' to '${recipient}' with memo: ${memo}`);
  const signedTransaction = hiveClient.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayPrivateKey)]);
  const broadcastResult = await hiveClient.broadcast.send(signedTransaction);

  console.log("Successfully broadcasted HBD transfer from account:", broadcastResult);
  return broadcastResult.id;
}

/**
 * Transfers EURO tokens from a specified account (using innopay authority)
 * Used when a newly created account needs to pay for their order using their EURO balance
 * @param {string} fromAccount - The sender's Hive account name (newly created account)
 * @param {string} toAccount - The recipient's Hive account name (e.g., 'indies.cafe')
 * @param {number} amountInEuro - The amount of EURO to transfer
 * @param {string} memo - The memo for the transfer (includes order details)
 * @returns {Promise<string>} The transaction ID of the transfer
 */
export async function transferEuroTokensFromAccount(
  fromAccount: string,
  toAccount: string,
  amountInEuro: number,
  memo: string
): Promise<string> {
  // --- Step 1: Override recipient for dev environment ---
  const recipient = getRecipientForEnvironment(toAccount);

  // --- Step 2: Securely retrieve the innopay private key (has active authority over new accounts) ---
  const innopayPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;

  if (!innopayPrivateKey) {
    throw new Error("Missing HIVE_ACTIVE_KEY_INNOPAY environment variable.");
  }

  // --- Step 3: Construct the Hive-Engine transfer payload ---
  const transferPayload = {
    contractName: 'tokens',
    contractAction: 'transfer',
    contractPayload: {
      symbol: 'EURO',
      to: recipient,
      quantity: amountInEuro.toFixed(2),
      memo: memo,
    },
  };

  const transferOperation = [
    'custom_json',
    {
      required_auths: [fromAccount], // Transfer FROM the new account
      required_posting_auths: [],
      id: 'ssc-mainnet-hive',
      json: JSON.stringify(transferPayload),
    },
  ];

  // --- Step 4: Get current blockchain block details for transaction validity ---
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

  const baseTransaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [transferOperation as any],
    extensions: [],
  };

  // --- Step 5: Sign and broadcast the transaction using innopay's authority ---
  console.log(`Broadcasting EURO token transfer of ${amountInEuro} from '${fromAccount}' to '${recipient}'.`);
  const signedTransaction = hiveClient.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayPrivateKey)]);
  const broadcastResult = await hiveClient.broadcast.send(signedTransaction);

  console.log("Successfully broadcasted EURO transfer from account:", broadcastResult);
  return broadcastResult.id;
}

/**
 * Transfers RUBIS tokens to incentivize profile completion
 * RUBIS is another Hive-Engine token issued by innopay
 * @param {string} toAccount - The recipient's Hive account name
 * @param {number} amountInRubis - The amount of RUBIS to transfer
 * @returns {Promise<string>} The transaction ID of the transfer
 */
export async function transferRubisTokens(toAccount: string, amountInRubis: number): Promise<string> {
  // --- Step 1: Securely retrieve the private key from environment variables ---
  const innopayPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;
  const innopayAccount = 'innopay';

  if (!innopayPrivateKey) {
    throw new Error("Missing HIVE_ACTIVE_KEY_INNOPAY environment variable.");
  }

  // --- Step 2: Construct the Hive-Engine transfer payload ---
  const transferPayload = {
    contractName: 'tokens',
    contractAction: 'transfer',
    contractPayload: {
      symbol: 'RUBIS',
      to: toAccount,
      quantity: amountInRubis.toFixed(2),
      memo: `Profile completion bonus - thank you for completing your Innopay profile!`,
    },
  };

  const transferOperation = [
    'custom_json',
    {
      required_auths: [innopayAccount],
      required_posting_auths: [],
      id: 'ssc-mainnet-hive',
      json: JSON.stringify(transferPayload),
    },
  ];

  // --- Step 3: Get current blockchain block details for transaction validity ---
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

  const baseTransaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [transferOperation as any],
    extensions: [],
  };

  // --- Step 4: Sign and broadcast the transaction ---
  console.log(`Broadcasting RUBIS token transfer of ${amountInRubis} to account '${toAccount}'.`);
  const signedTransaction = hiveClient.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayPrivateKey)]);
  const broadcastResult = await hiveClient.broadcast.send(signedTransaction);

  console.log("Successfully broadcasted RUBIS transfer transaction:", broadcastResult);
  return broadcastResult.id;
}
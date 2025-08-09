import 'dotenv/config';
import * as bip39 from 'bip39';
import { PrivateKey, Client, Transaction } from '@hiveio/dhive';
import { formatAccountName } from './utils';

// Configure the Hive client to connect to a public node.
const hiveClient = new Client(['https://api.hive.blog', 'https://api.syncad.com', 'https://api.openhive.network']);

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
async function accountExists(accountName: string): Promise<boolean> {
  try {
    const accounts = await hiveClient.database.getAccounts([accountName]);
    return accounts.length > 0;
  } catch (error) {
    console.error(`Error checking for account existence on Hive: ${error}`);
    // Assume the account does not exist if the check fails to avoid false positives.
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

// This function handles the blockchain transaction creation and broadcasting.
// It tries to create a new account using a "claim token" from `creatorAccount`.
// If that fails, it falls back to creating the account by paying 3 HIVE from `fallbackAccount`.
export async function createAndBroadcastHiveAccount(accountName: string, seed: string): Promise<string> {
  // --- Step 1: Securely retrieve the private keys from environment variables ---
  const ticketHolderAccount = process.env.HIVE_TICKET_HOLDER_ACCOUNT // || 'sorin.cristescu';
  const ticketHolderPrivateKey = process.env.HIVE_ACTIVE_KEY_TICKET_HOLDER;
  
  // Fallback account if the claimed account method fails
  const fallbackAccount = 'innopay';
  const fallbackPrivateKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;

  if ((!ticketHolderPrivateKey) && (!fallbackPrivateKey)) {
    throw new Error('Neither ticket holder nor innopay keys found in the environment.');
  }

  // const seed = getSeed(accountName);
  const masterKey = 'P' + PrivateKey.fromSeed(seed).toString();
  console.log(`Using master key for account ${accountName} with seed ${seed}: ${masterKey}`);

  const owner = PrivateKey.fromLogin(accountName, masterKey, 'owner');
  const active = PrivateKey.fromLogin(accountName, masterKey, 'active'); 
  const posting = PrivateKey.fromLogin(accountName, masterKey, 'posting');
  const memo = PrivateKey.fromLogin(accountName, masterKey, 'memo');

  const publicKeys = {
    owner: owner.createPublic().toString(),
    active: active.createPublic().toString(),
    posting: posting.createPublic().toString(),
    memo: memo.createPublic().toString(),
  };

  // --- Step 2: Get current blockchain block details for transaction validity ---
  const dynamicGlobalProperties = await hiveClient.database.getDynamicGlobalProperties();
  const headBlockId = dynamicGlobalProperties.head_block_id;
  const headBlockNumber = dynamicGlobalProperties.head_block_number;
  
  const refBlockNum = headBlockNumber & 0xffff;
  const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration
  console.log(`Using block data: Block Num: ${headBlockNumber}, Ref Num: ${refBlockNum}, Prefix: ${refBlockPrefix}`);

  // --- Step 3: Prepare and try to broadcast the transaction ---
  const baseTransaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
    operations: [],
    extensions: [],
  };

  let broadcastResult;
  let triedClaimedAccount = false;

  // Attempt claimed account creation if ticketHolder credentials are available
  if (ticketHolderPrivateKey && ticketHolderAccount) {
    triedClaimedAccount = true;
    try {
      console.log(`Attempting to create account using 'create_claimed_account' via ${ticketHolderAccount}`);
      const createClaimedOp = [
        'create_claimed_account',
        {
          creator: ticketHolderAccount,
          new_account_name: accountName,
          owner: {
            weight_threshold: 1,
            account_auths: [
              [fallbackAccount, 1]
            ], // Add fallback account as active authority
            key_auths: [
              [publicKeys.owner, 1]
            ],
          },
          active: {
            weight_threshold: 1,
            account_auths: [
              [fallbackAccount, 1] // Add the fallback account as active authority for innopay
            ],
            key_auths: [
              [publicKeys.active, 1]
            ],
          },
          posting: {
            weight_threshold: 1,
            account_auths: [
              [fallbackAccount, 1]
            ], // Add fallback account as active authority
            key_auths: [
              [publicKeys.posting, 1]
            ],
          },
          memo_key: publicKeys.memo,
          json_metadata: '{}',
          extensions: [],
        },
      ];

      const claimedTransaction = {
        ...baseTransaction,
        operations: [createClaimedOp as any],
      };

      const signedClaimedTransaction = hiveClient.broadcast.sign(claimedTransaction, [PrivateKey.fromString(ticketHolderPrivateKey)]);
      broadcastResult = await hiveClient.broadcast.send(signedClaimedTransaction);
      console.log("Successfully broadcasted 'create_claimed_account' transaction:", broadcastResult);
      return broadcastResult.id; // Exit if successful
    } catch (error) {
      console.warn(`'create_claimed_account' failed, falling back to paid account creation.`);
      console.error(error);

      // Fallback logic: Create account with a 3 HIVE payment if primary method failed or was skipped
      if (fallbackPrivateKey && fallbackAccount) {
        try {
          // --- Fallback logic: Create account with a 3 HIVE payment ---
          console.log(`Attempting to create account by paying 3 HIVE from ${fallbackAccount}`);
          const createPaidOp = [
            'account_create',
            {
              fee: '3.000 HIVE',
              creator: fallbackAccount,
              new_account_name: accountName,
              owner: {
                weight_threshold: 1,
                account_auths: [
                  [fallbackAccount, 1]
                ], // Add fallback account as active authority
                key_auths: [
                  [publicKeys.owner, 1]
                ],
              },
              active: {
                weight_threshold: 1,
                account_auths: [
                  [fallbackAccount, 1]
                ], // Add fallback account as active authority
                key_auths: [
                  [publicKeys.active, 1]
                ],
              },
              posting: {
                weight_threshold: 1,
                account_auths: [
                  [fallbackAccount, 1]
                ], // Add fallback account as active authority
                key_auths: [
                  [publicKeys.posting, 1]
                ],
              },
              memo_key: publicKeys.memo,
              json_metadata: '{}',
              extensions: [],
            },
          ];

          const paidTransaction = {
            ...baseTransaction,
            operations: [createPaidOp as any],
          };
      
          // Corrected call to sign the transaction using hiveClient.broadcast.sign
          const signedPaidTransaction = hiveClient.broadcast.sign(paidTransaction, [PrivateKey.fromString(fallbackPrivateKey)]);
          broadcastResult = await hiveClient.broadcast.send(signedPaidTransaction);
          console.log("Successfully broadcasted paid account creation transaction:", broadcastResult);
          return broadcastResult.id; // Exit if successful
        } catch (error) {
            console.error('Paid account creation failed:', error);
            throw new Error(`Failed to create Hive account via paid method: ${error}`);
        }
      } 

      // If neither method was successful or attempted, explicitly throw an error
      const errorMessage = triedClaimedAccount
        ? "Claimed account creation failed, and fallback credentials are not available."
        : "Neither claimed account credentials nor fallback credentials are available for account creation.";
      
      return Promise.reject(new Error(errorMessage));      
    } 
  }
  const errorMessage = "Either ticketHolderPrivateKey: ${ticketHolderPrivateKey} or ticketHolderAccount: ${ticketHolderAccounty} are undefined";
  return Promise.reject(new Error(errorMessage));
}

/**
 * Transfers a specified amount of 'EURO' tokens from 'innopay' to a new Hive account.
 * This function uses a custom_json operation to interact with the Hive-Engine smart contract.
 * @param {string} toAccount - The recipient's Hive account name.
 * @param {number} amountInEuro - The amount of EURO to transfer.
 * @returns {Promise<string>} The transaction ID of the transfer.
 */
export async function transferEuroTokens(toAccount: string, amountInEuro: number): Promise<string> {
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
      symbol: 'EURO',
      to: toAccount,
      quantity: amountInEuro.toFixed(2), // Hive-Engine amounts are typically fixed-point with 8 decimals
      memo: `Top-up via Innopay for ${amountInEuro} EUR.`,
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
  console.log(`Broadcasting EURO token transfer of ${amountInEuro} to account '${toAccount}'.`);
  const signedTransaction = hiveClient.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayPrivateKey)]);
  const broadcastResult = await hiveClient.broadcast.send(signedTransaction);

  console.log("Successfully broadcasted Hive-Engine transfer transaction:", broadcastResult);
  return broadcastResult.id;
}
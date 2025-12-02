// fbAdAccountsService.ts
import { fbGet } from './fbClient.js';

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  amount_spent: string;
  owner: string;
}

interface AdAccountsResponse {
  adAccounts: AdAccount[];
}

/**
 * Get all ad accounts (owned + client) from Business Manager
 * @param accessToken - Meta access token for this request
 * @returns Combined list of owned and client ad accounts
 */
export async function getAllAdAccounts(
  accessToken: string
): Promise<AdAccountsResponse> {
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }

  const accountParams = {
    fields: 'name',
    limit: 100,
  };
  const ownedRes = await fbGet(`/me/adaccounts`, accountParams, accessToken);
  const ownedAccounts: AdAccount[] = ownedRes.data || [];
  console.log(`[Ad Accounts] Retrieved ${ownedAccounts.length} owned ad accounts`);

  return {
    adAccounts: ownedAccounts,
  };
}

/**
 * Get only owned ad accounts from Business Manager
 * @param businessId - Facebook Business Manager ID
 * @param accessToken - Meta access token for this request
 * @returns List of owned ad accounts
 */
export async function getOwnedAdAccounts(
  businessId: string,
  accessToken: string
): Promise<AdAccount[]> {
  console.log(`[Ad Accounts] Fetching owned ad accounts for Business ID: ${businessId}`);

  if (!businessId) {
    throw new Error('businessId is required');
  }
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }

  const fields = [
    'id',
    'account_id',
    'name',
    'account_status',
    'currency',
    'amount_spent',
    'owner',
  ].join(',');

  const params = {
    fields,
    limit: 100,
  };

  const res = await fbGet(`/${businessId}/owned_ad_accounts`, params, accessToken);
  const accounts: AdAccount[] = res.data || [];
  console.log(`[Ad Accounts] Retrieved ${accounts.length} owned ad accounts`);
  
  return accounts;
}

/**
 * Get only client ad accounts from Business Manager
 * @param businessId - Facebook Business Manager ID
 * @param accessToken - Meta access token for this request
 * @returns List of client ad accounts
 */
export async function getClientAdAccounts(
  businessId: string,
  accessToken: string
): Promise<AdAccount[]> {
  console.log(`[Ad Accounts] Fetching client ad accounts for Business ID: ${businessId}`);

  if (!businessId) {
    throw new Error('businessId is required');
  }
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }

  const fields = [
    'id',
    'account_id',
    'name',
    'account_status',
    'currency',
    'amount_spent',
    'owner',
  ].join(',');

  const params = {
    fields,
    limit: 100,
  };

  const res = await fbGet(`/${businessId}/client_ad_accounts`, params, accessToken);
  const accounts: AdAccount[] = res.data || [];
  console.log(`[Ad Accounts] Retrieved ${accounts.length} client ad accounts`);
  
  return accounts;
}

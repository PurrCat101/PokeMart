// Generated from the same list as database/seed/014_seed_kyc_test_users.sql. One key = one test case = one account.
export type KycLevel = 0 | 1 | 2;
export type KycRecordStatus = 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED';
export interface KycUser { userId: string; email: string; level: KycLevel; status: KycRecordStatus; purpose: string }

const define = (key: string, level: KycLevel, status: KycRecordStatus, purpose: string): KycUser => ({
  userId: `lab-kyc-${key}`, email: `lab-kyc-${key}@example.test`, level, status, purpose,
});

export const kycUsers = {
  'none-pokemon': define('none-pokemon', 0, 'ACTIVE', 'level 0 cannot buy a Pokémon'),
  'none-item': define('none-item', 0, 'ACTIVE', 'level 0 cannot buy an ordinary item'),
  'basic-pokemon': define('basic-pokemon', 1, 'ACTIVE', 'level 1 buys a Pokémon'),
  'basic-item': define('basic-item', 1, 'ACTIVE', 'level 1 buys an ordinary item'),
  'basic-master': define('basic-master', 1, 'ACTIVE', 'level 1 cannot buy a Master item'),
  'full-master': define('full-master', 2, 'ACTIVE', 'level 2 buys a Master item'),
  'pending-pokemon': define('pending-pokemon', 0, 'PENDING_REVIEW', 'under review cannot buy a Pokémon'),
  'pending-item': define('pending-item', 0, 'PENDING_REVIEW', 'under review cannot buy an item'),
  'basic-pending': define('basic-pending', 1, 'PENDING_REVIEW', 'under review beats a sufficient level'),
  'rejected-pokemon': define('rejected-pokemon', 0, 'REJECTED', 'rejected account cannot buy a Pokémon'),
  'status-none': define('status-none', 0, 'ACTIVE', 'GET status and account-info for level 0'),
  'status-basic': define('status-basic', 1, 'ACTIVE', 'GET status and account-info for level 1'),
  'status-full': define('status-full', 2, 'ACTIVE', 'GET status and account-info for level 2'),
  'status-pending': define('status-pending', 0, 'PENDING_REVIEW', 'GET status and account-info while under review'),
  'status-rejected': define('status-rejected', 0, 'REJECTED', 'GET status and account-info after rejection'),
  'submit-valid': define('submit-valid', 0, 'ACTIVE', 'valid submission becomes PENDING_REVIEW'),
  'submit-invalid': define('submit-invalid', 0, 'ACTIVE', 'invalid submission returns field errors'),
  'submit-malformed': define('submit-malformed', 0, 'ACTIVE', 'unknown fields and wrong types are rejected'),
  'submit-duplicate': define('submit-duplicate', 0, 'PENDING_REVIEW', 'second submission while pending is rejected'),
  'submit-verified': define('submit-verified', 1, 'ACTIVE', 'verified account cannot submit again'),
  'submit-resubmit': define('submit-resubmit', 0, 'REJECTED', 'rejected account can submit again'),
  'approve-flow': define('approve-flow', 0, 'PENDING_REVIEW', 'approval unlocks purchasing'),
  'down-purchase': define('down-purchase', 1, 'ACTIVE', 'KYC outage fails a purchase closed'),
  'down-account': define('down-account', 1, 'ACTIVE', 'KYC outage returns kyc null in account-info'),
  'ui-later': define('ui-later', 0, 'ACTIVE', 'UI popup can be dismissed with Maybe later'),
  'ui-verify': define('ui-verify', 0, 'ACTIVE', 'UI Verify now leads to the form and submit'),
  'ui-validation': define('ui-validation', 0, 'ACTIVE', 'UI form shows validation errors'),
  'ui-pending': define('ui-pending', 0, 'PENDING_REVIEW', 'UI shows the under-review banner'),
  'ui-rejected': define('ui-rejected', 0, 'REJECTED', 'UI shows the rejected banner and Send again'),
} as const;

export type KycScenario = keyof typeof kycUsers;

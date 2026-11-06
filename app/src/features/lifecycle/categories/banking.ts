import type { LayoutSpec } from './types';

/** Banking: the customer and credit lifecycle, with the three lines of defence as the swimlanes. */
export const banking: LayoutSpec = {
  name: 'Customer & Risk Lifecycle',
  tagline: 'From a verified customer to a closed account, with every control and who owns it.',
  phases: [
    { label: 'Acquire', from: 0, to: 1 },
    { label: 'Transact', from: 2, to: 3 },
    { label: 'Protect', from: 4, to: 5 },
  ],
  stages: [
    { name: 'Onboarding & KYC', subs: ['Identity and address proof', 'Customer due diligence'] },
    { name: 'Credit Assessment', subs: ['Financial analysis', 'Risk rating'] },
    { name: 'Approval', subs: ['Authority matrix', 'Documentation and terms'] },
    { name: 'Disbursement', subs: ['Conditions precedent', 'Funds release'] },
    { name: 'Monitoring', subs: ['Repayment tracking', 'Early-warning signals'] },
    { name: 'Collections & Closure', subs: ['Recovery and restructuring', 'Account closure'] },
  ],
  loops: [
    { from: 1, to: 2, label: 'Resubmit with conditions' },
    { from: 1, to: 4, label: 'Re-rate the customer on warning signs' },
  ],
  lanes: [
    { group: 'First line · Business', title: 'KYC & Customer Due Diligence', from: 0, to: 1, sops: [1], items: ['Verify identity and address', 'Identify beneficial owners', 'Periodic refresh'] },
    { group: 'First line · Business', title: 'Credit Underwriting', from: 1, to: 2, sops: [2], items: ['Cash-flow based analysis', 'Internal risk rating', 'Collateral valuation'] },
    { group: 'First line · Business', title: 'Disbursement Controls', from: 2, to: 3, sops: [3], items: ['Four-eyes release', 'Conditions checked first', 'Same-day reconciliation'] },
    { group: 'First line · Business', title: 'Account Monitoring', from: 4, to: 5, sops: [4], items: ['Repayment tracking', 'Early-warning triggers', 'Customer outreach'] },
    { group: 'Second line · Risk & Compliance', title: 'AML & Sanctions Screening', from: 0, to: 5, sops: [5], items: ['Screen at onboarding and daily', 'Transaction monitoring', 'Suspicious activity reporting'], note: 'Runs for the whole life of the relationship.' },
    { group: 'Second line · Risk & Compliance', title: 'Credit Risk Limits', from: 1, to: 3, sops: [6], items: ['Approval authority matrix', 'Concentration limits', 'Exceptions logged and reported'] },
    { group: 'Second line · Risk & Compliance', title: 'Conduct & Complaints', from: 3, to: 5, sops: [7], items: ['Fair-treatment standards', 'Complaints resolved in set time', 'Root-cause trends reported'] },
    { group: 'Third line · Audit', title: 'Internal Audit & Regulatory Reporting', from: 0, to: 5, sops: [8], items: ['Independent testing each year', 'Findings tracked to closure', 'Regulator reports on time'] },
  ],
  chains: [
    { label: 'Approval authority', steps: ['Officer', 'Branch manager', 'Credit committee', 'Board'] },
    { label: 'Alert path', steps: ['Alert', 'Investigate', 'Escalate', 'Report to regulator'] },
  ],
  sops: {
    1: 'Customer Due Diligence & KYC',
    2: 'Credit Underwriting & Rating',
    3: 'Disbursement & Settlement Controls',
    4: 'Account Monitoring & Early Warning',
    5: 'AML, Sanctions & Fraud Screening',
    6: 'Credit Risk Limits & Approval Authority',
    7: 'Conduct, Complaints & Fair Treatment',
    8: 'Internal Audit & Regulatory Reporting',
  },
};

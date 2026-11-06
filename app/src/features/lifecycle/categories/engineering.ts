import type { LayoutSpec } from './types';

/** Engineering: the delivery lifecycle of a product, with the craft, quality and operations practices around it. */
export const engineering: LayoutSpec = {
  name: 'Delivery Lifecycle',
  tagline: 'From an idea to a running service, and back again with what the team learned.',
  phases: [
    { label: 'Plan', from: 0, to: 1 },
    { label: 'Make', from: 2, to: 3 },
    { label: 'Run', from: 4, to: 6 },
  ],
  stages: [
    { name: 'Discovery', subs: ['Problem framing', 'Feasibility spike'] },
    { name: 'Design', subs: ['Architecture options', 'Design review'] },
    { name: 'Build', subs: ['Implementation', 'Pair and code review'] },
    { name: 'Verify', subs: ['Automated tests', 'Performance and security checks'] },
    { name: 'Release', subs: ['Staged rollout', 'Change record'] },
    { name: 'Operate', subs: ['Monitoring', 'On-call'] },
    { name: 'Learn', subs: ['Retrospective', 'Backlog feed'] },
  ],
  loops: [
    { from: 2, to: 3, label: 'Build ⇄ Verify' },
    { from: 0, to: 6, label: 'What we learn feeds the next discovery' },
  ],
  lanes: [
    { group: 'Engineering craft', title: 'Design Review Board', from: 1, to: 2, sops: [1], items: ['One-page design doc', 'Trade-offs written down', 'Review before build'] },
    { group: 'Engineering craft', title: 'Code Review & Pairing', from: 2, to: 3, sops: [2], items: ['Two reviewers on risky changes', 'Small pull requests', 'Pairing on hard problems'] },
    { group: 'Engineering craft', title: 'Engineering Standards', from: 0, to: 6, items: ['Style and architecture guides', 'Definition of done', 'Tech-debt budget every sprint'], note: 'The shared baseline every team builds on.' },
    { group: 'Quality & security', title: 'Automated Testing', from: 2, to: 4, sops: [3], items: ['Coverage gates on every merge', 'Managed test data', 'No merge on red'] },
    { group: 'Quality & security', title: 'Security & Dependency Scanning', from: 2, to: 4, sops: [4], items: ['Static analysis on every commit', 'Dependency updates weekly', 'Secrets never in code'] },
    { group: 'Delivery & operations', title: 'CI/CD Pipeline', from: 3, to: 4, sops: [5], items: ['Build once, deploy many', 'Staged rollout', 'One-click rollback'] },
    { group: 'Delivery & operations', title: 'Observability & On-call', from: 4, to: 5, sops: [6], items: ['Service-level objectives', 'Alerts that matter', 'Rotating on-call with handover'] },
    { group: 'Delivery & operations', title: 'Incident Response & Postmortem', from: 5, to: 6, sops: [7], items: ['Declare early', 'Blameless postmortem', 'Actions tracked to done'] },
    { group: 'Delivery & operations', title: 'Documentation & Runbooks', from: 1, to: 6, sops: [8], items: ['Docs live with the code', 'A runbook for every service', 'Regular tech talks'] },
  ],
  chains: [
    { label: 'Pipeline', steps: ['Commit', 'Build', 'Test', 'Scan', 'Deploy', 'Verify'] },
    { label: 'Incident path', steps: ['Detect', 'Triage', 'Mitigate', 'Postmortem', 'Fix'] },
  ],
  sops: {
    1: 'Design Review & Architecture Decisions',
    2: 'Code Review & Pairing',
    3: 'Test Strategy & Quality Gates',
    4: 'Secure Development & Dependency Management',
    5: 'Release & Change Management',
    6: 'Monitoring, Alerting & On-call',
    7: 'Incident Response & Postmortems',
    8: 'Documentation & Runbooks',
  },
};

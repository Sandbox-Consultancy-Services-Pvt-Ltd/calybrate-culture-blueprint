import type { LayoutSpec } from './types';

/** Healthcare: the patient care pathway, with the clinical safety net underneath it. */
export const healthcare: LayoutSpec = {
  name: 'Patient Care Pathway',
  tagline: 'From first contact to full recovery, with the safety practices that protect every step.',
  phases: [
    { label: 'Entry', from: 0, to: 1 },
    { label: 'Clinical care', from: 2, to: 3 },
    { label: 'Transition', from: 4, to: 5 },
  ],
  stages: [
    { name: 'Registration & Access', subs: ['Appointment or walk-in', 'ID and records check'] },
    { name: 'Triage & Assessment', subs: ['Vitals and priority colour', 'Initial assessment'] },
    { name: 'Diagnosis', subs: ['Tests and imaging', 'Specialist opinion'] },
    { name: 'Treatment & Care', subs: ['Procedures and medication', 'Ward nursing care'] },
    { name: 'Discharge', subs: ['Discharge summary', 'Medication counselling'] },
    { name: 'Follow-up & Recovery', subs: ['Review visit', 'Home-care guidance'] },
  ],
  loops: [{ from: 2, to: 3, label: 'Reassess and adjust treatment' }],
  lanes: [
    { group: 'Patient-facing', title: 'Welcoming Front Desk', from: 0, to: 1, sops: [1], items: ['Greet within two minutes', 'Clear signage and guidance', 'Privacy at the counter'] },
    { group: 'Patient-facing', title: 'Care Communication Standard', from: 0, to: 5, items: ['Plain-language explanations', 'Family kept informed', 'Consent before every procedure'], note: 'Applies at every stage, for every patient and family.' },
    { group: 'Patient-facing', title: 'Discharge & Follow-up Plan', from: 4, to: 5, sops: [6], items: ['Written discharge summary', 'Medication counselling', 'Follow-up booked before leaving'] },
    { group: 'Clinical safety', title: 'Triage Priority Protocol', from: 1, to: 2, sops: [2], items: ['Colour-coded priority', 'Vitals within ten minutes', 'Escalate to a senior clinician'] },
    { group: 'Clinical safety', title: 'Clinical Governance', from: 2, to: 3, sops: [3], items: ['Evidence-based protocols', 'Peer case review', 'Clinical audit'] },
    { group: 'Clinical safety', title: 'Infection Prevention & Control', from: 1, to: 4, sops: [4], items: ['Hand hygiene', 'Isolation and PPE', 'Sterile processing'] },
    { group: 'Clinical safety', title: 'Medication Safety', from: 3, to: 4, sops: [5], items: ['Two-person high-risk check', 'Allergy verification', 'Pharmacist review'] },
    { group: 'Learning', title: 'Incident Learning Loop', from: 0, to: 5, sops: [7], items: ['Report without blame', 'Review within 72 hours', 'Share the lesson'] },
    { group: 'Learning', title: 'Patient Voice', from: 4, to: 5, sops: [8], items: ['Feedback at discharge', 'Grievance handling', 'Quarterly review of themes'] },
  ],
  chains: [
    { label: 'Escalation path', steps: ['Nurse', 'Senior nurse', 'Duty doctor', 'Consultant'] },
    { label: 'Incident path', steps: ['Report', 'Review', 'Root cause', 'Action', 'Share the lesson'] },
  ],
  sops: {
    1: 'Patient Registration & Identification',
    2: 'Triage & Emergency Response',
    3: 'Clinical Assessment & Diagnosis',
    4: 'Infection Prevention & Control',
    5: 'Medication Safety',
    6: 'Discharge Planning & Follow-up',
    7: 'Incident Reporting & Learning',
    8: 'Patient Feedback & Grievance Handling',
  },
};

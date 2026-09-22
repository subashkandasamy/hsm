import type { ComponentType } from 'react'

export interface GuideContentModule {
  default: ComponentType
  faqs?: { q: string; a: string }[]
}

// Only slugs present here are published — the registry (src/lib/guides/registry.ts)
// holds metadata for the full planned set, but a guide only gets a live route,
// a sitemap entry, and hub-page + interlink visibility once it has real content.
export const GUIDE_CONTENT: Record<string, () => Promise<GuideContentModule>> = {
  // Tier 1 — pillar
  'what-is-hospital-management-system': () => import('./what-is-hospital-management-system'),
  'hospital-management-software-cost-india': () => import('./hospital-management-software-cost-india'),
  'hospital-digitization-workflow-guide': () => import('./hospital-digitization-workflow-guide'),
  'hospital-management-software-india': () => import('./hospital-management-software-india'),

  // Tier 2 — module guides
  'nurse-duty-roster-hospital-guide': () => import('./nurse-duty-roster-hospital-guide'),
  'hospital-staff-scheduling-software-guide': () => import('./hospital-staff-scheduling-software-guide'),
  'hospital-cost-estimate-quotation-guide': () => import('./hospital-cost-estimate-quotation-guide'),
  'hospital-cashier-day-book-shift-close-guide': () => import('./hospital-cashier-day-book-shift-close-guide'),
  'hospital-discount-policy-approval-guide': () => import('./hospital-discount-policy-approval-guide'),
  'hospital-refund-credit-note-guide': () => import('./hospital-refund-credit-note-guide'),
  'patient-portal-family-health-records-guide': () => import('./patient-portal-family-health-records-guide'),
  'ophthalmology-emr-software-guide': () => import('./ophthalmology-emr-software-guide'),
  'child-immunisation-schedule-software-guide': () => import('./child-immunisation-schedule-software-guide'),
  'paediatric-growth-chart-who-guide': () => import('./paediatric-growth-chart-who-guide'),
  'antenatal-care-labour-ward-guide': () => import('./antenatal-care-labour-ward-guide'),
  'ipd-billing-software-explained': () => import('./ipd-billing-software-explained'),
  'hospital-pharmacy-management-software-guide': () => import('./hospital-pharmacy-management-software-guide'),
  'opd-queue-token-management-guide': () => import('./opd-queue-token-management-guide'),
  'ipd-admission-bed-management-guide': () => import('./ipd-admission-bed-management-guide'),
  'lab-lis-workflow-guide': () => import('./lab-lis-workflow-guide'),
  'radiology-ris-reporting-guide': () => import('./radiology-ris-reporting-guide'),
  'patient-records-emr-uhid-guide': () => import('./patient-records-emr-uhid-guide'),
  'hospital-inventory-purchase-order-guide': () => import('./hospital-inventory-purchase-order-guide'),
  'health-insurance-tpa-claims-guide': () => import('./health-insurance-tpa-claims-guide'),
  'hospital-staff-attendance-hr-guide': () => import('./hospital-staff-attendance-hr-guide'),
  'ot-scheduling-management-guide': () => import('./ot-scheduling-management-guide'),
  'blood-bank-management-guide': () => import('./blood-bank-management-guide'),
  'emergency-triage-management-guide': () => import('./emergency-triage-management-guide'),
  'dental-clinic-software-guide': () => import('./dental-clinic-software-guide'),

  // Tier 3 — India compliance & standards
  'nurse-patient-ratio-india-nabh': () => import('./nurse-patient-ratio-india-nabh'),
  'abdm-abha-health-id-hospitals-guide': () => import('./abdm-abha-health-id-hospitals-guide'),
  'hospital-gst-billing-rules-india': () => import('./hospital-gst-billing-rules-india'),
  'nabh-accreditation-software-checklist': () => import('./nabh-accreditation-software-checklist'),
  'hospital-bill-format-ipd-opd-sample': () => import('./hospital-bill-format-ipd-opd-sample'),
  'drug-schedule-h-h1-x-pharmacy-compliance': () => import('./drug-schedule-h-h1-x-pharmacy-compliance'),

  // Tier 4 — switching & evaluating
  'switching-from-spreadsheets-to-hms': () => import('./switching-from-spreadsheets-to-hms'),
  'hospital-data-migration-guide': () => import('./hospital-data-migration-guide'),
  'hospital-software-data-security-dpdp': () => import('./hospital-software-data-security-dpdp'),
  'hospital-free-trial-setup-guide': () => import('./hospital-free-trial-setup-guide'),
}

export function publishedSlugs(): string[] {
  return Object.keys(GUIDE_CONTENT)
}

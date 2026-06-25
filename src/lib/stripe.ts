import Stripe from 'stripe'

// STRIPE_SECRET_KEY must be set in .env.local
// For test mode: sk_test_...
// For live mode: sk_live_...
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-06-24.dahlia',
})

export const PLANS = {
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_PRICE_ID_STARTER ?? '',
    description: 'Up to 5 users, core clinical modules',
    price: 2999,
    features: [
      'Up to 5 staff accounts',
      'OPD & Appointments',
      'Patient records & EMR',
      'Basic billing',
    ],
  },
  professional: {
    name: 'Professional',
    priceId: process.env.STRIPE_PRICE_ID_PROFESSIONAL ?? '',
    description: 'Unlimited users, all modules, priority support',
    price: 7999,
    features: [
      'Unlimited staff accounts',
      'IPD, OT & Emergency',
      'Lab, Radiology & Pharmacy',
      'Insurance & multi-tenant billing',
      'Blood bank & SaaS analytics',
      'Priority support',
    ],
  },
} as const

export type PlanKey = keyof typeof PLANS

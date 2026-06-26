import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-06-24.dahlia',
})

export const PLANS = {
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_PRICE_ID_STARTER ?? '',
    description: 'Core clinical modules, up to 5 staff',
    price: 2999,
    features: [
      'Up to 5 staff accounts',
      'OPD & Appointments',
      'Patient records & EMR',
      'Basic billing',
    ],
  },
  growth: {
    name: 'Growth',
    // falls back to old PROFESSIONAL env var so existing deployments don't break
    priceId: process.env.STRIPE_PRICE_ID_GROWTH ?? process.env.STRIPE_PRICE_ID_PROFESSIONAL ?? '',
    description: 'All clinical modules, unlimited staff, priority support',
    price: 7999,
    features: [
      'Unlimited staff accounts',
      'IPD, OT & Emergency',
      'Lab, Radiology & Pharmacy',
      'Insurance claims',
      'Blood bank',
      'Priority support',
    ],
  },
} as const

export type PlanKey = keyof typeof PLANS

// Safe to import in client components — no SDK, no env secrets
export const PLANS = {
  starter: {
    name:        'Starter',
    planId:      process.env.RAZORPAY_PLAN_ID_STARTER ?? '',
    description: 'Core clinical modules, up to 5 staff',
    price:       2999,
    features: [
      'Up to 5 staff accounts',
      'OPD & Appointments',
      'Patient records & EMR',
      'Basic billing',
    ],
  },
  growth: {
    name:        'Growth',
    planId:      process.env.RAZORPAY_PLAN_ID_GROWTH ?? '',
    description: 'All clinical modules, unlimited staff, priority support',
    price:       7999,
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

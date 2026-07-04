// Server-only — never import this in a 'use client' file
import Razorpay from 'razorpay'

export const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     ?? 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? 'placeholder',
})

export { PLANS } from './razorpay-plans'
export type { PlanKey } from './razorpay-plans'

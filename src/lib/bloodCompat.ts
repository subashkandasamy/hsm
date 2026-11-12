import type { BloodGroup, BloodComponent } from '@/lib/types'

// Which DONOR blood groups are compatible for a given RECIPIENT group, per
// component. RBC/whole use red-cell compatibility (donor red cells must not
// carry antigens the recipient has antibodies against). Plasma is the reverse
// (donor plasma must not carry antibodies against the recipient's antigens);
// AB plasma is the universal donor. Platelets are treated with the conservative
// red-cell rule to avoid major ABO incompatibility.
//
// This is a safety aid for unit selection + cross-match; the final release
// always requires a recorded compatible cross-match.

const RBC: Record<BloodGroup, BloodGroup[]> = {
  'O-':  ['O-'],
  'O+':  ['O-', 'O+'],
  'A-':  ['O-', 'A-'],
  'A+':  ['O-', 'O+', 'A-', 'A+'],
  'B-':  ['O-', 'B-'],
  'B+':  ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
}

// Plasma is ABO-only (Rh irrelevant); AB is universal plasma donor.
const PLASMA: Record<BloodGroup, BloodGroup[]> = {
  'O-':  ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+':  ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-':  ['A-', 'A+', 'AB-', 'AB+'],
  'A+':  ['A-', 'A+', 'AB-', 'AB+'],
  'B-':  ['B-', 'B+', 'AB-', 'AB+'],
  'B+':  ['B-', 'B+', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB-', 'AB+'],
}

/** A request raised before the patient is grouped: only universal-donor units
 *  (O− red cells, AB plasma) until the blood bank records the group. */
export const UNKNOWN_GROUP = 'unknown'

export function bloodGroupLabel(g: string): string {
  return g === UNKNOWN_GROUP ? 'Group ?' : g
}

export function compatibleDonorGroups(recipient: BloodGroup | typeof UNKNOWN_GROUP, component: BloodComponent): BloodGroup[] {
  if (recipient === UNKNOWN_GROUP) return component === 'plasma' ? ['AB-', 'AB+'] : ['O-']
  if (component === 'plasma') return PLASMA[recipient] ?? [recipient]
  // whole, prbc, platelets → red-cell compatibility
  return RBC[recipient] ?? [recipient]
}

export function isCompatible(recipient: BloodGroup | typeof UNKNOWN_GROUP, donor: BloodGroup, component: BloodComponent): boolean {
  return compatibleDonorGroups(recipient, component).includes(donor)
}

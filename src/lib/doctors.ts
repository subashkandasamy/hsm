// Who counts as a doctor: staff with the doctor role, and administrators who also
// see patients (profiles.sees_patients — e.g. a clinic owner who consults).

/** PostgREST `.or()` filter on profiles for everyone who can be booked / assigned as a doctor. */
export const DOCTOR_FILTER = 'role.eq.doctor,and(role.eq.admin,sees_patients.eq.true)'

export function isPractitioner(p: { role: string; sees_patients?: boolean | null } | null | undefined): boolean {
  return !!p && (p.role === 'doctor' || (p.role === 'admin' && !!p.sees_patients))
}

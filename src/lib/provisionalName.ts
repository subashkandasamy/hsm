// The name an unidentified emergency patient is registered under. With sex or
// age left as "unknown" it read "Unknown Unknown ~Unknowny" (BUG-034).

export function provisionalName(gender: string | null | undefined, age: number | null | undefined): string {
  const sex = gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : gender === 'other' ? 'Other' : 'patient'
  return ['Unknown', sex, age != null ? `~${age}y` : null].filter(Boolean).join(' ')
}

/** The same rule for names already saved the old way. */
export function tidyProvisionalName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/^Unknown Unknown\b/, 'Unknown patient')
    .replace(/\s*~Unknowny$/, '')
}

// Developmental milestone checkpoints — a short core set per age from the CDC/AAP
// "Learn the Signs. Act Early." checklists (2022 revision). Each item is something
// most children (about 75%) do by that age, so "not yet" means "screen further /
// discuss", never a diagnosis.

export type MilestoneDomain = 'social' | 'language' | 'cognitive' | 'motor'
export interface Milestone { key: string; domain: MilestoneDomain; text: string }
export interface MilestoneCheckpoint { months: number; label: string; items: Milestone[] }

const m = (months: number, items: Array<[MilestoneDomain, string]>): MilestoneCheckpoint => ({
  months,
  label: months < 24 ? `${months} months` : `${months / 12} years`,
  items: items.map(([domain, text], i) => ({ key: `${months}m-${i}`, domain, text })),
})

export const MILESTONES: MilestoneCheckpoint[] = [
  m(2, [['social', 'Smiles when you talk to or smile at them'], ['language', 'Makes sounds other than crying'], ['cognitive', 'Watches you as you move'], ['motor', 'Holds head up when on tummy']]),
  m(4, [['social', 'Smiles on their own to get your attention'], ['language', 'Turns head towards the sound of your voice'], ['cognitive', 'Opens mouth when hungry on seeing breast or bottle'], ['motor', 'Holds head steady without support when held']]),
  m(6, [['social', 'Laughs'], ['language', 'Takes turns making sounds with you'], ['cognitive', 'Reaches to grab a toy they want'], ['motor', 'Rolls from tummy to back']]),
  m(9, [['social', 'Is shy, clingy or fearful around strangers'], ['language', 'Makes sounds like "mamamama" and "babababa"'], ['cognitive', 'Looks for objects when dropped out of sight'], ['motor', 'Sits without support']]),
  m(12, [['social', 'Plays games with you, like pat-a-cake'], ['language', 'Calls a parent "mama" or "dada" or another special name'], ['cognitive', 'Picks things up between thumb and pointer finger'], ['motor', 'Pulls up to stand']]),
  m(15, [['social', 'Shows you an object they like'], ['language', 'Tries to say one or two words besides "mama" or "dada"'], ['cognitive', 'Stacks at least two small objects'], ['motor', 'Takes a few steps on their own']]),
  m(18, [['social', 'Points to show you something interesting'], ['language', 'Tries to say three or more words besides "mama" or "dada"'], ['cognitive', 'Copies you doing chores, like sweeping'], ['motor', 'Walks without holding on to anyone or anything']]),
  m(24, [['social', 'Notices when others are hurt or upset'], ['language', 'Says at least two words together, like "more milk"'], ['cognitive', 'Plays with more than one toy at the same time'], ['motor', 'Kicks a ball']]),
  m(30, [['social', 'Plays next to other children and sometimes with them'], ['language', 'Says about 50 words'], ['cognitive', 'Follows two-step instructions'], ['motor', 'Jumps off the ground with both feet']]),
  m(36, [['social', 'Notices other children and joins them to play'], ['language', 'Talks with you in conversation using at least two back-and-forth exchanges'], ['cognitive', 'Draws a circle when you show them how'], ['motor', 'Uses a fork']]),
  m(48, [['social', 'Comforts others who are hurt or sad'], ['language', 'Says sentences with four or more words'], ['cognitive', 'Names a few colours of items'], ['motor', 'Catches a large ball most of the time']]),
  m(60, [['social', 'Follows rules or takes turns when playing games'], ['language', 'Tells a story with at least two events'], ['cognitive', 'Counts to 10'], ['motor', 'Hops on one foot']]),
]

/** Checkpoints relevant at this age: the last one the child has reached, plus the next one. */
export function milestonesForAge(ageMonths: number): { current: MilestoneCheckpoint | null; next: MilestoneCheckpoint | null } {
  let current: MilestoneCheckpoint | null = null
  let next: MilestoneCheckpoint | null = null
  for (const cp of MILESTONES) {
    if (cp.months <= ageMonths) current = cp
    else { next = cp; break }
  }
  return { current, next }
}

export const MILESTONE_SOURCE = 'CDC/AAP “Learn the Signs. Act Early.” milestone checklists (2022)'

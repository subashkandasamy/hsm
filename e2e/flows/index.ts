// Run order matters: later flows use the patients and admissions earlier
// flows create (front-desk → opd → ipd → … → discharge → billing).
import cleanup from './00-cleanup'
import login from './01-login'
import access from './02-access'
import frontDesk from './03-front-desk'
import opd from './04-opd'
import ipd from './05-ipd'
import pharmacy from './06-pharmacy'
import nursing from './07-nursing'
import ot from './08-ot'
import advance from './09-advance'
import lab from './10-lab'
import radiology from './11-radiology'
import emergency from './12-emergency'
import icu from './13-icu'
import bloodBank from './14-blood-bank'
import discharge from './15-discharge'
import billing from './16-billing'
import hrAdmin from './17-hr-admin'
import more from './18-more'
import type { Flow } from '../lib/run'

export const FLOWS: Flow[] = [cleanup, login, access, frontDesk, opd, ipd, pharmacy, nursing, ot, advance, lab, radiology, emergency, icu, bloodBank, discharge, billing, hrAdmin, more]

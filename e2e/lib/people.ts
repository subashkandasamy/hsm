// The patients a run registers. Every run gets its own tag in the name and its
// own phone numbers, so a rerun never trips the duplicate-patient check.
import type { Run } from './run'

export interface Person {
  key: string; full_name: string; phone: string; age?: string; dob?: string; gender: 'male' | 'female'
  blood: string; allergies: string; address: string; district: string; pincode: string
  relation: string; rel_name: string; ec_name: string; ec_phone: string
}

const digits = (r: Run) => r.tag.replace(/\D/g, '').slice(-7).padStart(7, '0')
const phone = (r: Run, i: number, lead = '9') => `${lead}${digits(r)}${String(i).padStart(2, '0')}`
const yearsAgo = (y: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(1); return d.toISOString().slice(0, 10) }

export function cast(r: Run): Record<string, Person> {
  const n = (s: string) => `E2E ${s} ${r.tag}`
  const p = (key: string, i: number, v: Omit<Person, 'key' | 'phone' | 'ec_phone' | 'full_name'> & { name: string }): Person => {
    const { name, ...rest } = v
    return { key, full_name: n(name), phone: phone(r, i), ec_phone: phone(r, i + 50, '8'), ...rest }
  }
  return {
    murugan: p('murugan', 1, { name: 'Murugan Selvam', age: '52', gender: 'male', blood: 'B+', allergies: 'Penicillin', address: '12, Bazaar Street', district: 'Karur', pincode: '639001', relation: 'Wife', rel_name: 'Selvi', ec_name: 'Selvi' }),
    lakshmi: p('lakshmi', 2, { name: 'Lakshmi Devi', age: '34', gender: 'female', blood: 'O+', allergies: '', address: '4, Gandhi Nagar', district: 'Karur', pincode: '639002', relation: 'Husband', rel_name: 'Ravi', ec_name: 'Ravi' }),
    kavin: p('kavin', 3, { name: 'Baby Kavin', dob: yearsAgo(4), gender: 'male', blood: '', allergies: '', address: '7, North Street', district: 'Karur', pincode: '639003', relation: 'Father', rel_name: 'Senthil', ec_name: 'Senthil' }),
    ramasamy: p('ramasamy', 4, { name: 'Ramasamy Kandasamy', age: '70', gender: 'male', blood: 'A+', allergies: 'Sulfa drugs', address: '22, Railway Road', district: 'Karur', pincode: '639004', relation: 'Son', rel_name: 'Kumar', ec_name: 'Kumar' }),
    selvi: p('selvi', 5, { name: 'Selvi Raman', age: '45', gender: 'female', blood: 'A+', allergies: '', address: '9, Kovai Road', district: 'Karur', pincode: '639002', relation: 'Husband', rel_name: 'Raman', ec_name: 'Raman' }),
    raju: p('raju', 6, { name: 'Raju Pandian', age: '62', gender: 'male', blood: 'O+', allergies: '', address: '3, Mill Street', district: 'Karur', pincode: '639001', relation: 'Wife', rel_name: 'Meenakshi', ec_name: 'Meenakshi' }),
    arjun: p('arjun', 7, { name: 'Arjun Kumar', age: '28', gender: 'male', blood: 'B+', allergies: '', address: '15, Bus Stand Road', district: 'Karur', pincode: '639001', relation: 'Father', rel_name: 'Kumar', ec_name: 'Kumar' }),
    priya: p('priya', 8, { name: 'Priya Mohan', age: '26', gender: 'female', blood: 'B+', allergies: '', address: '18, Thanthonimalai', district: 'Karur', pincode: '639005', relation: 'Husband', rel_name: 'Mohan', ec_name: 'Mohan' }),
  }
}

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** datetime-local value for a Date (the machine runs in IST like the hospital). */
export const local = (d: Date) => `${ymd(d)}T${hm(d)}`
export const minutesFromNow = (m: number) => new Date(Date.now() + m * 60000)

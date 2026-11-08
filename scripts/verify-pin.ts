/**
 * Counter PIN rules (src/lib/pin.ts).
 *
 *   npm run verify:pin
 */

import { pinProblem } from '../src/lib/pin'
import { hashPin, verifyPin } from '../src/lib/pinHash'

let failed = 0
function check(ok: boolean, label: string) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

console.log('\nRefused')
for (const p of ['', '123', '12345', '12a4', ' 123', '0000', '1111', '9999', '1234', '2345', '6789', '4321', '9876', '1212', '0909'])
  check(pinProblem(p) !== null, `${JSON.stringify(p)} refused`)
console.log('\nAccepted')
for (const p of ['4821', '0592', '7306', '1235', '2580', '1122']) check(pinProblem(p) === null, `${p} accepted`)
check(pinProblem('1234')!.includes('1234'), 'the reason says what is wrong')

console.log('\nStored scrambled')
const h1 = hashPin('4821'), h2 = hashPin('4821')
check(verifyPin('4821', h1), 'the right PIN matches')
check(!verifyPin('4822', h1) && !verifyPin('', h1), 'a wrong or empty PIN does not')
check(h1 !== h2, 'the same PIN stores differently each time (salted)')
check(!h1.includes('4821'), 'the PIN itself is not in what is stored')
for (const bad of ['', 'garbage', 's1$$', 's2$aaaa$bbbb', 's1$AAAA$AAAA']) check(!verifyPin('4821', bad), `a damaged stored value ${JSON.stringify(bad)} never matches`)

console.log(failed ? `\n${failed} FAILED\n` : '\nObvious PINs are refused, ordinary ones are not.\n')
process.exit(failed ? 1 : 0)

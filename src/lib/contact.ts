/**
 * How someone reaches us, in one place.
 *
 * The number was scattered nowhere and the email in eight files. Both belong
 * here, so changing either is one edit rather than a search.
 *
 * Not to be confused with the WHATSAPP_* environment variables, which are the
 * Meta Business API credentials used to send patients their reports.
 * WHATSAPP_PHONE_NUMBER_ID is an internal Meta identifier and cannot be
 * dialled; this is the number a human actually answers.
 */

/** International format, digits only — what wa.me expects. */
export const WHATSAPP_NUMBER = '919739784611'

export const CONTACT_EMAIL = 'contact@uyirly.com'

/** How it should read to a person: +91 97397 84611 */
export const WHATSAPP_DISPLAY = '+91 97397 84611'

/**
 * A link that opens WhatsApp with a chat to us already started.
 *
 * On a phone this opens the app, on a laptop WhatsApp Web. No API, no cost,
 * and nothing for the visitor to install — which is the point, because a
 * clinic owner in Coimbatore will message on WhatsApp and will not write an
 * email.
 *
 * The greeting is prefilled but editable, and says where they came from, so a
 * message from the pricing page can be answered differently from one off a
 * competitor comparison. Kept to one short line: a long prefilled script reads
 * as automated and gets deleted.
 */
export function whatsappLink(context?: string): string {
  const text = context
    ? `Hi, I saw your ${context} page and would like to know more about Uyirly.`
    : 'Hi, I would like to know more about Uyirly.'
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

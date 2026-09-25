import { whatsappLink } from '@/lib/contact'

/**
 * The green button in the corner.
 *
 * A clinic owner comparing hospital software will not write an email. They
 * will send a WhatsApp message, usually from a phone, usually in the evening.
 * Until now the only way to reach us from the website was contact@uyirly.com.
 *
 * Deliberately a plain link rather than a chat widget: nothing to load, no
 * third-party script watching visitors, and it works the same whether they are
 * on a phone or a laptop.
 *
 * Rendered from MarketingNav, which appears on every public page and on no
 * signed-in page — so it never follows a hospital into the software they are
 * working in.
 */
export default function WhatsAppButton({ context }: { context?: string }) {
  return (
    <a
      href={whatsappLink(context)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      // Above the page, below any dialog. Sits left of nothing else today, but
      // bottom-right is where people look for this.
      className="fixed flex items-center justify-center rounded-full"
      style={{
        right: 'max(16px, env(safe-area-inset-right))',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        width: 56, height: 56, zIndex: 40,
        background: '#25D366',            // WhatsApp's own green, not our teal
        boxShadow: '0 6px 20px rgba(37,211,102,0.42)',
        textDecoration: 'none',
      }}
    >
      {/* Inline, because the icon set we use has no WhatsApp glyph and one
          brand mark is not worth another dependency. */}
      <svg width="30" height="30" viewBox="0 0 32 32" fill="#fff" aria-hidden="true">
        <path d="M16.04 4A11.9 11.9 0 0 0 4.1 15.9c0 2.1.55 4.15 1.6 5.96L4 28.5l6.8-1.78a11.9 11.9 0 0 0 5.24 1.23h.01c6.57 0 11.92-5.34 11.93-11.91A11.85 11.85 0 0 0 16.04 4Zm0 21.72h-.01a9.9 9.9 0 0 1-5.03-1.38l-.36-.21-3.73.98.99-3.64-.23-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.46 4.45-9.9 9.9-9.9 2.64 0 5.13 1.03 7 2.9a9.84 9.84 0 0 1 2.9 7c0 5.46-4.45 9.88-9.92 9.88Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35Z"/>
      </svg>
    </a>
  )
}

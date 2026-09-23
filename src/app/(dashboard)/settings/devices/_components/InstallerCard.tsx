'use client'

import { Download, HardDriveDownload, ShieldAlert } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import type { ConnectorRelease } from '@/app/actions/devices'

/**
 * The program itself, and how to put it on the laboratory computer.
 *
 * The three steps are numbered because they genuinely are a sequence, and
 * because the person doing them is usually on the telephone to somebody else
 * while they do it.
 *
 * The SmartScreen warning is stated before it happens rather than after. A
 * hospital that meets an unexpected security warning while installing medical
 * software stops and rings us; one that was told to expect it carries on.
 */
export default function InstallerCard({ release }: { release: ConnectorRelease | null }) {
  return (
    <section className="mb-6">
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>The lab program</h2>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
          Install this once, on the computer your analyzers are wired to.
        </p>
      </div>

      <GlassCard className="p-4">
        {!release ? (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#F1F5F9' }}>
              <HardDriveDownload className="w-4 h-4" style={{ color: '#94A3B8' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                Not available for download yet
              </p>
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                Contact us and we will send you the installer for your laboratory computer.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.08)' }}>
                <HardDriveDownload className="w-4 h-4" style={{ color: '#0D9488' }} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                  Uyirly Lab Connector
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                  Version {release.version} · {(release.size_bytes / 1048576).toFixed(0)} MB ·
                  {' '}for Windows
                </p>
              </div>

              <a href={release.url} download
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                style={{ background: '#0D9488', color: '#fff', textDecoration: 'none' }}>
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>

            <ol className="mt-4 pl-0" style={{ listStyle: 'none', counterReset: 'step' }}>
              {[
                'Copy the downloaded file to the computer beside your analyzers, and unzip it.',
                'Right-click install.ps1 and choose “Run with PowerShell”. Say yes when Windows asks for permission.',
                'Add a lab computer below, then type its pairing code when the installer asks.',
                'Give the address the installer prints to whoever services your analyzer.',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 mb-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ background: '#F1F5F9', color: '#475569' }}>{i + 1}</span>
                  <span className="text-xs" style={{ color: '#475569' }}>{step}</span>
                </li>
              ))}
            </ol>

            {!release.is_signed && (
              // Said before it happens, not after.
              <div className="mt-3 rounded-lg px-3 py-2 flex items-start gap-2"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
                <p className="text-xs" style={{ color: '#92400E' }}>
                  Windows will say the publisher is unknown. Choose <strong>More info</strong>,
                  then <strong>Run anyway</strong>. Check the file is intact first if you like —
                  its SHA-256 is{' '}
                  <span className="font-mono break-all" style={{ fontSize: '10px' }}>{release.sha256}</span>
                </p>
              </div>
            )}
          </>
        )}
      </GlassCard>
    </section>
  )
}

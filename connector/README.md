# Uyirly Lab Connector

A small program that runs on a computer in the laboratory. It takes what the
analyzers say and gets it to the hospital's Uyirly account, losing nothing on
the way.

It exists because an analyzer cannot reach the internet and will not hold a
result for you. Most instruments transmit once and forget. If nothing is
listening at that moment, that measurement is gone and somebody types it in by
hand.

## The one thing to understand

```
analyzer → handshake → DISK → uploader → Uyirly
                        ▲
                  happens first, offline,
                  before anything is sent
```

A message is written to disk the moment it is complete, **before** any attempt
to send it. Everything after that point is retry logic and can fail safely.
The disk write is the only step that cannot be repeated, so it is the one that
happens first and involves no network.

This is why the program must run in the hospital rather than in the cloud.

## Installing

```
uyirly-connector --pair K7MQ-3RXW     # code from Settings → Analyzers
uyirly-connector                       # then just run it
uyirly-connector --status              # what is waiting, and where
```

Pairing swaps the short code for a real token, writes it to disk, and the code
dies. Nobody copies or stores a token.

Then give the analyzer's service engineer the address `--status` prints —
`192.168.1.14 : 5150` — and they type it into the machine's keypad. That is the
entire setup.

## What it connects to

| Transport | Used by | Notes |
|---|---|---|
| **Network (TCP)** | Mindray BC-5130, most modern machines | The analyzer connects to us |
| **Serial (RS-232)** | Mindray BC-20s, Transasia/Erba H360 | Reconnects when a cable is knocked |
| **Watched folder** | Biochemistry analyzers that only write files | Waits until the file stops growing |

Nothing is configured per instrument. Whatever connects gets the same
handshake, and the server identifies the machine from the message it sends.

## Where things are

```
Windows   C:\ProgramData\Uyirly\Connector\
macOS     ~/.uyirly-connector/
          (override with UYIRLY_DATA_DIR)

  config.json     token, server, ports
  queue/          one .json per unsent result
  logs/           plain English, 14 days
```

The queue is deliberately one file per message rather than a database: a
broadband outage should be recoverable with a text editor and a phone call,
and there is nothing to corrupt.

Logs carry no patient data. The raw messages contain names and results, and
they live in `queue/` — a log file gets emailed around and left on a desktop.

## Rules it keeps, and where they are enforced

| Rule | Where |
|---|---|
| A corrupt frame is refused with NAK, never quietly kept | `astm-link.ts` |
| Written to disk before anything is sent | `index.ts` → `queue.ts` |
| Only an answer from the server counts as delivered | `uploader.ts` |
| The same message can never become two results | hash of the raw text, both ends |
| A revoked token backs off instead of hammering | `uploader.ts` |
| Two analyzers' records are never interleaved | one link per connection, `tcp.ts` |

## Developing

```
npm install
npm test           # the link layer, including the corrupt-frame case
npm run dev        # run from source
npm run build      # compile to dist/
```

Deliberately outside the app's `package.json` and excluded from its
`tsconfig.json`, for the same reason Playwright is: nothing here should ever be
installed on the production server.

`serialport` is an optional dependency because it is a native module — it
cannot be baked into a single-file executable, and a connector whose analyzers
are all on the network must still run without it.

### Testing without an analyzer

`test/link.test.ts` covers the handshake. For a full run, point any TCP client
at port 5150 and speak ASTM at it; the end-to-end path (handshake → disk →
server → patient) has been verified this way, including pulling the network
mid-run and watching the queue drain on reconnect.

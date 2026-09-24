-- Remember which port a message came off.
--
-- An analyzer that names itself in its header is identified by that name. One
-- that does not — an older machine, a vendor who left the field blank, a
-- serial link that dropped its first frame — used to be skipped entirely: no
-- analyzer row, so no code recorded, so the hospital was told "these codes are
-- not mapped yet" with nothing on the screen to map, and the message sat in
-- the queue for ever.
--
-- Those are now registered under a stand-in identity built from where the
-- connector heard them, so two unnamed machines on one laboratory PC stay
-- apart instead of merging into one.
--
-- That identity has to survive a replay. Without storing the source, retrying
-- a message would compute a different stand-in and create a second analyzer
-- for the same instrument.

ALTER TABLE analyzer_messages ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN analyzer_messages.source IS
  'Where the connector heard this — ''tcp 192.168.1.50'', ''serial COM3'', ''file R2609.txt''. Used to tell unnamed analyzers apart, and to keep that identity stable across a replay.';

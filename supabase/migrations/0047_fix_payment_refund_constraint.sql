-- Allow negative payment amounts for refund entries (appointment & advance refunds)
-- The original CHECK (amount > 0) blocks inserting negative payment records that
-- represent money going OUT (refunds). Change to amount != 0 to allow refunds.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount != 0);

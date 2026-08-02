-- ─────────────────────────────────────────────────────────────────────────────
-- Expenses: allow negative amounts so credits net off
--
-- Migration 072 set `amount_usd >= 0` on the assumption that an expense is
-- always positive, with `payment_status = 'refunded'` marking a reversal. The
-- backfill showed that does not hold: Content Writers row 154 is a -$20.49
-- credit, which had to be clamped to $0, leaving April 2025 reading $20.49 high.
--
-- The deeper problem is ongoing, not historical. A refunded row today still adds
-- its full amount to every total, so any refund overstates spend until someone
-- notices. A ledger needs to be able to hold a credit.
--
-- After this, `payment_status` is descriptive (what happened) and `amount_usd`
-- carries the sign (which way the money moved). A refund is a negative row.
--
-- `total_usd` is generated as amount + coalesce(tax, 0) and needs no change: it
-- follows the sign automatically.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Marketing-PM-Tool".expenses
  DROP CONSTRAINT expenses_amount_usd_check;

-- Still bounded, just symmetric. The largest single row in four years of history
-- is $3,304.43, so $1M either way catches a fat-fingered entry without getting
-- in the way of a legitimate one.
ALTER TABLE "Marketing-PM-Tool".expenses
  ADD CONSTRAINT expenses_amount_usd_check
  CHECK (amount_usd >= -1000000 AND amount_usd <= 1000000);

-- tax_usd stays non-negative: tax on a credit belongs in the credit's own
-- amount, and a negative tax with a positive amount has no meaning here.

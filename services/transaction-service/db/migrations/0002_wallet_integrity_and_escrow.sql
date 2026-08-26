-- Money-integrity constraints and escrow support for transaction_db.
--
-- Addresses two defects in 0001:
--
--   1. wallet.balance had no non-negativity constraint, and the application read-check-write
--      cycle in WalletService had no locking or concurrency token. Concurrent withdrawals could
--      each pass the "sufficient balance" check and both commit, overdrawing the wallet. The
--      application now uses an xmin concurrency token with a retry, but the database must hold
--      the invariant independently — a constraint cannot be raced.
--
--   2. wallet_transaction had a single unique index on deal_id, which enforced "at most one
--      wallet transaction per deal" and therefore made it impossible to record the seller's
--      side of a deal at all. Paying for a deal debited the buyer and credited nobody, so money
--      left the ledger permanently. Escrow needs up to three rows per deal (the buyer's PAYMENT,
--      then either a PAYOUT to the seller on completion or a REFUND to the buyer on
--      cancellation), each of which must still be unique per deal.

BEGIN;

-- 1. Balance can never go negative, whatever the application does.
ALTER TABLE transaction_db.wallet
    ADD CONSTRAINT wallet_balance_non_negative CHECK (balance >= 0);

-- 2. PAYOUT is the seller's credit when escrow is released on deal completion.
ALTER TABLE transaction_db.wallet_transaction
    DROP CONSTRAINT wallet_transaction_type_check;

ALTER TABLE transaction_db.wallet_transaction
    ADD CONSTRAINT wallet_transaction_type_check
    CHECK (type IN ('TOP_UP', 'PAYMENT', 'REFUND', 'WITHDRAWAL', 'PAYOUT'));

-- 3. Replace the blanket one-row-per-deal index with one partial index per settlement role, so
--    a deal can hold a payment AND its eventual payout/refund while each stays unique. These are
--    what make double-pay and double-release unrepresentable rather than merely unlikely.
DROP INDEX IF EXISTS transaction_db.uq_wallet_transaction_deal_id;

CREATE UNIQUE INDEX uq_wallet_transaction_deal_payment
    ON transaction_db.wallet_transaction (deal_id) WHERE type = 'PAYMENT';

CREATE UNIQUE INDEX uq_wallet_transaction_deal_payout
    ON transaction_db.wallet_transaction (deal_id) WHERE type = 'PAYOUT';

CREATE UNIQUE INDEX uq_wallet_transaction_deal_refund
    ON transaction_db.wallet_transaction (deal_id) WHERE type = 'REFUND';

-- 4. Sign discipline, matching the amount column's documented meaning. Without this, a PAYOUT
--    could be written negative (or a PAYMENT positive) and silently invert a settlement.
ALTER TABLE transaction_db.wallet_transaction
    ADD CONSTRAINT wallet_transaction_amount_sign CHECK (
        (type IN ('TOP_UP', 'REFUND', 'PAYOUT') AND amount > 0)
        OR (type IN ('PAYMENT', 'WITHDRAWAL') AND amount < 0)
    );

-- 5. Settlement rows must name the deal they settle.
ALTER TABLE transaction_db.wallet_transaction
    ADD CONSTRAINT wallet_transaction_deal_required CHECK (
        (type IN ('PAYMENT', 'PAYOUT', 'REFUND') AND deal_id IS NOT NULL)
        OR (type IN ('TOP_UP', 'WITHDRAWAL') AND deal_id IS NULL)
    );

COMMENT ON CONSTRAINT wallet_balance_non_negative ON transaction_db.wallet IS
    'Overdraft is not a supported state; the application must reject the withdrawal first.';

-- 6. Remove the row-level-security declarations added in 0001.
--
-- RLS was ENABLED on all three tables but no policy was ever defined. In Postgres that denies
-- all access except to the table owner — and the service connects as the owner, so it bypassed
-- RLS entirely and the setting protected nothing. It read as a security control in review while
-- being inert, and it would have failed every query the moment the service moved to a properly
-- least-privileged role.
--
-- Authorization for this service is enforced in the application layer (ownership checks in
-- DealService/OfferService/WalletService, which is where the marketplace-account id mapping
-- these rules depend on is available). Maintaining a second, parallel authorization system in
-- the database with no client ever connecting directly is not worth the drift risk. If direct
-- client access is ever introduced, RLS should come back WITH policies, not before.
ALTER TABLE transaction_db.wallet DISABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_db.payment_method DISABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_db.wallet_transaction DISABLE ROW LEVEL SECURITY;

COMMIT;

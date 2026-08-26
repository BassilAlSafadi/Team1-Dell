-- Restores indexes that transaction_db is missing, and adds two the new caller-scoped queries need.
--
-- Discovered by comparing the live schema against 0001 and against the EF configurations in
-- src/TransactionService.Infrastructure/Persistence/Configurations/. Every table has its primary
-- key and every foreign key is present, but all of 0001's CREATE INDEX statements are absent from
-- the database, as are the offer/deal indexes the EF model declares. The tables were evidently
-- created without them (OFFER/DEAL/DEAL_STATUS_HISTORY were applied directly via the Supabase MCP
-- rather than from a checked-in migration, per 0001's header note).
--
-- One of these is a correctness problem, not a performance one:
--
--   uq_wallet_user_id enforces "one wallet per user", which wallet's own table comment states as
--   an invariant and which the application relies on twice: FirstOrDefaultAsync(w => w.UserId ==
--   userId) assumes at most one row, and CreateWalletAsync catches the unique violation to turn a
--   concurrent double-create into a 409. Without the index a user can end up with two wallets,
--   balance lookups become nondeterministic between them, and the 409 path can never fire.
--
-- All statements use IF NOT EXISTS so this is safe to re-run and safe on an environment where
-- 0001's indexes did survive.

BEGIN;

-- Guard: creating uq_wallet_user_id fails if duplicate wallets already exist. Surface that as a
-- clear error rather than a raw index-build failure, since it would need reconciling by hand
-- (deciding which wallet is authoritative is a business decision, not a mechanical one).
DO $$
DECLARE
    duplicate_users int;
BEGIN
    SELECT count(*) INTO duplicate_users
    FROM (SELECT user_id FROM transaction_db.wallet GROUP BY user_id HAVING count(*) > 1) d;

    IF duplicate_users > 0 THEN
        RAISE EXCEPTION
            'Cannot create uq_wallet_user_id: % user(s) already have more than one wallet. '
            'Reconcile these before applying this migration.', duplicate_users;
    END IF;
END $$;

-- 1. wallet — the one-wallet-per-user invariant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_user_id
    ON transaction_db.wallet (user_id);

-- 2. payment_method / wallet_transaction — foreign-key and filter columns from 0001.
CREATE INDEX IF NOT EXISTS idx_payment_method_wallet
    ON transaction_db.payment_method (wallet_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transaction_wallet
    ON transaction_db.wallet_transaction (wallet_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transaction_payment_method
    ON transaction_db.wallet_transaction (payment_method_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transaction_status
    ON transaction_db.wallet_transaction (status);

-- 3. offer / deal — declared by the EF model but absent from the database.
CREATE INDEX IF NOT EXISTS idx_offer_buyer   ON transaction_db.offer (buyer_id);
CREATE INDEX IF NOT EXISTS idx_offer_seller  ON transaction_db.offer (seller_id);
CREATE INDEX IF NOT EXISTS idx_offer_listing ON transaction_db.offer (listing_id);
CREATE INDEX IF NOT EXISTS idx_offer_status  ON transaction_db.offer (status);

CREATE INDEX IF NOT EXISTS idx_deal_status ON transaction_db.deal (status);

CREATE INDEX IF NOT EXISTS idx_deal_status_history_deal
    ON transaction_db.deal_status_history (deal_id);

-- 4. New: deal lookups by party.
--
-- GET /api/deals/mine resolves the caller to their marketplace account ids and filters
-- deal.buyer_id / seller_id by them. That replaced the old party/{id} route, so this access
-- pattern is now on the request path for every user viewing their deals; without these it is a
-- sequential scan of the whole deal table per request. The equivalent offer lookup is covered by
-- idx_offer_buyer / idx_offer_seller above.
CREATE INDEX IF NOT EXISTS idx_deal_buyer  ON transaction_db.deal (buyer_id);
CREATE INDEX IF NOT EXISTS idx_deal_seller ON transaction_db.deal (seller_id);

COMMIT;

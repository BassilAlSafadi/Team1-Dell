-- Wallet flow for transaction_db, per services/transaction-service/EERD.md.
-- OFFER, DEAL, DEAL_STATUS_HISTORY already exist in transaction_db (applied directly via
-- Supabase MCP, not checked in here — see the auth-service equivalent gap noted in CLAUDE.md).
-- This adds WALLET, PAYMENT_METHOD, WALLET_TRANSACTION.

CREATE TABLE transaction_db.wallet (
    wallet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    balance numeric(14,2) NOT NULL DEFAULT 0,
    currency char(3) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE transaction_db.wallet IS 'One per user. balance is authoritative, updated in the same DB transaction as the WALLET_TRANSACTION row that changes it.';
COMMENT ON COLUMN transaction_db.wallet.user_id IS 'EXT -> Auth Service USER.user_id, no physical FK';

CREATE UNIQUE INDEX uq_wallet_user_id ON transaction_db.wallet (user_id);

CREATE TABLE transaction_db.payment_method (
    payment_method_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id uuid NOT NULL REFERENCES transaction_db.wallet (wallet_id),
    type varchar(16) NOT NULL CHECK (type IN ('CARD', 'BANK_TRANSFER', 'CASH')),
    provider varchar(50) NULL,
    external_token varchar(255) NULL,
    last4 varchar(4) NULL,
    is_default boolean NOT NULL DEFAULT false,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REMOVED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE transaction_db.payment_method IS 'Funding sources for wallet top-ups. Raw card/bank details are never stored here, only a tokenised reference.';

CREATE INDEX idx_payment_method_wallet ON transaction_db.payment_method (wallet_id);

CREATE TABLE transaction_db.wallet_transaction (
    wallet_transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id uuid NOT NULL REFERENCES transaction_db.wallet (wallet_id),
    payment_method_id uuid NULL REFERENCES transaction_db.payment_method (payment_method_id),
    deal_id uuid NULL REFERENCES transaction_db.deal (deal_id),
    type varchar(16) NOT NULL CHECK (type IN ('TOP_UP', 'PAYMENT', 'REFUND', 'WITHDRAWAL')),
    amount numeric(14,2) NOT NULL CHECK (amount <> 0),
    currency char(3) NOT NULL,
    balance_after numeric(14,2) NOT NULL,
    external_reference varchar(255) NULL,
    status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz NULL
);

COMMENT ON TABLE transaction_db.wallet_transaction IS 'Append-only ledger. A COMPLETED row is never edited or deleted; reversals insert a compensating row instead.';
COMMENT ON COLUMN transaction_db.wallet_transaction.payment_method_id IS 'Set only when type = TOP_UP, naming the funding source';
COMMENT ON COLUMN transaction_db.wallet_transaction.deal_id IS 'Set only when type = PAYMENT, naming which deal this paid for. At most one wallet transaction per deal.';
COMMENT ON COLUMN transaction_db.wallet_transaction.amount IS 'Signed: TOP_UP/REFUND positive (credit), PAYMENT/WITHDRAWAL negative (debit)';
COMMENT ON COLUMN transaction_db.wallet_transaction.balance_after IS 'Snapshot of wallet.balance immediately after this row was applied';
COMMENT ON COLUMN transaction_db.wallet_transaction.external_reference IS 'Payment gateway transaction id, for reconciliation';

CREATE INDEX idx_wallet_transaction_wallet ON transaction_db.wallet_transaction (wallet_id);
CREATE INDEX idx_wallet_transaction_payment_method ON transaction_db.wallet_transaction (payment_method_id);
CREATE UNIQUE INDEX uq_wallet_transaction_deal_id ON transaction_db.wallet_transaction (deal_id);
CREATE INDEX idx_wallet_transaction_status ON transaction_db.wallet_transaction (status);

ALTER TABLE transaction_db.wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_db.payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_db.wallet_transaction ENABLE ROW LEVEL SECURITY;

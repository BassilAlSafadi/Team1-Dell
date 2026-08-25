-- Vendor reviews: one reviewer may leave at most one review per vendor (upserted on re-review).
-- Average rating is computed on read (COUNT/AVG over this table) rather than denormalized onto
-- auth_db.users, so it can never drift out of sync with the underlying rows.
CREATE TABLE auth_db.review (
    review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid NOT NULL REFERENCES auth_db.users(user_id),
    reviewer_id uuid NOT NULL REFERENCES auth_db.users(user_id),
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_reviewer_not_vendor CHECK (reviewer_id <> vendor_id),
    CONSTRAINT review_vendor_reviewer_unique UNIQUE (vendor_id, reviewer_id)
);

COMMENT ON TABLE auth_db.review IS 'One review per (vendor_id, reviewer_id); re-reviewing updates the existing row';

CREATE INDEX review_vendor_id_idx ON auth_db.review (vendor_id);
CREATE INDEX review_reviewer_id_idx ON auth_db.review (reviewer_id);

ALTER TABLE auth_db.review ENABLE ROW LEVEL SECURITY;

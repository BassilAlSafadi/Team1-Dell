-- Adds nullable columns the RegisterPage's vendor form already collects that the base EERD
-- vendor table (0001) doesn't have room for (fulfillment method, operating hours, minimum
-- amount, a free-text location, and a lightweight category preference for matching), plus the
-- same free-text location column on corporate for symmetry. Seeds the category lookup table
-- (was empty) to match AddWasteModal's existing waste-type options exactly.

ALTER TABLE marketplace_db.vendor
    ADD COLUMN IF NOT EXISTS category_preference varchar(100) NULL,
    ADD COLUMN IF NOT EXISTS fulfillment_method varchar(50) NULL,
    ADD COLUMN IF NOT EXISTS operating_hours varchar(100) NULL,
    ADD COLUMN IF NOT EXISTS location_text varchar(255) NULL,
    ADD COLUMN IF NOT EXISTS minimum_amount numeric(14,2) NULL;

ALTER TABLE marketplace_db.corporate
    ADD COLUMN IF NOT EXISTS location_text varchar(255) NULL;

INSERT INTO marketplace_db.category (name, description) VALUES
    ('Plastic', 'Plastic waste and recyclables'),
    ('Glass', 'Glass waste and recyclables'),
    ('Metal', 'Metal waste and recyclables'),
    ('Cardboard', 'Cardboard waste and recyclables'),
    ('Paper', 'Paper waste and recyclables'),
    ('Other', 'Uncategorized or mixed waste')
ON CONFLICT DO NOTHING;

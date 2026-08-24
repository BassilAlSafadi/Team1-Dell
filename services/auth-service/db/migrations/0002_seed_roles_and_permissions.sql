-- Idempotent seed for the open lookup tables. Safe to re-run.

INSERT INTO auth_db.role (name, description) VALUES
    ('USER', 'Standard authenticated user'),
    ('VENDOR', 'Vendor account'),
    ('CORPORATE', 'Corporate account'),
    ('ADMIN', 'Platform administrator'),
    ('MODERATOR', 'Content moderator')
ON CONFLICT (name) DO NOTHING;

INSERT INTO auth_db.permission (name, description) VALUES
    ('CREATE_LISTING', 'Create a marketplace listing'),
    ('EDIT_LISTING', 'Edit a marketplace listing'),
    ('DELETE_LISTING', 'Delete a marketplace listing'),
    ('MAKE_OFFER', 'Make an offer on a listing'),
    ('MANAGE_USERS', 'Manage user accounts'),
    ('VERIFY_VENDOR', 'Verify a vendor or corporate account'),
    ('MODERATE_CONTENT', 'Moderate listings, reviews and comments')
ON CONFLICT (name) DO NOTHING;

-- Starting-point role -> permission grants. Adjust as the product rules firm up.
INSERT INTO auth_db.role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM auth_db.role r
JOIN auth_db.permission p ON (
    (r.name = 'USER' AND p.name = 'MAKE_OFFER') OR
    (r.name = 'VENDOR' AND p.name IN ('CREATE_LISTING', 'EDIT_LISTING', 'DELETE_LISTING', 'MAKE_OFFER')) OR
    (r.name = 'CORPORATE' AND p.name IN ('CREATE_LISTING', 'EDIT_LISTING', 'DELETE_LISTING')) OR
    (r.name = 'ADMIN') OR
    (r.name = 'MODERATOR' AND p.name IN ('MODERATE_CONTENT', 'VERIFY_VENDOR'))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

#!/usr/bin/env python3
"""Seeds demo vendors and businesses across every store the app reads from.

Creates 15 vendor accounts and 15 corporate (business) accounts, each one a real
signed-in-able account:

  auth_db.users / auth_identity / user_role  (Supabase Postgres) — Argon2id password
  marketplace_db.vendor / corporate          (Supabase Postgres) — the profiles the
                                             Find Vendors / Find Businesses pages list
  marketplace_db.listing                     — waste each business has on offer
  auth_db.review                             — so vendors show a real average rating
  notification_db.notifications              (MongoDB Atlas)
  messaging_db.conversations / messages      (MongoDB Atlas)

Idempotent: every account's ids are derived from its email with uuid5, and every
insert is an upsert, so re-running updates in place rather than duplicating.

Run it from the repo root on the deploy VM (it reads the services' own .env files):

    python3 deploy/seed/seed_data.py            # seed everything
    python3 deploy/seed/seed_data.py --purge    # remove previously seeded rows

Seeded accounts all share the password below and are email-verified/ACTIVE, so you
can log in as any of them immediately.
"""

from __future__ import annotations

import argparse
import base64
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from argon2.low_level import Type, hash_secret_raw
from pymongo import MongoClient

REPO_ROOT = Path(__file__).resolve().parents[2]

SEED_PASSWORD = "RecycleHub2026!"

# Marks every row this script creates so --purge can find them again without
# touching real accounts.
SEED_EMAIL_DOMAIN = "recyclehub-demo.example"

# Namespace for uuid5 — makes ids stable across runs so re-seeding is an update.
SEED_NS = uuid.UUID("6f1d2c3b-4a59-4e87-9b0c-2d5a7e8f1c40")

# auth-service PasswordHasher: Argon2id, 4 lanes / 64 MB / 3 passes, 32-byte hash,
# stored as base64(salt):base64(hash). Must stay in step with
# services/auth-service/src/AuthService.Infrastructure/Security/PasswordHasher.cs.
ARGON2_PARALLELISM = 4
ARGON2_MEMORY_KB = 65536
ARGON2_ITERATIONS = 3
ARGON2_HASH_LEN = 32
ARGON2_SALT_LEN = 16

CITIES = [
    ("Cairo", 30.0444, 31.2357),
    ("Giza", 30.0131, 31.2089),
    ("Alexandria", 31.2001, 29.9187),
    ("Port Said", 31.2653, 32.3019),
    ("Mansoura", 31.0409, 31.3785),
    ("Tanta", 30.7865, 31.0004),
    ("Asyut", 27.1783, 31.1859),
    ("Luxor", 25.6872, 32.6396),
]

# (vendor name, category preference, fulfillment, hours, minimum kg, description)
VENDORS = [
    ("Nile Recycling Co.", "Plastic", "both", "Sun-Thu, 8am-6pm", 50,
     "Bulk PET and HDPE processing with same-week collection across Greater Cairo."),
    ("Delta Metal Traders", "Metal", "pickup", "Sat-Thu, 7am-5pm", 100,
     "Ferrous and non-ferrous scrap buyers serving the Delta industrial belt."),
    ("GreenLeaf Paper Mills", "Paper", "delivery", "Sun-Thu, 9am-5pm", 200,
     "Office paper, newsprint and mixed fibre recovered into packaging board."),
    ("Alex Glass Works", "Glass", "both", "Sun-Fri, 8am-4pm", 75,
     "Cullet sorting and colour separation for container glass manufacture."),
    ("Cairo Cardboard Collective", "Cardboard", "pickup", "Daily, 6am-8pm", 150,
     "Corrugated and carton collection from retail and logistics sites."),
    ("Suez E-Waste Solutions", "Other", "delivery", "Sun-Thu, 10am-6pm", 20,
     "Certified WEEE handling with data-destruction certificates."),
    ("Upper Egypt Organics", "Other", "pickup", "Sat-Thu, 5am-3pm", 300,
     "Food and agricultural residue composted into soil conditioner."),
    ("Pyramid Plastics Recovery", "Plastic", "both", "Sun-Thu, 8am-7pm", 60,
     "Film, rigid and mixed polymer reprocessing into recycled pellets."),
    ("Red Sea Metals", "Metal", "delivery", "Sat-Wed, 8am-6pm", 120,
     "Aluminium, copper and brass buyers with weighbridge on site."),
    ("Mansoura Paper Recovery", "Paper", "pickup", "Sun-Thu, 8am-5pm", 180,
     "Confidential document shredding and baled paper recovery."),
    ("Luxor Glass Recyclers", "Glass", "pickup", "Sat-Thu, 7am-3pm", 90,
     "Hospitality-sector glass collection across the Nile corridor."),
    ("Tanta Board & Carton", "Cardboard", "both", "Sun-Thu, 8am-6pm", 130,
     "Baling and repulping for the Delta's packaging manufacturers."),
    ("Sinai Scrap Exchange", "Metal", "both", "Sun-Fri, 7am-4pm", 110,
     "Construction and demolition metal recovery with on-call haulage."),
    ("Zamalek Waste Partners", "Plastic", "delivery", "Daily, 9am-9pm", 40,
     "Small-batch collection tailored to restaurants and cafés."),
    ("Heliopolis Recycling Hub", "Other", "both", "Sun-Thu, 8am-6pm", 25,
     "Mixed-stream sorting facility handling all household recyclables."),
]

# (company name, industry, description)
CORPORATES = [
    ("Cairo Grand Hotel", "Hospitality",
     "420-room hotel separating glass, plastic and organics across four kitchens."),
    ("Nile View Restaurants Group", "Food & Beverage",
     "Eleven riverside restaurants with a shared central commissary."),
    ("Delta Textiles Ltd.", "Manufacturing",
     "Cotton spinning and dyeing plant with significant packaging waste."),
    ("Alexandria Port Logistics", "Logistics",
     "Container depot generating pallets, shrink wrap and steel banding."),
    ("Giza Medical Center", "Healthcare",
     "Private hospital segregating non-hazardous paper, card and plastics."),
    ("Smart Cairo Offices", "Real Estate",
     "Grade-A office tower running a tenant-wide recycling programme."),
    ("Sphinx Beverages", "Food & Beverage",
     "Bottling plant with high-volume PET and aluminium can returns."),
    ("Mediterranean Retail Group", "Retail",
     "Supermarket chain of 34 stores across Alexandria and the North Coast."),
    ("Aswan Construction Co.", "Construction",
     "Civil contractor recovering metal, timber and rubble from sites."),
    ("Sun City Resorts", "Hospitality",
     "Red Sea resort group with three properties and 900 rooms combined."),
    ("Cleopatra Cosmetics", "Manufacturing",
     "Personal-care manufacturer with carton and rigid plastic offcuts."),
    ("Ramses Print House", "Printing",
     "Commercial printer producing several tonnes of paper trim monthly."),
    ("Horus Electronics", "Electronics",
     "Assembly plant retiring components, reels and anti-static packaging."),
    ("Oasis Agriculture", "Agriculture",
     "Greenhouse producer with irrigation film and crate waste streams."),
    ("Karnak University", "Education",
     "Campus of 18,000 students running paper and e-waste collection points."),
]

LISTING_TEMPLATES = [
    ("Mixed PET bottles", "Plastic", "Clear and coloured PET, rinsed and debagged.", 320, "KG"),
    ("Cardboard cartons (baled)", "Cardboard", "Flattened OCC bales, dry storage.", 1.2, "TONNE"),
    ("Office paper", "Paper", "Sorted white office paper, staples removed.", 450, "KG"),
    ("Aluminium cans", "Metal", "Post-consumer beverage cans, loose.", 180, "KG"),
    ("Glass bottles", "Glass", "Mixed-colour container glass from bar service.", 600, "KG"),
    ("Shrink wrap film", "Plastic", "LDPE pallet wrap, clean and baled.", 240, "KG"),
    ("Steel banding & offcuts", "Metal", "Mild steel strapping and cut ends.", 900, "KG"),
    ("Kitchen organics", "Other", "Pre-consumer food prep waste, daily collection.", 500, "KG"),
]

NOTIFICATION_TEMPLATES = [
    ("NEW_OFFER", "New offer received", "A vendor has made an offer on your listing."),
    ("OFFER_ACCEPTED", "Offer accepted", "Your offer was accepted — arrange handover."),
    ("DEAL_COMPLETED", "Deal completed", "The deal has been marked complete and funds released."),
    ("NEW_MESSAGE", "New message", "You have a new message about a listing."),
    ("NEW_REVIEW", "New review", "A business left a review on your vendor profile."),
]

CONVERSATION_SCRIPTS = [
    [
        "Hi — we have around 300kg of mixed PET ready for collection this week.",
        "Great, we can do Wednesday morning. Is it baled or loose?",
        "Loose in bags, stored under cover at the service entrance.",
        "That works. I'll send an offer through now.",
    ],
    [
        "Do you take glass from restaurant service? Roughly 600kg a month.",
        "Yes, mixed colour is fine. We collect fortnightly in your area.",
        "Perfect — what's your rate per tonne?",
    ],
    [
        "We've got baled cardboard, about 1.2 tonnes.",
        "We'll take the lot. Can you hold it until Sunday?",
        "Yes, it's dry-stored. See you Sunday.",
    ],
]


def load_env(path: Path) -> dict[str, str]:
    """Minimal .env reader — the services' files are plain KEY=VALUE, no interpolation."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def dotnet_conn_to_uri(conn: str) -> str:
    """Turns the ADO.NET connection string in auth-service/.env into a libpq URI."""
    parts: dict[str, str] = {}
    for chunk in conn.split(";"):
        if "=" in chunk:
            key, _, value = chunk.partition("=")
            parts[key.strip().lower()] = value.strip()

    host = parts.get("host", "localhost")
    port = parts.get("port", "5432")
    db = parts.get("database", "postgres")
    user = parts.get("username") or parts.get("user id") or parts.get("userid", "")
    password = parts.get("password", "")
    sslmode = parts.get("sslmode", "require")

    from urllib.parse import quote

    return (
        f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@{host}:{port}/{db}?sslmode={sslmode}"
    )


def hash_password(password: str) -> str:
    """Argon2id in the exact shape auth-service's PasswordHasher.Verify expects."""
    salt = os.urandom(ARGON2_SALT_LEN)
    raw = hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=ARGON2_ITERATIONS,
        memory_cost=ARGON2_MEMORY_KB,
        parallelism=ARGON2_PARALLELISM,
        hash_len=ARGON2_HASH_LEN,
        type=Type.ID,
    )
    return f"{base64.b64encode(salt).decode()}:{base64.b64encode(raw).decode()}"


def slug(name: str) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in name]
    return "".join(keep).strip("-").replace("--", "-").replace("--", "-")


def email_for(name: str) -> str:
    return f"{slug(name)}@{SEED_EMAIL_DOMAIN}"


def uid_for(email: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NS, email)


def build_accounts() -> tuple[list[dict], list[dict]]:
    rng = random.Random(20260827)
    now = datetime.now(timezone.utc)

    vendors = []
    for index, (name, category, fulfillment, hours, minimum, description) in enumerate(VENDORS):
        city, lat, lon = CITIES[index % len(CITIES)]
        email = email_for(name)
        vendors.append(
            {
                "email": email,
                "user_id": uid_for(email),
                "vendor_id": uuid.uuid5(SEED_NS, f"vendor:{email}"),
                "name": name,
                "description": description,
                "category_preference": category,
                "fulfillment_method": fulfillment,
                "operating_hours": hours,
                "minimum_amount": minimum,
                "location_text": f"{city}, Egypt",
                "city": city,
                "lat": lat,
                "lon": lon,
                "brn": f"VND-{2026000 + index}",
                # A spread of verification states reads more like real data than all-verified.
                "verification_status": "VERIFIED" if index % 4 else "PENDING",
                "created_at": now - timedelta(days=rng.randint(30, 400)),
            }
        )

    corporates = []
    for index, (name, industry, description) in enumerate(CORPORATES):
        city, lat, lon = CITIES[(index + 3) % len(CITIES)]
        email = email_for(name)
        corporates.append(
            {
                "email": email,
                "user_id": uid_for(email),
                "corporate_id": uuid.uuid5(SEED_NS, f"corporate:{email}"),
                "name": name,
                "description": description,
                "industry": industry,
                "website": f"https://www.{slug(name)}.example",
                "location_text": f"{city}, Egypt",
                "city": city,
                "lat": lat,
                "lon": lon,
                "brn": f"CRP-{2026000 + index}",
                "verification_status": "VERIFIED" if index % 5 else "PENDING",
                "created_at": now - timedelta(days=rng.randint(30, 400)),
            }
        )

    return vendors, corporates


def seed_postgres(conn_uri: str, vendors: list[dict], corporates: list[dict]) -> None:
    rng = random.Random(11)
    now = datetime.now(timezone.utc)
    everyone = [(v, "VENDOR") for v in vendors] + [(c, "CORPORATE") for c in corporates]

    with psycopg.connect(conn_uri) as conn:
        with conn.cursor() as cur:
            print(f"  auth_db: upserting {len(everyone)} users…")
            for account, role in everyone:
                # email_verified/ACTIVE up front: a seeded account you cannot log into is
                # useless, and the emailed code obviously never arrives for these addresses.
                cur.execute(
                    """
                    INSERT INTO auth_db.users
                        (user_id, email, email_verified, phone_verified, status, created_at, updated_at)
                    VALUES (%s, %s, true, false, 'ACTIVE', %s, now())
                    ON CONFLICT (user_id) DO UPDATE
                        SET email = EXCLUDED.email,
                            email_verified = true,
                            status = 'ACTIVE',
                            updated_at = now()
                    """,
                    (account["user_id"], account["email"], account["created_at"]),
                )

                # Conflict target is the primary key, not (provider, provider_user_id): the
                # live database has no unique index on that pair even though the EF model
                # declares one. identity_id is uuid5-derived, so the PK is just as stable.
                cur.execute(
                    """
                    INSERT INTO auth_db.auth_identity
                        (identity_id, user_id, provider, provider_user_id, password_hash, created_at)
                    VALUES (%s, %s, 'LOCAL', %s, %s, %s)
                    ON CONFLICT (identity_id) DO UPDATE
                        SET password_hash = EXCLUDED.password_hash
                    """,
                    (
                        uuid.uuid5(SEED_NS, f"identity:{account['email']}"),
                        account["user_id"],
                        account["email"],
                        hash_password(SEED_PASSWORD),
                        account["created_at"],
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO auth_db.user_role (user_id, role_id, assigned_at)
                    SELECT %s, r.role_id, now() FROM auth_db.role r WHERE r.name = %s
                    ON CONFLICT DO NOTHING
                    """,
                    (account["user_id"], role),
                )

            print(f"  marketplace_db: upserting {len(vendors)} vendors…")
            for vendor in vendors:
                cur.execute(
                    """
                    INSERT INTO marketplace_db.vendor
                        (vendor_id, user_id, vendor_name, description, business_registration_number,
                         verification_status, verified_at, created_at, updated_at,
                         category_preference, fulfillment_method, operating_hours, location_text,
                         minimum_amount)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now(), %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id) DO UPDATE SET
                        vendor_name = EXCLUDED.vendor_name,
                        description = EXCLUDED.description,
                        verification_status = EXCLUDED.verification_status,
                        category_preference = EXCLUDED.category_preference,
                        fulfillment_method = EXCLUDED.fulfillment_method,
                        operating_hours = EXCLUDED.operating_hours,
                        location_text = EXCLUDED.location_text,
                        minimum_amount = EXCLUDED.minimum_amount,
                        updated_at = now()
                    """,
                    (
                        vendor["vendor_id"],
                        vendor["user_id"],
                        vendor["name"],
                        vendor["description"],
                        vendor["brn"],
                        vendor["verification_status"],
                        vendor["created_at"] if vendor["verification_status"] == "VERIFIED" else None,
                        vendor["created_at"],
                        vendor["category_preference"],
                        vendor["fulfillment_method"],
                        vendor["operating_hours"],
                        vendor["location_text"],
                        vendor["minimum_amount"],
                    ),
                )

            print(f"  marketplace_db: upserting {len(corporates)} businesses…")
            for corporate in corporates:
                cur.execute(
                    """
                    INSERT INTO marketplace_db.corporate
                        (corporate_id, user_id, company_name, description, business_registration_number,
                         industry, website, verification_status, verified_at, created_at, updated_at,
                         location_text)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), %s)
                    ON CONFLICT (user_id) DO UPDATE SET
                        company_name = EXCLUDED.company_name,
                        description = EXCLUDED.description,
                        industry = EXCLUDED.industry,
                        website = EXCLUDED.website,
                        verification_status = EXCLUDED.verification_status,
                        location_text = EXCLUDED.location_text,
                        updated_at = now()
                    """,
                    (
                        corporate["corporate_id"],
                        corporate["user_id"],
                        corporate["name"],
                        corporate["description"],
                        corporate["brn"],
                        corporate["industry"],
                        corporate["website"],
                        corporate["verification_status"],
                        corporate["created_at"] if corporate["verification_status"] == "VERIFIED" else None,
                        corporate["created_at"],
                        corporate["location_text"],
                    ),
                )

            # Categories are seeded by migration 0002; map name -> id so listings can point at them.
            cur.execute("SELECT name, category_id FROM marketplace_db.category")
            category_ids = {name: cid for name, cid in cur.fetchall()}

            print("  marketplace_db: upserting listings…")
            listing_count = 0
            for corporate in corporates:
                cur.execute(
                    """
                    INSERT INTO marketplace_db.location (location_id, country, city, address, latitude, longitude)
                    VALUES (%s, 'EG', %s, %s, %s, %s)
                    ON CONFLICT (location_id) DO UPDATE SET city = EXCLUDED.city
                    """,
                    (
                        uuid.uuid5(SEED_NS, f"location:{corporate['email']}"),
                        corporate["city"],
                        f"{corporate['name']}, {corporate['city']}",
                        corporate["lat"],
                        corporate["lon"],
                    ),
                )

                for offset in range(2):
                    title, category_name, description, quantity, unit = LISTING_TEMPLATES[
                        (corporates.index(corporate) * 2 + offset) % len(LISTING_TEMPLATES)
                    ]
                    category_id = category_ids.get(category_name) or category_ids.get("Other")
                    if category_id is None:
                        continue
                    cur.execute(
                        """
                        INSERT INTO marketplace_db.listing
                            (listing_id, owner_id, title, description, category_id, condition,
                             quantity, unit, expected_amount, currency, location_id, status,
                             created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, 'MIXED', %s, %s, %s, 'EGP', %s, 'ACTIVE', %s, now())
                        ON CONFLICT (listing_id) DO UPDATE SET
                            title = EXCLUDED.title,
                            description = EXCLUDED.description,
                            quantity = EXCLUDED.quantity,
                            updated_at = now()
                        """,
                        (
                            uuid.uuid5(SEED_NS, f"listing:{corporate['email']}:{offset}"),
                            corporate["user_id"],
                            title,
                            description,
                            category_id,
                            quantity,
                            unit,
                            round(quantity * rng.uniform(3.5, 9.0), 2),
                            uuid.uuid5(SEED_NS, f"location:{corporate['email']}"),
                            corporate["created_at"] + timedelta(days=offset),
                        ),
                    )
                    listing_count += 1

            # review_id is uuid5(vendor, reviewer) so the PK doubles as the natural key the
            # live schema is missing (0003's review_vendor_reviewer_unique was never applied).
            print(f"  auth_db: upserting reviews for {len(vendors)} vendors…")
            review_count = 0
            for vendor in vendors:
                for reviewer in rng.sample(corporates, 3):
                    cur.execute(
                        """
                        INSERT INTO auth_db.review
                            (review_id, vendor_id, reviewer_id, rating, comment, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (review_id) DO UPDATE SET
                            rating = EXCLUDED.rating,
                            comment = EXCLUDED.comment,
                            updated_at = now()
                        """,
                        (
                            uuid.uuid5(SEED_NS, f"review:{vendor['email']}:{reviewer['email']}"),
                            vendor["user_id"],
                            reviewer["user_id"],
                            rng.randint(3, 5),
                            rng.choice(
                                [
                                    "Collected on time and the paperwork was in order.",
                                    "Fair pricing and a straightforward handover.",
                                    "Responsive team, would work with them again.",
                                    "Good communication throughout the pickup.",
                                    "Reliable weekly service, no issues so far.",
                                ]
                            ),
                            now - timedelta(days=rng.randint(1, 200)),
                        ),
                    )
                    review_count += 1

        conn.commit()

    print(f"  postgres done: {len(everyone)} users, {len(vendors)} vendors, "
          f"{len(corporates)} businesses, {listing_count} listings, {review_count} reviews")


def seed_mongo(
    notif_uri: str,
    notif_db_name: str,
    msg_uri: str,
    msg_db_name: str,
    vendors: list[dict],
    corporates: list[dict],
) -> None:
    rng = random.Random(7)
    now = datetime.now(timezone.utc)

    # Notifications and messaging live in separate Atlas clusters (database-per-service),
    # so they need separate clients — not two databases on one connection.
    notif_client = MongoClient(notif_uri)
    msg_client = MongoClient(msg_uri)
    notif_db = notif_client[notif_db_name]
    msg_db = msg_client[msg_db_name]

    print(f"  {notif_db_name}: upserting notifications…")
    notif_count = 0
    for account in vendors + corporates:
        for index in range(3):
            ntype, title, body = NOTIFICATION_TEMPLATES[
                (hash(account["email"]) + index) % len(NOTIFICATION_TEMPLATES)
            ]
            key = f"{account['email']}:{index}"
            notif_db["notifications"].update_one(
                {"seed_key": key},
                {
                    "$set": {
                        "seed_key": key,
                        "user_id": str(account["user_id"]),
                        "type": ntype,
                        "title": title,
                        "body": body,
                        "actor_id": None,
                        "entity": {"type": "listing", "id": str(uuid.uuid5(SEED_NS, key))},
                        "is_read": index > 0,
                        "created_at": now - timedelta(hours=rng.randint(1, 240)),
                        "read_at": None if index == 0 else now - timedelta(hours=rng.randint(1, 40)),
                    }
                },
                upsert=True,
            )
            notif_count += 1

    print(f"  {msg_db_name}: upserting conversations…")
    convo_count = 0
    message_count = 0
    for index, (vendor, corporate) in enumerate(zip(vendors, corporates)):
        script = CONVERSATION_SCRIPTS[index % len(CONVERSATION_SCRIPTS)]
        seed_key = f"{vendor['email']}|{corporate['email']}"
        started = now - timedelta(days=rng.randint(1, 30))

        convo = msg_db["conversations"].find_one_and_update(
            {"seed_key": seed_key},
            {
                "$set": {
                    "seed_key": seed_key,
                    "participants": [
                        {"user_id": str(vendor["user_id"]), "role": "vendor"},
                        {"user_id": str(corporate["user_id"]), "role": "corporate"},
                    ],
                    "listing_id": str(uuid.uuid5(SEED_NS, f"listing:{corporate['email']}:0")),
                    "created_at": started,
                    "updated_at": started + timedelta(minutes=len(script) * 4),
                }
            },
            upsert=True,
            return_document=True,
        )
        convo_id = convo["_id"]
        convo_count += 1

        last_message_id = None
        for turn, content in enumerate(script):
            # Alternating turns, business opening the thread about its own listing.
            sender = corporate if turn % 2 == 0 else vendor
            sent_at = started + timedelta(minutes=turn * 4)
            message = msg_db["messages"].find_one_and_update(
                {"seed_key": f"{seed_key}:{turn}"},
                {
                    "$set": {
                        "seed_key": f"{seed_key}:{turn}",
                        "conversation_id": convo_id,
                        "sender_id": str(sender["user_id"]),
                        "content": content,
                        "message_type": "text",
                        "attachments": [],
                        "reply_to_message_id": None,
                        "reactions": [],
                        "deleted_at": None,
                        "created_at": sent_at,
                        "updated_at": sent_at,
                    }
                },
                upsert=True,
                return_document=True,
            )
            last_message_id = message["_id"]
            last_sender = sender
            last_content = content
            last_sent = sent_at
            message_count += 1

        msg_db["conversations"].update_one(
            {"_id": convo_id},
            {
                "$set": {
                    "last_message": {
                        "message_id": last_message_id,
                        "sender_id": str(last_sender["user_id"]),
                        "content_preview": last_content[:120],
                        "sent_at": last_sent,
                    }
                }
            },
        )

        for participant in (vendor, corporate):
            msg_db["conversation_participants"].update_one(
                {"conversation_id": convo_id, "user_id": str(participant["user_id"])},
                {
                    "$set": {
                        "seed_key": seed_key,
                        "conversation_id": convo_id,
                        "user_id": str(participant["user_id"]),
                        "joined_at": started,
                        "last_read_message_id": None,
                        "last_read_at": None,
                        "muted": False,
                        "archived": False,
                    }
                },
                upsert=True,
            )

    notif_client.close()
    msg_client.close()
    print(f"  mongo done: {notif_count} notifications, {convo_count} conversations, "
          f"{message_count} messages")


def purge(
    conn_uri: str,
    notif_uri: str,
    notif_db_name: str,
    msg_uri: str,
    msg_db_name: str,
) -> None:
    like = f"%@{SEED_EMAIL_DOMAIN}"
    with psycopg.connect(conn_uri) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM auth_db.users WHERE email LIKE %s", (like,))
            ids = [row[0] for row in cur.fetchall()]
            if ids:
                # Children first — every one of these has a FK onto users.
                cur.execute("DELETE FROM marketplace_db.listing WHERE owner_id = ANY(%s)", (ids,))
                cur.execute("DELETE FROM marketplace_db.vendor WHERE user_id = ANY(%s)", (ids,))
                cur.execute("DELETE FROM marketplace_db.corporate WHERE user_id = ANY(%s)", (ids,))
                cur.execute(
                    "DELETE FROM auth_db.review WHERE vendor_id = ANY(%s) OR reviewer_id = ANY(%s)",
                    (ids, ids),
                )
                cur.execute("DELETE FROM auth_db.user_role WHERE user_id = ANY(%s)", (ids,))
                cur.execute("DELETE FROM auth_db.auth_identity WHERE user_id = ANY(%s)", (ids,))
                cur.execute("DELETE FROM auth_db.users WHERE user_id = ANY(%s)", (ids,))
        conn.commit()
    print(f"  postgres: removed {len(ids)} seeded accounts and their rows")

    notif_client = MongoClient(notif_uri)
    msg_client = MongoClient(msg_uri)
    n = notif_client[notif_db_name]["notifications"].delete_many({"seed_key": {"$exists": True}})
    c = msg_client[msg_db_name]["conversations"].delete_many({"seed_key": {"$exists": True}})
    m = msg_client[msg_db_name]["messages"].delete_many({"seed_key": {"$exists": True}})
    p = msg_client[msg_db_name]["conversation_participants"].delete_many(
        {"seed_key": {"$exists": True}}
    )
    notif_client.close()
    msg_client.close()
    print(f"  mongo: removed {n.deleted_count} notifications, {c.deleted_count} conversations, "
          f"{m.deleted_count} messages, {p.deleted_count} participants")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--purge", action="store_true", help="delete previously seeded data and exit")
    parser.add_argument("--skip-mongo", action="store_true", help="Postgres only")
    args = parser.parse_args()

    auth_env = load_env(REPO_ROOT / "services" / "auth-service" / ".env")
    notif_env = load_env(REPO_ROOT / "services" / "notification-service" / ".env")
    msg_env = load_env(REPO_ROOT / "services" / "messaging-service" / ".env")

    conn_string = auth_env.get("ConnectionStrings__AuthDb") or auth_env.get("CONNECTIONSTRINGS__AUTHDB")
    if not conn_string:
        print("ERROR: no ConnectionStrings__AuthDb in services/auth-service/.env", file=sys.stderr)
        return 1
    conn_uri = dotnet_conn_to_uri(conn_string)

    notif_uri = notif_env.get("MONGODB_URI", "")
    notif_db_name = notif_env.get("MONGO_DB_NAME", "Notifications")
    msg_uri = msg_env.get("MONGODB_URI", "")
    msg_db_name = msg_env.get("MONGO_DB_NAME", "Messaging")

    if not args.skip_mongo and not (notif_uri and msg_uri):
        print("ERROR: MONGODB_URI missing from the notification-/messaging-service .env files",
              file=sys.stderr)
        return 1

    if args.purge:
        print("Purging seeded data…")
        purge(conn_uri, notif_uri, notif_db_name, msg_uri, msg_db_name)
        return 0

    vendors, corporates = build_accounts()

    print(f"Seeding {len(vendors)} vendors and {len(corporates)} businesses…")
    seed_postgres(conn_uri, vendors, corporates)
    if not args.skip_mongo:
        seed_mongo(notif_uri, notif_db_name, msg_uri, msg_db_name, vendors, corporates)

    print()
    print("Done. Sign in as any seeded account with:")
    print(f"  email:    {vendors[0]['email']}  (vendor)")
    print(f"            {corporates[0]['email']}  (business)")
    print(f"  password: {SEED_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

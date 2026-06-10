-- Collateral photos for offers.
--
-- Stores an ordered array of photo descriptors for the tokenized asset
-- (the collateral), uploaded by the company at offer creation/update and
-- displayed on the marketplace cards and offer detail pages.
--
-- Shape: [{ "hash": "<ipfs cid>", "url": "<gateway url>", "fileName": "...",
--           "caption": "..." | null, "order": 0, "uploadedAt": "<iso>" }]
--
-- JSONB array (not a relation) to match the existing convention for
-- offer file metadata (`legal_documents`) and offer metadata (`asset_metadata`).

ALTER TABLE "offers" ADD COLUMN "collateral_photos" JSONB NOT NULL DEFAULT '[]';

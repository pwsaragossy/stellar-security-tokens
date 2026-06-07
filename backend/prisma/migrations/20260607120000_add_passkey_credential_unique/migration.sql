-- Enforce one passkey credential id per account.
--
-- Login resolves a user by `passkey_credential_id` (a PUBLIC WebAuthn identifier).
-- Without uniqueness, an attacker can register a colliding-credential row whose
-- public key they control, which can shadow a victim's row at login resolution
-- and break the victim's login (targeted denial). The signature check still
-- prevents takeover, but the credential id must be a 1:1 identity anchor.
--
-- Nullable columns (companies, company_users) allow multiple NULLs in Postgres,
-- so accounts without a passkey are unaffected.
--
-- PRECONDITION: remove any pre-existing duplicate `passkey_credential_id` values
-- first (e.g. wipe disposable testnet accounts) or this migration will fail.

CREATE UNIQUE INDEX "investors_passkey_credential_id_key" ON "investors"("passkey_credential_id");
CREATE UNIQUE INDEX "companies_passkey_credential_id_key" ON "companies"("passkey_credential_id");
CREATE UNIQUE INDEX "company_users_passkey_credential_id_key" ON "company_users"("passkey_credential_id");

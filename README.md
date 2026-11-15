# EATRY HUB

EATRY HUB is a modern, responsive food marketplace landing page and storefront built with Next.js, TypeScript, and Tailwind CSS. It showcases a multi-vendor ordering experience for Ghanaian restaurants and food businesses.

## Included experience

- Searchable marketplace homepage
- Database-backed discovery of approved vendors and published meals
- Persistent browser cart with server-validated account or guest checkout
- Homepage order tracking by order number and checkout phone
- Customer wallet with manually verified mobile-money top-ups
- Wallet, manual mobile-money, and cash-on-delivery payment options
- Admin-managed Ghanaian food categories and reusable menu templates
- Vendor dashboard for published menu management and subscription overview
- Responsive design for desktop, tablet, and mobile
- Search/filter controls, vendor menus, cart controls, and delivery/payment selection

## Payment and ordering behavior

Approved, active vendors and their published, available meals are loaded from PostgreSQL. Customers can choose account or guest checkout. The server rechecks meal availability and prices, then creates the order and vendor splits. Wallet payment requires an active customer account; guests can use manual mobile money or cash on delivery. Orders are stored in the database and can be tracked from the homepage with the order number and phone number used at checkout.

Wallet top-ups and food-order mobile-money transfers are manual submissions: customers provide transaction details, and an administrator must independently verify each transfer. Wallet deposits and food orders require the selected network, sender name, and sender number. The configured MTN and Telecel receiving details are shown at wallet top-up and food checkout. Pending top-ups do not increase the wallet balance. A wallet order debits the balance and writes its ledger entry in the same database transaction. Cash-on-delivery orders are recorded as unpaid. Card processing, automated mobile-money confirmation, and delivery dispatch are not implemented.

## Database foundation

The PostgreSQL schema and generated Prisma client support customer and vendor accounts, wallet balances and ledger entries, menu items, orders, and payment submissions. Admin actions are server-authorized. Payment provider credentials are not required for the manual verification flow.

### Use Supabase

1. Create a Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard). Supabase provisions the PostgreSQL database for the project; you do not need to create a separate database in pgAdmin.
2. In your Supabase project, open **Connect** and copy the **Session pooler** URL (port `5432`) for the running Next.js app. Use the database password you set when creating the project. If the password contains URL-reserved characters, percent-encode it.
3. Copy `.env.example` to `.env.local` if you have not already created it. Use the Session pooler for `DATABASE_URL` and the direct database URL for `DIRECT_URL` when your network supports it:

   ```env
   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[POOLER-HOST]:5432/postgres"
   DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
   ```

   Replace the example with the exact URI from Supabase; keep the password private and do not use a `NEXT_PUBLIC_` prefix.
4. Generate the Prisma client and apply the committed schema:

   ```powershell
   npm run db:generate
   npm run db:deploy
   ```

   `DATABASE_URL` is used by Prisma Client and `DIRECT_URL` by Prisma migrations. If the direct host is unavailable on your network (for example, IPv6 is unavailable), use Supabase's Session pooler URL for `DIRECT_URL`. For serverless deployments, use Supabase's Transaction pooler URL (port `6543`, with `?pgbouncer=true`) for `DATABASE_URL`; keep a direct or Session pooler URL on port `5432` for `DIRECT_URL`.

5. Add the same connection strings to your hosting provider's server-only environment settings before deploying. Never commit `.env.local`.

Run `node scripts/seed-menu-templates.mjs` after applying migrations to populate the shared catalog with the 15 requested categories and Ghanaian food entries. The templates do not set prices; vendors choose their own prices when adding foods to their menus. Admins can manage categories, descriptions, and catalog images in `/admin`.

The project includes a small set of locally bundled food photos in `public/images/food-catalog/`; their authors, source pages, and licenses are listed in `public/images/food-catalog/attribution.json`. Only a dish-specific match is shown as its default; other dishes remain without a photo until a suitable image is imported or supplied. Admins and vendors can still upload dish-specific images through Cloudinary; set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server environment before using those uploads. The catalog seed does not invent prices.

To automatically search for reusable, dish-specific images on Wikimedia Commons and upload matches into Supabase Storage, set `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Keep the service-role key out of browser code and version control. The importer creates the public `food-catalog` bucket if needed, records each source and license, avoids reusing a photo for a different dish, and leaves uncertain matches unverified. It needs no image-search API key. Run `node scripts/import-food-images.mjs` or start it from the admin food-catalog manager. Imported photos are held for a quick visual verification before vendors can use them. Failed and unmatched imports are logged to `var/food-image-import.jsonl`; use `node scripts/import-food-images.mjs --retry-unmatched` to retry dishes previously marked as awaiting an image.

## Customer and vendor accounts

Customer registration and vendor applications use PostgreSQL. Set `AUTH_SESSION_SECRET` in `.env.local` to a cryptographically random secret of at least 32 characters before enabling account registration or sign-in:

```powershell
node -p "require('node:crypto').randomBytes(48).toString('base64url')"
```

Passwords are stored as salted scrypt hashes. Account session cookies are HttpOnly, SameSite=Strict, and Secure in production. Customer registration creates a wallet and opens `/customer-dashboard`, which shows the current balance, pending top-ups, ledger activity, and recent orders. The customer dashboard accepts manual top-up submissions; only administrator verification credits those funds.

Vendor registration creates the account, business profile, application, and selected pending subscription. Vendors can submit the transaction ID and sender mobile-money number for a transfer they have already sent. An admin must independently verify that transaction and separately approve the vendor before its store becomes visible. Approved vendors can create and edit menu names, descriptions, prices, preparation times, and photos, as well as manage availability and publication.

The homepage lists only visible, unpaused restaurants belonging to active approved vendors and their published available meals. Customers can order as a guest or use an account to pay with wallet balance; both can submit a mobile-money payment for manual review or choose cash on delivery. Orders and payment state are persisted in PostgreSQL. Vendors can view their own incoming orders, approve eligible orders, and advance them through preparation, pickup, or delivery statuses. Unverified manual mobile-money orders cannot be approved until the admin verifies payment.

To configure customer wallet deposit instructions, enter the MTN and Telecel account names and numbers in the admin dashboard. These values are returned only to authenticated customer wallet sessions. Customers submit the amount, transaction ID, selected network, sender name, and sender number; an admin independently verifies the transfer before the wallet is credited. If destinations are not configured, customers are asked not to send money and cannot submit a top-up.

Account creation, checkout, and dashboards require a reachable database and valid `DATABASE_URL` and `DIRECT_URL` settings.

## Customer, vendor, and admin password recovery

Customer, vendor, and admin sign-in include one-time email code recovery. Configure `GMAIL_USER` with the Gmail address used to send recovery emails and `GMAIL_APP_PASSWORD` with an App Password from that Google account. Google requires 2-Step Verification before an App Password can be created. Keep the App Password in `.env.local`, never expose it through a `NEXT_PUBLIC_` variable, and restart the app after saving. Codes expire after 10 minutes, are single-use, and allow at most five attempts. The initial admin hash remains in `.env.local`; after admin recovery, a database-stored hash override becomes authoritative and old admin sessions are revoked.

## Food-photo imports

The admin catalog imports dish-specific photos from Wikimedia Commons only when the file has an accepted reuse license and author/license attribution. Imported photos remain hidden from vendor menus until an admin visually approves them. Set `IMAGE_IMPORT_USER_AGENT` to a descriptive importer name with a public project URL or public contact address; Wikimedia requires identifiable clients and asks clients to honor `Retry-After` rate limits. The importer gathers Ghana-food category metadata in a small number of sequential requests and can also run with `--local-only` to upload already-attributed project assets without internet searches.

## Set up admin access

The `/admin` route uses a server-verified administrator session and email/password sign-in. Configure one admin account with server-only environment variables; never use a `NEXT_PUBLIC_` prefix or commit `.env.local`.

1. Copy `.env.example` to `.env.local` if you have not already created the local file.
2. Set `ADMIN_EMAIL` to the email you want to use for admin sign-in.
3. Generate a password hash in PowerShell. This prompts for a secure-string password (minimum 8 characters) without putting the password in shell history:

   ```powershell
   $secure = Read-Host "Admin password" -AsSecureString
   $plain = [System.Net.NetworkCredential]::new("", $secure).Password
   $hash = $plain | node scripts/hash-admin-password.mjs
   Remove-Variable plain, secure
   $hash
   ```

4. Put the printed hash in `ADMIN_PASSWORD_HASH` (do not put the plain password there).
5. Generate a random session secret:

   ```powershell
   node -p "require('node:crypto').randomBytes(48).toString('base64url')"
   ```

   Put the output in `ADMIN_SESSION_SECRET`, save `.env.local`, restart the dev server, and visit [http://localhost:3000/admin/login](http://localhost:3000/admin/login).

Successful sign-in issues an eight-hour, HttpOnly, SameSite=Strict cookie; production cookies require HTTPS. The admin session is verified on the server before rendering `/admin`. Admin management lists registered vendors and customers, allows account edits and status changes, and displays pending vendor subscription, wallet top-up, and food-order mobile-money submissions. Verification credits wallet top-ups, confirms paid orders, or enables the separate vendor approval step, depending on payment type. Rejected food-order payments cancel the order. Monthly revenue includes successful GHS vendor subscription and food-order payments, but excludes wallet top-ups to avoid counting the same funds again when spent. The admin-only **Clear all application data** action requires typing `CLEAR ALL DATA`, re-entering the administrator password (step-up authentication), and a valid admin CSRF token; it is limited to three attempts per administrator per hour and writes an audit record after the reset. It permanently removes all application accounts, wallets, orders, payments, and related records, which also clears revenue history; it does not drop the schema, the security tables, or the environment-configured admin sign-in. Vendor accounts with order or payout history cannot be individually deleted, to protect financial records; suspend them instead. The setup supports one administrator. Its initial email, password hash, and session secret are configured through environment variables; email-code recovery stores the replacement password hash in Supabase. Before public deployment, also enable request rate-limiting at the hosting platform or trusted reverse proxy and use a managed identity provider for multiple admins, account recovery, and audit trails.

## P0 security controls

The following controls are active on top of the existing session, origin, and role checks.

- **Rate limiting** is stored in the additive `SecurityRateLimit` table so it survives restarts and works across instances. Limits: sign-in 5 failures per account/IP per 15 minutes, checkout 10 requests per customer per 10 minutes, wallet 5 per customer per 10 minutes, vendor payment and payout submissions 5 per vendor per 10 minutes, order tracking 30 per IP per minute, admin reset 3 per administrator per hour. When the security tables are missing the limiter fails open and logs a warning; set `RATE_LIMIT_STRICT=1` to fail closed instead.
- **Order tracking** uses signed, expiring capability tokens issued at checkout and stored by the tracking form. Order-number plus phone lookup is a transition path only: it is allowed for orders placed before `ORDER_TRACKING_LEGACY_UNTIL` (an ISO timestamp) or, when that variable is unset, for orders placed in the last 90 days. Set the variable to lock every order to token access. Tracking responses are uncached.
- **Idempotency** protects checkout, wallet top-ups, and vendor payment submissions. Send an `Idempotency-Key` header with a stable value per payload; replays return the stored response with `Idempotent-Replay: true`, and a reused key with a different payload is rejected. Records live in the additive `IdempotencyRecord` table and expire after 24 hours.
- **CSRF** uses a double-submit token in addition to same-origin checks. `GET /api/admin/session` and `GET /api/admin/management` issue the `eatry_csrf` cookie; admin mutations must echo it in the `x-csrf-token` header. `isSameOrigin` also rejects requests marked `Sec-Fetch-Site: cross-site`.

`ORDER_TRACKING_LEGACY_UNTIL` and `RATE_LIMIT_STRICT` are optional; both are documented in `.env.example`.

## Run locally

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open http://localhost:3000 to view the app.

## Production check

```bash
npm run build
npm run lint
npm test
```

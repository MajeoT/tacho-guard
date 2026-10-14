# TachoGuard

Tachograph hours, break and rest tracker with walkaround checks, built for HGV drivers. It installs on a phone like an app, works with no signal, and saves to a Supabase database when you are signed in.

## What is in this repo

| Path | What it is |
| --- | --- |
| `public/` | The whole app. This is the folder Cloudflare Pages publishes. No build step. |
| `public/index.html` | The app (hours, checks, tacho, road signs, log, settings). |
| `public/signs.js` | Road signs data for the Signs tab. |
| `public/config.js` | Your Supabase URL and publishable key. Safe to be public. |
| `public/sw.js` | Service worker that makes the app work offline. |
| `public/manifest.webmanifest`, `public/icons/` | What makes it installable. |
| `supabase/schema.sql` | The database tables and security rules. Run once. |

## Set up

### 1. Supabase (database and sign in)

1. Open your **Tacho Guard** project in the Supabase dashboard.
2. Go to **SQL Editor > New query**, paste the whole of `supabase/schema.sql` and press **Run**. It should say success. Check **Table Editor** shows `tg_state` and `tg_walks`.
3. Go to **Authentication > Sign In / Providers**, make sure **Email** is on. While you test, you can turn **Confirm email** off so new accounts work straight away. Leave it on if you want email confirmation.
4. After step 2 of Cloudflare below, come back to **Authentication > URL Configuration** and set **Site URL** to your Cloudflare address (for example `https://tachoguard.pages.dev`). Also add it under **Redirect URLs**. This makes confirmation and password reset emails open the app.

### 2. Cloudflare Pages (hosting)

1. In Cloudflare go to **Workers & Pages > Create > Pages > Connect to Git** and pick `MajeoT/tacho-guard`.
2. Project name `tachoguard`. Production branch `main`.
3. Framework preset **None**. Build command: leave empty. **Build output directory: `public`**.
4. Save and Deploy. Your app is at `https://tachoguard.pages.dev` (or the name you chose). Every push to `main` redeploys.

### 3. Install on the phone

Open the address in Chrome on Android, create an account, then tap the Chrome menu and **Install app** (or **Add to Home screen**). There is also an Install button in the app under Settings.

### Updating the app

Edit the files in `public/`, change `VERSION` in `public/sw.js` (for example `tg-2026-10-11-1`) so phones pick up the new files, set `APPV` near the top of the script in `public/index.html` to the same value (it is the version shown at the bottom of every page), and push to `main`.

### Updating the database

`supabase/schema.sql` is safe to run again at any time. It adds anything missing (size limits, the `updated_at` trigger) and resets the security rules and permissions to what the app needs.

## How the data is stored

* The phone always keeps a full copy, so the app works with no signal.
* When signed in, changes are saved to Supabase within about 15 seconds, and straight away when you leave the app or come back online.
* `tg_state` holds one row per driver with their hours, breaks, rest and settings. `tg_walks` has one row per walkaround check, with the registration, vehicle type, defect count and a dangerous flag in real columns.
* Row level security means a signed in driver can only read and change their own rows.
* Defect photos stay on the phone that took them.

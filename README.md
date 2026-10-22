# Sira Stay

Rental booking app for Tamil Nadu: homes, apartments, villas, PGs and room sharing, listed directly by KYC-verified owners. Tenants unlock an owner's phone and WhatsApp for ₹29, or get 40 unlocks in one district with a ₹99 District Pass. They can also book a stay in the app.

| Folder | What it is |
| --- | --- |
| [`sira-stay/`](sira-stay) | Mobile app — Expo SDK 57, Expo Router, TypeScript. Runs in **Expo Go**, except *Continue with Google*, which needs a development build (see [Continue with Google](#continue-with-google)). |
| [`server/`](server) | API — Node.js 22.13+ (tested on 24), Express 5, built-in SQLite. No database to install. |

## Run it on your phone

You need: Node.js 22.13 or newer on the laptop, the **Expo Go** app on your Android phone (from the Play Store), and **the phone and laptop on the same Wi-Fi**.

**1. Start the API** (terminal 1)

```bash
cd server
npm install
npm start
```

The first time, Windows asks whether Node.js may accept connections. Choose **Allow** for *Private networks*. On first start, the server adds 12 demo listings.

**2. Start the app** (terminal 2)

```bash
cd sira-stay
npm install
npm start
```

**3.** Open Expo Go on your phone and scan the QR code shown in terminal 2.

The app finds the API on its own: it uses the same laptop IP that Expo Go connected to, on port `4000`.

### If the app says "Can't reach the Sira Stay server"

- Make sure `npm start` is still running in `server/`.
- Make sure your Wi-Fi network is set to **Private** in Windows settings. If it still fails, add a firewall rule (run PowerShell as Administrator):
  `netsh advfirewall firewall add rule name="Sira Stay API" dir=in action=allow protocol=TCP localport=4000`
- **USB instead of Wi-Fi:** turn on USB debugging, then run
  `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:4000 tcp:4000`,
  then start the app with `npx expo start --localhost --max-workers 2`.
- **Expo tunnel mode** (`--tunnel`) cannot reach the local API. To use it, set `EXPO_PUBLIC_API_URL=https://your-api-url` before starting.
- The start script limits Metro to 2 workers because this laptop is low on memory. Bundling with all CPU cores crashed with an out-of-memory error.

## Test mode (no keys needed)

Until you add provider keys to `server/.env` (copy `server/.env.example`):

- **OTP codes** for email and phone appear in a yellow banner in the app (tap it to fill the code) and in the server console.
- **Payments** use a built-in test checkout. No real money moves. It has buttons for both success and failure.
- **Owner KYC** is approved automatically.
- **Continue with Google** says it isn't set up yet. Sign in with email instead, or set it up as described in [Continue with Google](#continue-with-google).

The app opens in English with no language step. Tamil is in Profile → Language.

Demo owner accounts (sign in with the email; the code shows in the app):

- `owner1@demo.sirastay.in` is available for calls.
- `owner2@demo.sirastay.in` is marked **unavailable**. Use their listings to see "Owner not available, try again later".

**Suggested walkthrough:** register as a tenant, then:
1. Pick a category in the top menu.
2. Tap **Unlock owner contact ₹29** on a listing card (or on the listing page), or buy a ₹99 District Pass for that district and unlock with a credit. Before paying, the app asks how: **Google Pay**, **PhonePe**, another UPI app, or a **debit/credit card**.
3. Tap **Call**. When you come back to the app, answer **No** to see "Owner not available" and use **Message later**.
4. On the listing page, check the **Verified** section and write a **review** (only possible after unlocking).
5. **Book now** and pay the booking amount.
6. Open **My Bookings** and tap **View on Map** → **Open Map**.

Then register a second account as a house owner and complete KYC, including the **mobile and WhatsApp numbers** tenants will see after unlocking. Add a property with 3 or more photos. If your email is in `ADMIN_EMAILS`, open Profile → *Admin: reports & refunds* and verify the new listing.

## Unlocking owner contacts

| | Single Unlock | District Pass |
| --- | --- | --- |
| Price | ₹29 per property | ₹99, for one district you choose before buying |
| Covers | That one property | Up to **40 unique** properties in that district |
| Validity | — | 30 days from activation; then **Expired** |
| Each unlock lasts | 6 months ("Unlocked till 21 April 2027"), then locks again | 6 months, even after the pass expires |
| Wrong details | Report within 48 h: **free unlock credit** (instant) or a **money refund** (reviewed by the admin) | Report within 48 h: the **credit goes back** on the pass |

- If you have an Active pass for a property's district, the app uses a pass credit instead of charging ₹29.
- A credit is used only when an unlock succeeds. Unlocking the same property twice never uses a second credit.
- **Duplicate payments** (e.g. paying twice) are detected and refunded automatically; you never get two unlock records.
- The **District Pass dashboard** (Profile → District Pass) shows the district, 40 total credits, used and remaining credits, activation and expiry dates, and the status (Active, Expired or Fully Used).

### "Report wrong details" — abuse protection and admin review

- **Limit:** each tenant can report at most **2 times in any 30 days**.
- **Free unlock credit** → given immediately. **Money refund** → marked pending for the admin to **approve** (refunded through Razorpay) or **reject** (no money; the tenant gets the contact back).
- **Not reviewed within 3 days** → the tenant automatically gets a free unlock credit instead of money.
- **3 different tenants** reporting the same listing → it is **hidden automatically** until the admin shows it again.
- **Admin screen:** Profile → *Admin: reports & refunds*, visible only to accounts listed in `ADMIN_EMAILS` in `server/.env` (the server checks this on every admin request too). A red badge counts pending refunds, unread notifications and listings waiting for verification.
- **Notifications:** every new report (and every auto-hidden listing) appears on the admin screen. It is also **emailed** to `ADMIN_EMAILS` once SMTP is set in `server/.env` (e.g. Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, your address and an [App Password](https://myaccount.google.com/apppasswords)). Until then it's printed in the server console.

### Testing payments in Razorpay Test Mode

The server never trusts the app's "payment successful" message. Nothing is unlocked until the server has verified Razorpay's HMAC signature (or a signed webhook), using the secret that lives only in `server/.env`.

1. Razorpay Dashboard → switch to **Test Mode** → *Account & Settings → API Keys* → generate a key pair.
2. Create `server/.env` (git ignores it) with:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
3. Restart the API. `GET /health` should show `"paymentProvider":"razorpay"`.
4. In the app, pay ₹29 or ₹99. Choose **Other UPI app** and use UPI ID `success@razorpay` (or `failure@razorpay` to test a failure), or choose **Debit / Credit card** and use a [test card](https://razorpay.com/docs/payments/payments/test-card-details/). Google Pay and PhonePe open those apps, so test them on an Android phone that has the app installed.
5. Optional webhook: add `https://<your-api>/webhooks/razorpay` (events `payment.captured`, `payment.failed`) and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
6. Keep **automatic capture** on (Razorpay's default: *Account & Settings → Capture settings*). Payments interrupted by the network are recovered by looking for a *captured* payment on the order.

Without keys, the app uses the built-in test checkout instead of Razorpay.

### Choosing how to pay

Tapping **Unlock owner contact ₹29** (card or listing page) or the **₹99 District Pass** opens a sheet with the amount in rupees and these choices:

| Choice | What Razorpay Checkout shows |
| --- | --- |
| Google Pay | UPI intent to Google Pay only |
| PhonePe | UPI intent to PhonePe only |
| Other UPI app | Every UPI option (other apps, QR) |
| Debit / Credit card | Card form only (debit and credit) |

The app passes the choice to Razorpay Standard Checkout as a `config.display` block (`sira-stay/src/app/checkout/[paymentId].tsx`), so checkout opens straight on that method. In test mode the built-in checkout shows the chosen method. Booking payments still show every method.

## Continue with Google

The first screen offers **Continue with Google** and **Continue with email**. A Google sign-in creates the account, or signs in the existing account with the same email. The rest of registration (Tenant/Owner, phone OTP, owner KYC) stays the same.

The server checks Google's ID token itself: the signature against Google's keys, the issuer, the audience (your client ID), the expiry, and that the email is verified (`server/src/google.js`).

Google sign-in uses native code (`@react-native-google-signin/google-signin`), so it doesn't run in Expo Go. In Expo Go the button explains this and points to email sign-in. To set it up:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create OAuth client IDs:
   - **Web application**. The app requests ID tokens for this client, and the server accepts it.
   - **Android**: package `in.sirastay.app` plus the SHA-1 of your signing key. For local builds, run `.\gradlew signingReport` in `sira-stay\android`. For Play Store builds, use the app signing key from Play Console.
   - **iOS** (only if you build for iOS): bundle ID `in.sirastay.app`.
2. `server/.env`: `GOOGLE_CLIENT_IDS=<web client ID>`. Restart the server; `GET /health` shows `"googleSignIn":true`.
3. `sira-stay/.env.local` (git ignores it):
   ```
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client ID>
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS client ID>   # iOS only
   ```
4. Build a development build: `npx expo run:android`, or `npx eas-cli build --profile development`. On iOS, `app.config.js` adds the URL scheme from the iOS client ID.

## Maps in an installed build (Google Maps key)

Expo Go has its own Google Maps key, so maps work there with no setup. A development or store build needs your own key; without it, every map (listing page, Explore, booking map, new-listing pin) is **blank**.

1. In [Google Cloud Console](https://console.cloud.google.com/google/maps-apis), enable **Maps SDK for Android** and create an API key. Restrict it to *Android apps* with package `in.sirastay.app` and the SHA-1 of your signing key (`.\gradlew signingReport` in `sira-stay\android`).
2. Add it to `sira-stay/.env.local` (git ignores it):
   ```
   GOOGLE_MAPS_API_KEY=<your key>
   ```
   `app.config.js` passes it to the `react-native-maps` config plugin, which writes it into the Android manifest. For EAS builds, set `GOOGLE_MAPS_API_KEY` as an EAS environment variable instead.
3. Regenerate the Android project so the manifest picks up the key, then rebuild:
   ```bash
   npx expo prebuild --platform android --clean
   npx expo run:android
   ```

All maps use a dark style in the app's colours (`src/constants/map-style.ts`): a custom Google Maps style on Android, and Apple Maps' dark mode on iOS.

## Reviews and the Verified section

- **Listing cards** show the rating under the photo as "★ 4.5 (12)", or **New** if nobody has reviewed the listing yet.
- **Who can review:** only tenants who unlocked the owner's contact (and didn't report it as wrong details), or who had a confirmed booking. Each tenant has one review per listing. Writing again updates it. The booking screen's "Rate this property" edits the same review. The server enforces this (`server/src/reviews.js`, `POST /properties/:id/reviews`).
- **Listing page** shows reviews from previous tenants: first name and initial only, the stars, the date, and whether they contacted the owner or booked.
- **Verified section** on the listing page:
  - **Owner KYC verified:** the owner's KYC status is *verified*.
  - **Admin verified:** an admin tapped **Verify listing**.
  - **Property document checked:** an admin opened the ownership document and tapped **Document checked**.
- **Admin screen → Listings to verify:** every active listing still missing a check. The private document opens through a signed link that works for 15 minutes; documents are never public. The demo listings count as already checked.

## How the requirements are implemented

| Requirement | Where |
| --- | --- |
| Tenant sign-up: email → "Are you a Tenant?" → phone OTP. Done. | `sira-stay/src/app/onboarding/` |
| Sign in with Google or email; English by default, no language step | `onboarding/index.tsx`, `lib/google-auth.ts`, `POST /auth/google` |
| Owner sign-up: email → role → phone OTP → registration + KYC (name, mobile + WhatsApp numbers shown to tenants after unlock, ID type, number, photo) | `components/kyc-form.tsx`, `POST /auth/kyc` |
| Property documents requested only when listing | Step 4 of `property/new.tsx` |
| Categories: Homes · Apartments · Villas · PG · Room Sharing. Shows only the selected category. | `components/category-tabs.tsx`, `GET /properties?category=` |
| Card shows rating ("★ 4.5 (12)" / New), rent, address (area, city), location, and a full-width gold **Unlock owner contact ₹29** button | `components/property-card.tsx` |
| ₹29 single unlock / ₹99 District Pass → owner name, phone, WhatsApp for 6 months | `property/[id].tsx`, `district-pass.tsx`, `server/src/unlocks.js`, `POST /payments`, `POST /unlocks` |
| Pay in INR with Google Pay, PhonePe, another UPI app, or a debit/credit card (Razorpay) | `components/payment-method-sheet.tsx`, `checkout/[paymentId].tsx` |
| Reviews from tenants who unlocked the contact; Verified section (owner KYC, admin, document) | `property/[id].tsx`, `server/src/reviews.js`, `server/src/verification.js`, `admin/reports.tsx` |
| Luxury dark theme (black, gold `#D4AF37`, white text), new logo, app icon and splash | `constants/theme.ts`, `assets/images/`, `app.json` |
| Compact Profile: one small card, Tenant/Owner buttons, plain settings rows; admin row only for admins | `(tabs)/profile.tsx` |
| Report wrong details within 48 h (max 2 a month) → instant free credit, or admin-reviewed refund (auto credit after 3 days); 3 reporters hide a listing | `unlock/[id]/report.tsx`, `admin/reports.tsx`, `server/src/unlocks.js`, `POST /unlocks/:id/report`, `/admin/*` |
| Other refunds: duplicate payment, technical failure, owner withdrawing the listing | `app/payments.tsx`, `POST /payments/:id/refund-request` |
| "Owner not available, try again later" + Message later (in-app chat) | `property/[id].tsx`, `chat/…`, owner toggle in Profile |
| Photos: minimum 3, maximum 20, clear, no duplicates, interior + exterior | Step 3 of `property/new.tsx`. The server also checks file content hashes, sizes and count. |
| English ⇄ Tamil in Profile → Language | `(tabs)/profile.tsx`, `lib/strings.ts` |
| Required address, district/city, area/locality, landmark + map pin | Step 2 of `property/new.tsx` |
| Exact location never public. Only the general area until unlock. | See *Privacy* below |
| Booking amount shown before payment → BOOKED → My Bookings (CONFIRMED) | `book/[id].tsx`, `(tabs)/bookings.tsx` |
| Other users can't book the same dates | Server-side overlap check + 10-minute payment hold |
| View Booking Details / View on Map / Open Map | `booking/[id]/index.tsx`, `booking/[id]/map.tsx` |
| Booking and payment status kept in sync | The server decides every status. The app refetches whenever a screen comes into focus. A Razorpay webhook covers payments completed after the app closes. |
| Works on slow and offline networks | See *Slow and offline networks* below |

## Slow and offline networks

Built for patchy rural connections. All new messages are in English and Tamil and follow the selected language.

- **Skeleton screens:** while data loads, screens show grey shimmer placeholders shaped like property cards, the property page or a list, instead of a blank screen (`components/skeleton.tsx`).
- **Photos load progressively:**
  - The server makes smaller copies of every uploaded photo with `sharp`: a card size (720 px, about 25 KB instead of 2–3 MB) and a gallery size (1440 px), plus a tiny blurred preview (thumbhash). Older photos are converted once in the background when the server starts.
  - Cards show the blurred preview at once, then fade in the card-size photo.
  - In the gallery, the first 2 photos load first. The rest load only as you swipe, and the next photo is fetched just ahead of you.
  - Photos are kept on the phone (`expo-image`, memory + disk cache) and served with long-lived cache headers.
- **Saved for offline:** the last property lists, viewed properties (including an unlocked contact), Favorites, My Bookings and booking details are saved on the phone (`lib/offline-cache.ts`). They show immediately, with a small "Saved {time}" note when they couldn't be refreshed. Each account's saved data is kept separate and deleted on sign-out. The app also opens offline for an already signed-in user.
- **"No internet connection" banner** at the top, with a **Retry** button. It also shows "Can't reach Sira Stay right now" when the phone is online but the server doesn't answer. Screens reload by themselves when the connection returns.
- **Timeouts and automatic retry:** requests stop after 15 s (reads), 30 s (actions) or 120 s (photo uploads). Reads are retried automatically twice (after 1 s and 3 s). JSON responses are gzip-compressed.
- **Payments interrupted by the network:**
  - The checkout screen switches to *"Connection lost — don't pay again"*. It re-checks the payment when the connection returns, every 15 s, or when you tap *Check now*.
  - If you leave the screen or close the app, the payment is remembered on the phone and re-checked on the next launch, when the app comes back to the foreground, or on reconnect. You get a *"Payment confirmed"* message once it's done.
  - On the server, a status check for an unconfirmed Razorpay payment asks Razorpay directly (`GET /orders/:id/payments`, using the secret key), so a payment whose confirmation never reached the server is still confirmed exactly once.

**Try it over USB:** run `adb reverse --remove tcp:4000` to cut the phone off from the API. The banner and the saved screens appear. Run `adb reverse tcp:4000 tcp:4000` again and the screens refresh by themselves.

## Privacy and security

- **Exact location:** the street address and map pin are encrypted (AES-256-GCM) in the database. They are decrypted only on the server, to compute distances, and are returned only to a tenant who has unlocked the contact or holds a confirmed booking.
- **Public location:** the public map shows an 800 m circle around a point offset 250–600 m from the house, using a fixed offset per property so it can't be averaged out. Distances are rounded to 0.5 km.
- **Booking map:** shows only the approximate area in the app. **Open Map** gives the tenant who booked the exact pin.
- **Private files:** KYC ID photos and property documents are stored in `server/data/private/`, which is never served over HTTP. ID numbers are encrypted.
- **Payments:**
  - Razorpay payments are verified on the server with an HMAC signature before anything is unlocked.
  - Fulfilment is idempotent.
  - Duplicate payments, and bookings that lose a race for the same dates, are refunded automatically.
- **Uploads:** checked by their actual file bytes, not by the file name or type the phone sends.

## Going live checklist

1. In `server/.env`, set `APP_SECRET` (64 hex characters). It encrypts locations, so keep it safe and never change it once you have data.
2. Test everything in Razorpay Test Mode first (see above), then swap in **live** keys (`rzp_live_…`) in `server/.env`. Add a webhook pointing to `https://<api>/webhooks/razorpay`, with secret `RAZORPAY_WEBHOOK_SECRET`.
3. Add SMTP details for email OTP and Twilio for SMS OTP. For Indian SMS, a DLT-registered provider such as MSG91 may be required. Swap it in `server/src/otp.js`.
4. Set `ADMIN_EMAILS` and SMTP so wrong-details reports reach you. Set `AUTO_APPROVE_KYC=false`. KYC has no admin review screen yet (wrong-details refunds and listing verification do), so review KYC records directly in the database or extend the admin screen.
5. For **Continue with Google**, add the Play Store app-signing SHA-1 to the Android OAuth client and set `GOOGLE_CLIENT_IDS` (see [Continue with Google](#continue-with-google)).
6. Host the API over HTTPS and back up `server/data/`. SQLite is fine for a pilot; move to Postgres for scale.
7. For Play Store builds, set `GOOGLE_MAPS_API_KEY` (see [Maps in an installed build](#maps-in-an-installed-build-google-maps-key)) and add the Play Store app-signing SHA-1 to the key's restrictions. Build with EAS (`npx eas-cli build`).

## Tamil quick start (தமிழ்)

1. `server` கோப்புறையில் `npm install` பின்னர் `npm start` இயக்கவும்.
2. `sira-stay` கோப்புறையில் `npm install` பின்னர் `npm start` இயக்கவும்.
3. உங்கள் போனில் Expo Go ஆப்பைத் திறந்து QR குறியீட்டை ஸ்கேன் செய்யவும். போனும் லேப்டாப்பும் ஒரே Wi-Fi-ல் இருக்க வேண்டும்.
4. சோதனை முறையில் OTP குறியீடுகள் ஆப்பில் மஞ்சள் பெட்டியில் காட்டப்படும்; கட்டணங்கள் உண்மையான பணம் இல்லாமல் சோதிக்கப்படும்.
5. இணையம் இல்லாதபோது மேலே "இணைய இணைப்பு இல்லை" பட்டியும் "மீண்டும் முயற்சி" பொத்தானும் தோன்றும். கடைசியாகப் பார்த்த வீடுகள், பிடித்தவை, முன்பதிவுகள் சேமிக்கப்பட்டு ஆஃப்லைனிலும் காட்டப்படும். கட்டணத்தின் நடுவில் இணைப்பு துண்டிக்கப்பட்டால், இணைப்பு திரும்பியவுடன் கட்டண நிலை தானாகச் சரிபார்க்கப்படும் — மீண்டும் பணம் செலுத்த வேண்டாம்.

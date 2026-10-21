# Sira Stay

Rental booking app for Tamil Nadu: homes, apartments, villas, PGs and room sharing, listed directly by KYC-verified owners. Tenants unlock an owner's phone and WhatsApp for ₹29, or get 40 unlocks in one district with a ₹99 District Pass. They can also book a stay in the app.

| Folder | What it is |
| --- | --- |
| [`sira-stay/`](sira-stay) | Mobile app — Expo SDK 57, Expo Router, TypeScript. Runs in **Expo Go**. |
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

Demo owner accounts (sign in with the email; the code shows in the app):

- `owner1@demo.sirastay.in` is available for calls.
- `owner2@demo.sirastay.in` is marked **unavailable**. Use their listings to see "Owner not available, try again later".

**Suggested walkthrough:** register as a tenant, then:
1. Pick a category in the top menu.
2. Open a listing and unlock the owner contact for ₹29, or buy a ₹99 District Pass for that district and unlock with a credit.
3. Tap **Call**. When you come back to the app, answer **No** to see "Owner not available" and use **Message later**.
4. **Book now** and pay the booking amount.
5. Open **My Bookings** and tap **View on Map** → **Open Map**.

Then register a second account as a house owner, complete KYC, and add a property with 3 or more photos.

## Unlocking owner contacts

| | Single Unlock | District Pass |
| --- | --- | --- |
| Price | ₹29 per property | ₹99, for one district you choose before buying |
| Covers | That one property | Up to **40 unique** properties in that district |
| Validity | — | 30 days from activation; then **Expired** |
| Each unlock lasts | 6 months ("Unlocked till 21 April 2027"), then locks again | 6 months, even after the pass expires |
| Wrong details | Report within 48 h: **full refund** or a **free unlock credit**, your choice | Report within 48 h: the **credit goes back** on the pass |

- If you have an Active pass for a property's district, the app uses a pass credit instead of charging ₹29.
- A credit is used only when an unlock succeeds. Unlocking the same property twice never uses a second credit.
- **Duplicate payments** (e.g. paying twice) are detected and refunded automatically; you never get two unlock records.
- The **District Pass dashboard** (Profile → District Pass) shows the district, 40 total credits, used and remaining credits, activation and expiry dates, and the status (Active, Expired or Fully Used).

### Testing payments in Razorpay Test Mode

The server never trusts the app's "payment successful" message. Nothing is unlocked until the server has verified Razorpay's HMAC signature (or a signed webhook), using the secret that lives only in `server/.env`.

1. Razorpay Dashboard → switch to **Test Mode** → *Account & Settings → API Keys* → generate a key pair.
2. Create `server/.env` (git ignores it) with:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
3. Restart the API. `GET /health` should show `"paymentProvider":"razorpay"`.
4. In the app, pay ₹29 or ₹99. In Razorpay's test checkout, use UPI ID `success@razorpay` (or `failure@razorpay` to test a failure), or a [test card](https://razorpay.com/docs/payments/payments/test-card-details/).
5. Optional webhook: add `https://<your-api>/webhooks/razorpay` (events `payment.captured`, `payment.failed`) and put its secret in `RAZORPAY_WEBHOOK_SECRET`.

Without keys, the app uses the built-in test checkout instead of Razorpay.

## How the requirements are implemented

| Requirement | Where |
| --- | --- |
| Tenant sign-up: email → "Are you a Tenant?" → phone OTP. Done. | `sira-stay/src/app/onboarding/` |
| Owner sign-up: email → role → phone OTP → registration + KYC (ID type, number, photo) | `onboarding/kyc.tsx`, `POST /auth/kyc` |
| Property documents requested only when listing | Step 4 of `property/new.tsx` |
| Categories: Homes · Apartments · Villas · PG · Room Sharing. Shows only the selected category. | `components/category-tabs.tsx`, `GET /properties?category=` |
| Card shows rent, address (area, city), location. Owner contact stays locked. | `components/property-card.tsx` |
| ₹29 single unlock / ₹99 District Pass → owner name, phone, WhatsApp for 6 months | `property/[id].tsx`, `district-pass.tsx`, `server/src/unlocks.js`, `POST /payments`, `POST /unlocks` |
| Report wrong details within 48 h → refund or free credit (pass: credit back) | `unlock/[id]/report.tsx`, `POST /unlocks/:id/report` |
| Other refunds: duplicate payment, technical failure, owner withdrawing the listing | `app/payments.tsx`, `POST /payments/:id/refund-request` |
| "Owner not available, try again later" + Message later (in-app chat) | `property/[id].tsx`, `chat/…`, owner toggle in Profile |
| Photos: minimum 3, maximum 20, clear, no duplicates, interior + exterior | Step 3 of `property/new.tsx`. The server also checks file content hashes, sizes and count. |
| English ⇄ Tamil in onboarding and in Profile settings | `components/language-switch.tsx`, `lib/strings.ts` |
| Required address, district/city, area/locality, landmark + map pin | Step 2 of `property/new.tsx` |
| Exact location never public. Only the general area until unlock. | See *Privacy* below |
| Booking amount shown before payment → BOOKED → My Bookings (CONFIRMED) | `book/[id].tsx`, `(tabs)/bookings.tsx` |
| Other users can't book the same dates | Server-side overlap check + 10-minute payment hold |
| View Booking Details / View on Map / Open Map | `booking/[id]/index.tsx`, `booking/[id]/map.tsx` |
| Booking and payment status kept in sync | The server decides every status. The app refetches whenever a screen comes into focus. A Razorpay webhook covers payments completed after the app closes. |

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
4. Set `AUTO_APPROVE_KYC=false`. There is no admin review screen yet, so build one or review records directly in the database.
5. Host the API over HTTPS and back up `server/data/`. SQLite is fine for a pilot; move to Postgres for scale.
6. For Play Store builds, add a Google Maps API key to `sira-stay/app.json` (`react-native-maps` plugin) and build with EAS (`npx eas-cli build`).

## Tamil quick start (தமிழ்)

1. `server` கோப்புறையில் `npm install` பின்னர் `npm start` இயக்கவும்.
2. `sira-stay` கோப்புறையில் `npm install` பின்னர் `npm start` இயக்கவும்.
3. உங்கள் போனில் Expo Go ஆப்பைத் திறந்து QR குறியீட்டை ஸ்கேன் செய்யவும். போனும் லேப்டாப்பும் ஒரே Wi-Fi-ல் இருக்க வேண்டும்.
4. சோதனை முறையில் OTP குறியீடுகள் ஆப்பில் மஞ்சள் பெட்டியில் காட்டப்படும்; கட்டணங்கள் உண்மையான பணம் இல்லாமல் சோதிக்கப்படும்.

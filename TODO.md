# TODO

- [ ] **App can't reach the server ("Can't reach Sira Stay").** The app calls the API on the Metro host at
      port 4000, which is `localhost` when Metro goes through `adb reverse`. Run the server (`npm start` in
      `server/`), then `adb reverse tcp:4000 tcp:4000`, or set `EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:4000`
      in `sira-stay/.env.local` (and allow port 4000 in Windows Firewall).
- [ ] **Map is black inside the app.** Tiles aren't loading. Check `adb logcat` for Google Maps
      authorization errors, that the Maps SDK for Android is enabled for the key, and that
      `GOOGLE_MAPS_API_KEY` was in `.env.local` when `npx expo prebuild --clean` ran. Then check the Explore map
      (circles, price tags, cluster bubbles), the area map on a listing and the booking map.
- [ ] **Rotate the Google Maps API key.** Create a new key restricted to the Maps SDK for Android and the app
      `in.sirastay.app` (package name + SHA-1: debug keystore for dev builds, Play app signing for release),
      put it in `sira-stay/.env.local` (and EAS, if used), rebuild, then delete the old key.
- [ ] **Android dev build stuck on the splash screen.** Metro on port 8081 isn't reachable through
      `adb reverse`, so the app never loads its JavaScript. Check `adb devices`, then
      `adb reverse tcp:8081 tcp:8081`.
- [ ] **Pincode next to an amount gets through.** A pincode up to two words after a money word is read as an
      amount: "Rent includes water, 600040" isn't blocked. Fix in both `text-leaks` files and add the case to
      `shared/location-leak-cases.json`.
- [ ] **iOS build.** Not built yet. Needs EAS (no Mac) and a paid Apple Developer account: install
      `expo-dev-client`, `npx eas-cli@latest build:configure`, `device:create`, then
      `build -p ios -e development`.

## Done in code, needs a check on a phone

- [x] **Android splash without the gold ring** (`b14757f`). Needs a new native build; uninstall the app first
      so Android doesn't show the cached splash.
- [x] **Keyboard fix on Chat, Add listing, Owner verification, sign-up and Report wrong details**
      (`9e00ffb`). Check that the focused box and its button stay above the keyboard, on Android and iOS.

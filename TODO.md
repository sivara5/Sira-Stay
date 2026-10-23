# TODO

- [ ] **Android dev build stuck on the splash screen.** Metro on port 8081 isn't reachable through
      `adb reverse`, so the app never loads its JavaScript. Check `adb devices`, then
      `adb reverse tcp:8081 tcp:8081`. When Metro is reached as `localhost`, the app also calls the API on
      `localhost:4000`, so that needs `adb reverse tcp:4000 tcp:4000` too.
- [ ] **Check the in-app maps after the Google Maps key fix:** Explore map (circles, price tags, cluster
      bubbles), the area map on a listing, and the booking map.
- [ ] **Remove the gold ring from the Android splash logo.**
- [ ] **Apply the keyboard fix** (`KeyboardAwareScrollView` + `useKeepAboveKeyboard`) to the other screens
      with text boxes: Chat, Add listing, Owner verification, sign-up (email, phone, verify email) and
      Report wrong details.
- [ ] **Restrict the Google Maps API key** to the Android app `in.sirastay.app` in Google Cloud Console
      (package name + SHA-1 of the signing certificate: debug keystore for dev builds, Play app signing for
      release).

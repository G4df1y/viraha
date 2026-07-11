# Mobile Test Matrix

Keep every item unchecked until the named environment has actually passed it. Record the app commit, OS version, and relevant observations with each test run.

## Internal Android APK Gate

- [ ] Run `pnpm --filter @viraha/mobile export:android` before producing the internal APK.
- [ ] Complete first-time setup and create the first conversation within 60 seconds.
- [ ] Confirm the API key is absent from SQLite files and application logs.
- [ ] Complete one full DeepSeek turn from prompt submission through persisted assistant response.
- [ ] Force-close and restart the app; confirm the conversation and messages are restored.
- [ ] Submit an invalid API key; confirm the draft is retained and an actionable error is shown.

## Physical Device: iQOO Neo (Snapdragon 845, 6 GB / 64 GB)

- [ ] Record the Android version and Funtouch OS version.
- [ ] Measure and record cold-start behavior.
- [ ] Verify the setup and chat flows with the stock keyboard, including keyboard avoidance and dismissal.
- [ ] Background and resume the app during setup and during a conversation; verify state recovery.
- [ ] Exercise low-memory process recreation and verify durable state recovery.
- [ ] Verify setup, chat, persistence, and error handling without Google Play services.

## Cloud Android Devices

- [ ] Android 9 (API 28): run setup, DeepSeek turn, restart recovery, and invalid-key retention checks.
- [ ] Current Android release: run setup, DeepSeek turn, restart recovery, and invalid-key retention checks.
- [ ] Xiaomi device profile: verify keyboard, background/resume, persistence, and network error behavior.
- [ ] OPPO/vivo device profile: verify keyboard, background/resume, persistence, and network error behavior.

## iOS (Deferred)

- [ ] Produce an EAS TestFlight build.
- [ ] Confirm the API key is stored in Keychain and absent from SQLite files and logs.
- [ ] Verify SQLite conversation persistence across force-close and restart.
- [ ] Verify keyboard avoidance, dismissal, draft retention, and submit behavior on iPhone.

# Mobile Test Matrix

Keep every item unchecked until the named environment has actually passed it. Record the app commit, OS version, and relevant observations with each test run.

## Internal Android APK Gate

- [ ] Android export succeeds on Node 22.
- [ ] Companion creation completes in under 60 seconds.
- [ ] API key is absent from SQLite and logs.
- [ ] DeepSeek BYOK sends and persists one complete turn.
- [ ] Relaunch restores Companion, connection metadata and messages.
- [ ] Invalid API key keeps the draft and shows an actionable error.

## Physical Device: iQOO Neo (Snapdragon 845, 6 GB / 64 GB)

- [ ] Record the Android version and Funtouch OS version.
- [ ] Measure and record cold-start behavior.
- [ ] Verify the setup and chat flows with the stock keyboard, including keyboard avoidance and dismissal.
- [ ] Background and resume the app during setup and during a conversation; verify state recovery.
- [ ] Exercise low-memory process recreation and verify durable state recovery.
- [ ] Verify setup, chat, persistence, and error handling without Google Play services.

## Cloud Android Devices

- [ ] Google reference device, Android 9: run setup, DeepSeek turn, restart recovery, and invalid-key retention checks.
- [ ] Google reference device, current Android: run setup, DeepSeek turn, restart recovery, and invalid-key retention checks.
- [ ] One Xiaomi/HyperOS device: verify keyboard, background/resume, persistence, and network error behavior.
- [ ] One OPPO or vivo device: verify keyboard, background/resume, persistence, and network error behavior.

## iOS (Deferred)

- [ ] EAS development build installs through TestFlight.
- [ ] On a physical iPhone, confirm the API key is stored in Keychain and absent from SQLite files and logs.
- [ ] On a physical iPhone, verify SQLite conversation persistence across force-close and restart.
- [ ] On a physical iPhone, verify keyboard avoidance, dismissal, draft retention, and submit behavior.

# Validation

Recorded on October 30, 2026.

## Completed

- Live display detection on an Apple M5 Mac: Studio Display XDR, 5120 × 2880, correctly identified.
- Eight Node.js tests covering display transitions, debounce, headless state, recovery, email request/results, lock triggers, lock-result verification, retries, and startup protection.
- Python unit test for both persistent service definitions, startup settings, and restart settings.
- Python installer syntax check and native Swift helper compilation.
- Real DirectMail test email and startup alert accepted by the provider. Recipient details, credentials, and receipts remain outside the repository.
- A second simultaneous email monitor correctly rejected to prevent duplicate sends.
- A temporary LaunchAgent ran the lock helper against the connected Studio Display. It locked the desktop and confirmed the system's locked state on the first attempt, without email configuration.
- After disabling further locking in the temporary test configuration, terminating the helper caused launchd to restart it with a new process ID and fresh scan data.
- Temporary test processes and the temporary LaunchAgent were removed; no permanent local monitoring service was installed during these checks.

## Still requires target-machine verification

- Actual inbox delivery, rather than provider acceptance alone.
- Physical display unplug/replug behavior; transition tests currently use synthetic samples.
- The target Mac mini's headless and remote-desktop configurations.
- A full machine reboot, boot-time monitoring, and behavior after FileVault startup unlock and desktop login.

Passing local tests or generating a launchd definition does not establish that these target-machine checks have passed.

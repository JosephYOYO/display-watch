# Validation

Recorded on October 30, 2026.

## Completed

- Live display detection on an Apple M5 Mac: Studio Display XDR, 5120 × 2880, correctly identified.
- Thirteen Node.js tests covering display transitions, debounce, headless state, recovery, email request/results, lock triggers, lock-result verification, retries, and startup protection.
- Python unit test for both persistent service definitions, startup settings, and restart settings.
- Python installer syntax check and native Swift helper compilation.
- Real DirectMail test email and startup alert accepted by the provider. Recipient details, credentials, and receipts remain outside the repository.
- A second simultaneous email monitor correctly rejected to prevent duplicate sends.
- A temporary LaunchAgent ran the lock helper against the connected Studio Display. It locked the desktop and confirmed the system's locked state on the first attempt, without email configuration.
- After disabling further locking in the temporary test configuration, terminating the helper caused launchd to restart it with a new process ID and fresh scan data.
- Temporary test processes and the temporary LaunchAgent were removed; no permanent local monitoring service was installed during these checks.

## Still requires target-machine verification

- Actual inbox delivery, rather than provider acceptance alone.
- The target Mac mini's headless and remote-desktop configurations.
- A full machine reboot, boot-time monitoring, and behavior after FileVault startup unlock and desktop login.

Passing local tests or generating a launchd definition does not establish that these target-machine checks have passed.

## Physical-only detector validation (version 0.3)

- Studio Display XDR was read from an external `IOMobileFramebuffer` hardware node with product attributes and DP transport. The software display list is not used as physical connection evidence.
- Created a real macOS CGVirtualDisplay test screen alongside the Studio Display. The virtual screen appeared in `system_profiler` but not in the hardware detector. Feeding the live snapshots through event handling produced zero new events, zero lock calls, and zero mail calls. This is a CGVirtualDisplay test, not a live RustDesk client test.
- The first physical unplug/replug attempt exposed a defect: optional profiler enrichment delayed background sampling, so reconnect did not trigger locking. The earlier lock was a startup baseline, not a reconnect success. Background scanning now never calls `system_profiler`; a regression test enforces this separation.
- After that fix, the user unplugged and reconnected the Studio Display again. The isolated monitor recorded `disconnected` followed by `connected`; DirectMail accepted both notifications. The lock helper recorded `connected` with `lockStatus: locked` on its first attempt. The user confirmed the screen locked after reconnection.
- To distinguish reconnect locking from startup locking, the isolated lock test was initialized with the already-observed physical baseline. Production behavior still protects already-connected displays at startup.
- Temporary email/lock services were unloaded after validation. Test credentials and device-specific snapshots are excluded from Git.
- Unsupported registry layouts and connected services with unreadable attributes produce explicit errors; prior state is preserved. Upgrade tests suppress unsent software-only events from previous versions.

Remaining hardware coverage: Intel, DisplayLink, HDMI adapters/dummy plugs, other Mac models, and the target mini's exact macOS/RustDesk combination have not been physically validated. The current backend intentionally supports only the tested Apple silicon registry layout and reports unsupported layouts.

## Configurable SMTP validation (version 0.4)

- Default configuration now uses user-supplied SMTP settings; sender, recipient, hostname, port, TLS mode, and optional login are configurable.
- Existing DirectMail configurations remain compatible; no cloud vendor is required for new installations.
- Fifteen top-level Node.js tests (18 including SMTP subtests) pass. The local TLS SMTP server test verifies authentication, MIME submission and acceptance, recipient rejection, and an interrupted connection after DATA. The last case remains unknown and is not replayed automatically.
- STARTTLS configuration requires an encrypted upgrade, and TLS certificate verification remains enabled. SMTP server replies and credentials are not copied into error logs.
- The installer copies the pinned SMTP dependency into the installed runtime, so it does not depend on the original checkout for module loading.
- No live third-party SMTP mailbox has been configured or externally tested in this session. Users should run the documented test-mail command with their own settings to verify delivery.

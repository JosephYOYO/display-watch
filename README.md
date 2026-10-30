# Display Watch

**Email alerts and automatic screen locking when a display is connected to your Mac.**

Display Watch is a lightweight macOS utility for a headless Mac mini, a remotely managed Mac, or a machine kept at another location. It watches physical external displays in the IOKit hardware registry, records connection changes, sends email alerts, and can lock the logged-in desktop when a physical display appears. Software-only displays are excluded from triggering actions.

It runs locally with no npm dependencies. Email is sent directly through **Alibaba Cloud DirectMail**; no separate application server or Quiet installation is required.

## Features

- **Hardware-backed detection:** the native helper reads external framebuffer product attributes and transport information through IOKit. Only manual `status` uses `system_profiler` for optional metadata; background monitoring never waits on it and uses the hardware-reported native resolution.
- **Connection and disconnection alerts** with the machine name, detection time, and display details.
- **Automatic screen locking** on a new display connection, or when the desktop helper starts with a display already attached.
- **Independent locking and email processes:** a slow email request does not block screen locking.
- **Persistent email history** and restart recovery, with duplicate suppression and bounded retries.
- **Automatic startup:** a system LaunchDaemon starts monitoring at boot; a per-user LaunchAgent starts the lock helper at desktop login. Both restart automatically if they exit.
- **Background operation:** no application window, menu bar icon, or monitoring notification. The normal macOS lock screen and system background-item notices may still appear.
- **Configurable email addresses, polling, locking, and ignored displays.** No recipient or credentials are embedded in the source.

> Detection is polling-based, not instantaneous. With the defaults, confirmation usually takes about 10–20 seconds, plus scan time; email delivery takes additional time. Very brief connections can be missed, and a display may show the desktop before locking occurs.

## Requirements

- macOS on **Apple silicon** with the supported external IOKit framebuffer layout. Local verification uses a Studio Display XDR over DisplayPort transport. Intel Macs and DisplayLink/other unsupported driver layouts are not currently supported; the detector reports an error instead of falling back to software-only detection. Validate your own Mac and remote-desktop setup.
- Node.js **22 or newer** and Python **3**.
- Xcode Command Line Tools to compile the small native lock helper: `xcode-select --install` if they are not already installed.
- Administrator access to install the startup services.
- An Alibaba Cloud DirectMail sender account and credentials with permission to send mail.

SMTP, Gmail app-password authentication, and other email providers are **not currently implemented**. Your receiving mailbox can be any normal email address; only the sending service needs to be DirectMail.

## Quick start

Run the following as the normal macOS user whose desktop you want to protect. Use `sudo` only for the service commands shown below.

### 1. Download and inspect your displays

```sh
git clone https://github.com/JosephYOYO/display-watch.git
cd display-watch
node --version
python3 --version
npm run build
node src/cli.mjs status
```

No `npm install` is needed. `npm run build` compiles the native helper without starting monitoring or locking. `status` reports physical `displays`, registry health, and `unverifiedSoftwareDisplays` that do not trigger actions.

### 2. Create your private configuration

The application reads `config.json` from your own Application Support folder, **outside the Git checkout**.

```sh
mkdir -p "$HOME/Library/Application Support/display-watch"
chmod 700 "$HOME/Library/Application Support/display-watch"
# Run this copy only for a new installation; do not overwrite an existing config.
cp config.example.json "$HOME/Library/Application Support/display-watch/config.json"
chmod 600 "$HOME/Library/Application Support/display-watch/config.json"
nano "$HOME/Library/Application Support/display-watch/config.json"
```

Fill in your own values. This example uses placeholder addresses and credentials:

```json
{
  "machine": "my-mac-mini",
  "intervalSeconds": 10,
  "confirmSamples": 2,
  "lockOnConnect": true,
  "ignoreIds": [],
  "mail": {
    "region": "ap-southeast-1",
    "from": "alerts@your-verified-domain.example",
    "to": "you@example.com",
    "accessKeyId": "YOUR_ACCESS_KEY_ID",
    "accessKeySecret": "YOUR_ACCESS_KEY_SECRET",
    "securityToken": ""
  }
}
```

#### Email setup

1. Set up and verify your sender domain/address in Alibaba Cloud DirectMail.
2. Set `mail.region` to the region containing that sender account. Supported values are `ap-southeast-1` (Singapore, default) and `cn-hangzhou` (Hangzhou).
3. Set `mail.from` to the verified DirectMail sender address.
4. Set `mail.to` to **your own receiving email address**. The current configuration accepts one recipient.
5. Fill in the access key ID and secret. Prefer a dedicated identity with only the permissions needed to send mail. For temporary credentials, also provide `securityToken`; update the configuration when credentials expire.
6. Keep this file private and out of version control. The program requires file permissions of `600`.

| Setting | Purpose |
| --- | --- |
| `machine` | Name included in email alerts. |
| `intervalSeconds` | Delay between scans; an integer of at least 5. |
| `confirmSamples` | Consecutive matching samples needed to accept a change; an integer of at least 1. |
| `lockOnConnect` | Enable automatic locking; defaults to enabled if omitted. |
| `ignoreIds` | Exact display IDs to exclude from both monitoring and locking. Obtain them with `status`. |
| `mail.*` | Your sender, recipient, region, and credentials. |

After editing configuration on an installed machine, rerun the installation command below to reload both services.

### 3. Test email

```sh
node src/cli.mjs test-mail
```

This sends a clearly labeled test email with the currently detected display. A response of `accepted` means DirectMail accepted the request; check your inbox and spam folder to confirm delivery. Test email does not lock the screen.

Optionally run the email monitor in the foreground:

```sh
node src/cli.mjs watch
```

Stop it with **Ctrl-C** before installing the services. Foreground `watch` runs email monitoring only; automatic locking requires the desktop helper installed in the next step.

### 4. Install automatic startup and locking

```sh
sudo python3 scripts/service.py install "$(id -un)" "$(command -v node)"
```

**If a display is already connected, the helper can lock your desktop shortly after installation.** Unlock normally to continue. Setting `lockOnConnect` to `false` disables locking while retaining email monitoring.

The installer compiles the native helper and checks both the lock API and physical detector before replacing services, copies runtime files into your Application Support folder, and writes:

| Service | Starts when | Installed definition |
| --- | --- | --- |
| Email monitor | macOS boots | `/Library/LaunchDaemons/com.display-watch.monitor.plist` |
| Lock helper | The selected user logs into the desktop | `~/Library/LaunchAgents/com.display-watch.lock.plist` |

Both use `RunAtLoad` and `KeepAlive`. If the desktop session is already available, the helper starts immediately; otherwise, it starts at the next desktop login. The monitor does not require automatic desktop login. Neither service can run before FileVault startup unlock.

The installer records the absolute path to Node. Keep that installation available; reinstall the services after changing or removing a Node version, especially when using nvm.

### 5. Verify on your Mac

```sh
sudo python3 scripts/service.py status "$(id -un)"
node src/cli.mjs history
cat "$HOME/Library/Application Support/display-watch/lock-state.json"
```

After desktop login, check that both launchd jobs report `running`. Connect a display and verify the email and `lockStatus: "locked"` in the lock state. Then restart the Mac, log in, and repeat the status check: `lastScan` in both state files should be newer than the restart.

A service definition on disk is not proof of a successful reboot test. Validate physical connections and your remote-desktop software on the target machine.

## Everyday use

```sh
# Current displays
node src/cli.mjs status

# Saved email events and delivery states
node src/cli.mjs history

# Monitor logs
tail -f "$HOME/Library/Application Support/display-watch/service.log"

# Lock helper errors
tail -f "$HOME/Library/Application Support/display-watch/lock-error.log"
```

Runtime data lives in `~/Library/Application Support/display-watch/`:

- `config.json`: private configuration, including email credentials.
- `state.json`: display baseline and email event history.
- `lock-state.json`: lock results, up to 100 recent events from the current helper lifetime.
- `service.log`, `service-error.log`, `lock.log`, `lock-error.log`: runtime logs.
- `runtime/`: installed source and compiled lock helper.

Email history and logs are not automatically rotated. Review disk usage periodically. `DISPLAY_WATCH_HOME` can select an isolated directory for manual CLI testing; the installer uses the standard per-user directory.

### Update

From your checkout:

```sh
git pull --ff-only
sudo python3 scripts/service.py install "$(id -un)" "$(command -v node)"
```

The installer preserves your configuration and history. Version 0.3 resets older software-only baselines and suppresses their unsent queued notifications, so old virtual-screen events are not delivered after upgrading. A connected physical display establishes a new startup baseline. Display IDs now include the hardware registry path; review any existing `ignoreIds` against the new `status` output. Do not recopy the example over your private configuration.

### Uninstall

```sh
sudo python3 scripts/service.py uninstall "$(id -un)"
```

This unloads and removes both service definitions. Configuration, history, logs, and installed runtime files are retained in Application Support for you to review or remove separately.

## Behavior and limitations

### Display detection

- The first monitoring run sends a startup alert for displays already attached. A headless startup establishes an empty baseline.
- Failed scans preserve the previous state instead of being treated as a disconnection.
- The email monitor compares with its saved baseline after restart. It cannot reconstruct connections that happened while the Mac was off, asleep, or the service was stopped.
- Vendor/product IDs in software display lists are not sufficient. Only external hardware framebuffer nodes with recognized product and DP/HDMI transport attributes generate actionable displays. Software-only RustDesk placeholders, CGVirtualDisplay screens, and similar virtual screens cannot create a physical event merely by advertising a vendor/product ID.
- HDMI dummy plugs count as physical connections when exposed through these hardware nodes. A display routed through unsupported hardware/driver layouts may not be detected. Turning off a monitor may not count as disconnecting it.
- If a physical external service exists but its display attributes cannot be parsed, or no supported registry layout exists, detection fails explicitly. Previous baselines are preserved, `scanError` is saved, and the service logs the error. `status` exits nonzero with a diagnostic. This does not produce a GUI popup or a separate health email.
- Software displays without matching hardware are listed as unverified, not asserted to be conclusively virtual. This is not a universal classification API for every adapter or future macOS release.
- Review `status` output during remote access before ignoring an ID. An ignored device will not trigger locking or email.

### Screen locking

- Background polling uses only the native IOKit helper, avoiding profiler hangs during headless operation. The helper locks on confirmed connections and when it starts with a display already present. It does not repeatedly lock merely because a display remains connected; you may unlock normally.
- Locking is scoped to the selected user's desktop session. Other accounts and fast user switching are outside the current protection scope.
- A failed lock is retried up to three times. The helper verifies the session's locked state rather than treating command execution as success.
- Locking uses the private macOS `SACLockScreenImmediate` API, also used by [Hammerspoon](https://github.com/Hammerspoon/hammerspoon/blob/master/extensions/caffeinate/libcaffeinate.m). Apple does not guarantee this API remains compatible. Reinstall and test after macOS upgrades.
- This is an awareness and response tool, not a guarantee that no desktop content will ever appear on a connected screen. It does not shut down the Mac or disable its display outputs.

### Email delivery

Events use `pending`, `accepted`, `failed`, or `unknown` delivery states. Explicit failures retry with exponential backoff, up to five attempts. Timeouts, interrupted responses, or a crash during sending can leave an unknown result; these are not automatically replayed because the original email may already have been sent. Extended offline periods can exhaust retries and require manual review.

Email templates and some installer messages are currently in Chinese; this English guide describes the available functionality, not a fully localized application.

The IOKit property selection was informed by [MonitorControl’s Apple silicon support](https://github.com/MonitorControl/MonitorControl/blob/main/MonitorControl/Support/Arm64DDC.swift) and verified against the local Studio Display registry.

## Development and validation

```sh
npm test
python3 -m unittest discover -s test -p '*_test.py'
```

Automated tests use synthetic display data and mock email responses; they do not access real credentials or send email. They cover connection transitions, debounce, state recovery, email outcomes, locking decisions, and startup service definitions.

See [VALIDATION.md](VALIDATION.md) for completed local checks and outstanding target-machine validation.

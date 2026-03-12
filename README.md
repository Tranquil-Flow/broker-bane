# BrokerBane

**Free tool that automatically asks 1,169+ data brokers to delete your personal information.**

Data brokers are companies like Spokeo, BeenVerified, Whitepages, Acxiom, and hundreds more — they collect and sell your name, address, phone number, relatives, income estimates, and more without your knowledge. BrokerBane sends opt-out and removal requests to all of them on your behalf.

**Your data never leaves your computer.** No accounts. No subscriptions. No cloud.

---

## Which option should I use?

| I want to... | Use this |
|---|---|
| Just click around in a browser app — no typing commands | **PWA** (Option A below) |
| Use a browser dashboard, and I'm OK opening a terminal once | **Dashboard** (Option B below) |
| Full control, scheduling, automation | **CLI** (Option B below) |

---

## Step 1: Install Node.js (required for all options)

Node.js is free software that lets your computer run BrokerBane. You only need to install it once.

**On Mac:**
1. Go to [nodejs.org/en/download](https://nodejs.org/en/download)
2. Click the macOS installer (the `.pkg` file)
3. Open the downloaded file and follow the prompts
4. When it finishes, you're done

**On Windows:**
1. Go to [nodejs.org/en/download](https://nodejs.org/en/download)
2. Click the Windows installer (the `.msi` file)
3. Open the downloaded file and follow the prompts
4. **Restart your computer** after the installer finishes

**On Linux:**
Open a terminal and run:
```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
```

---

## Step 2: Get BrokerBane

You'll need to download the BrokerBane files to your computer.

**If you have Git installed** (common on Mac/Linux):
Open a terminal and run:
```
git clone https://github.com/yourorg/broker-bane
```

**If you don't have Git:**
Download the ZIP from the GitHub page (green "Code" button → "Download ZIP"), then unzip it. You'll have a folder called `broker-bane`.

---

## Option A: PWA — Recommended for most people

The PWA is a browser app that runs entirely on your computer. After the one-time setup below, you can use it like any website — no terminal needed again.

### Setup (one time only)

**How to open your terminal:**
- Mac: Press `Command + Space`, type `Terminal`, press Enter
- Windows: Press the Start button, type `PowerShell`, press Enter

**Then follow these steps:**

1. Open your terminal
2. Type the following and press Enter to go into the PWA folder:
   ```
   cd broker-bane/pwa
   ```
3. Install the app's files (this takes a minute):
   ```
   npm install
   ```
4. Build the app:
   ```
   npm run build
   ```
5. Start it:
   ```
   npm run preview
   ```
6. Open your browser and go to: **http://localhost:4173**
7. The setup wizard will appear — enter your name, email address, and connect your Gmail or Outlook account
8. Click **Start Removals** — BrokerBane will begin sending removal requests automatically

[screenshot: the BrokerBane setup wizard showing name and email fields]

### Quick Check: Did it work?

After clicking Start Removals, you should see a progress screen showing requests being sent. Within a few minutes, the counter should start going up. If you see "0 sent" after 5 minutes, check the Troubleshooting section below.

### Installing to your desktop (optional)

Once the PWA is running in your browser, you can install it like a regular app:
- Chrome/Edge: look for an install icon in the address bar (looks like a small screen with a plus sign)
- After installing, it appears in your Applications folder (Mac) or Start Menu (Windows)
- The PWA works offline after installation

### Returning to the PWA later

You don't need to go through setup again. Just open your terminal and run:
```
cd broker-bane/pwa && npm run preview
```
Then visit http://localhost:4173 in your browser.

> **Already used the CLI?** You can import your removal history into the PWA. See the **Data Portability** section below.

---

## Option B: CLI + Dashboard (for people comfortable with a terminal)

### Setup (one time only)

1. Open your terminal
2. Go into the broker-bane folder:
   ```
   cd broker-bane
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Build:
   ```
   npm run build
   ```
5. Make the `brokerbane` command available system-wide:
   ```
   npm link
   ```

### First run

6. Run the setup wizard — it will ask for your name, email, and email password:
   ```
   brokerbane init
   ```
7. Check that everything is configured correctly:
   ```
   brokerbane test-config
   ```

### Using the Dashboard (browser UI)

8. Launch the dashboard:
   ```
   brokerbane dashboard
   ```
9. Open your browser and go to: **http://localhost:3847**

[screenshot: the BrokerBane dashboard showing removal progress bars and broker list]

The dashboard shows your removal progress, broker statuses, and any tasks that need your attention.

### Using the CLI directly

To send removal requests without the dashboard:
```
brokerbane remove --dry-run   # preview what will be sent (no emails sent)
brokerbane remove             # actually send the removal requests
```

### Quick Check: Did it work?

Run `brokerbane status` in your terminal. You should see a table showing how many requests were sent, how many are pending, and how many have been confirmed. If you see errors, check the Troubleshooting section below.

---

## Gmail App Password Setup

Gmail requires an "App Password" instead of your regular password when third-party apps send email on your behalf. This is a security feature — it means BrokerBane can send emails without ever knowing your real Gmail password.

**Why you need this:** Gmail blocks apps from using your regular password for security. An App Password is a special one-time code only for BrokerBane.

### How to create a Gmail App Password

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Make sure **2-Step Verification** is turned on (you'll see it in the list — if it's off, click it and follow the steps to turn it on first)
3. Once 2-Step Verification is on, go back to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Under "Select app", choose **Mail**
5. Under "Select device", choose **Other** and type `BrokerBane`
6. Click **Generate**
7. Google shows you a 16-character password like `abcd efgh ijkl mnop` — copy it
8. Paste it when BrokerBane asks for your email password during setup (or in the Settings screen)

[screenshot: Google's App Password screen showing the generated 16-character password]

> The App Password only works for BrokerBane. If you ever want to revoke it, go back to the App Passwords page and delete it.

---

## Outlook / Hotmail App Password Setup

1. Go to [account.microsoft.com/security](https://account.microsoft.com/security)
2. Click **Advanced security options**
3. Make sure **Two-step verification** is turned on
4. Scroll down to **App passwords** and click **Create a new app password**
5. Microsoft generates a password — copy it
6. Paste it when BrokerBane asks for your email password during setup

---

## All Commands

If you're using the CLI (Option B), here are all 18 commands:

### Starting out

**`brokerbane`** (no arguments)
Opens an interactive menu — the easiest way to explore all features.

**`brokerbane init`**
Runs the setup wizard. Sets up your name, email, and preferences. Run this first.

**`brokerbane test-config`**
Checks that your settings, email credentials, and records are all working correctly.

---

### Sending removal requests

**`brokerbane remove`**
Sends removal requests to all brokers. Options:

| Flag | What it does |
|------|-------------|
| `--dry-run` | Preview what would be sent — no emails actually go out |
| `--brokers spokeo,beenverified` | Only contact specific brokers (by their ID) |
| `--method email` | Only send email requests (skip web forms) |
| `--resume` | Skip brokers that are already done — pick up where you left off |

**`brokerbane resume`**
Shortcut for `brokerbane remove --resume` — continue an interrupted run.

---

### Checking progress

**`brokerbane status`**
Shows a summary of how many requests were sent, confirmed, pending, or failed.

```
brokerbane status              # show table
brokerbane status --format json  # output as JSON (for scripting)
```

**`brokerbane scan`**
Searches people-search brokers to check if your profile appears on them.

```
brokerbane scan --dry-run           # see which sites would be checked
brokerbane scan --category people-search
brokerbane scan --auto-remove       # scan and immediately queue removals
```

---

### Browsing the broker list

**`brokerbane list-brokers`**
Browse and filter the list of 1,169+ brokers.

```
brokerbane list-brokers                    # show all
brokerbane list-brokers --region us        # US brokers only
brokerbane list-brokers --tier 1           # major brokers only
brokerbane list-brokers --method email     # email-only brokers
brokerbane list-brokers --search "people"  # search by name
brokerbane list-brokers --format json      # output as JSON
```

---

### Manual tasks

**`brokerbane confirm`**
Some brokers have web forms that need a human to fill them out (BrokerBane queues these). This command lists them and lets you mark them as done.

```
brokerbane confirm          # list pending tasks
brokerbane confirm --all    # mark all pending tasks as completed
```

---

### Exporting your records

**`brokerbane export`**
Export your removal history to a file.

```
brokerbane export                        # export as JSON
brokerbane export --format csv > results.csv  # export as CSV
```

---

### Automation

**`brokerbane schedule`**
Set BrokerBane to automatically re-run removals on a schedule (because brokers sometimes re-add your data after 60–90 days).

```
brokerbane schedule install                  # run every 90 days (default)
brokerbane schedule install --interval 30    # run every 30 days
brokerbane schedule status                   # check if scheduling is active
brokerbane schedule uninstall                # turn off scheduling
```

---

### Browser UI

**`brokerbane dashboard`**
Opens the web dashboard at http://localhost:3847.

```
brokerbane dashboard               # default port
brokerbane dashboard --port 8080   # use a different port
```

---

### Settings

**`brokerbane settings show`**
Displays your current configuration — your name, email settings, and preferences.

**`brokerbane settings edit`**
Opens an interactive editor to update your configuration without editing files manually.

---

### Backups

**`brokerbane backup create`**
Creates an encrypted backup of all your removal records and settings. Useful before switching computers or reinstalling.

```
brokerbane backup create                       # save to default location
brokerbane backup create --output ~/my-backup.brokerbane  # custom location
```

**`brokerbane backup info <file>`**
Shows what's inside a backup file without restoring it.

```
brokerbane backup info ~/my-backup.brokerbane
```

**`brokerbane import-backup <file>`**
Restores from a backup file.

```
brokerbane import-backup ~/my-backup.brokerbane
brokerbane import-backup ~/my-backup.brokerbane --dry-run  # preview first
```

---

### Verification & Troubleshooting

**`brokerbane verify-evidence`**
Verifies the record of all removal requests — confirms they haven't been tampered with.

```
brokerbane verify-evidence                     # verify all records
brokerbane verify-evidence --broker spokeo     # check one broker
```

**`brokerbane generate-playbook`**
Generates automation instructions for brokers that use web forms. Only needed if you want automated web-form submissions.

```
brokerbane generate-playbook --broker spokeo
brokerbane generate-playbook --all-missing
brokerbane generate-playbook --all-missing --dry-run
```

**`brokerbane debug-report`**
Generates a redacted diagnostic report — useful for reporting a bug. Personal information is automatically removed from the output.

```
brokerbane debug-report
brokerbane debug-report --json
```

---

## Troubleshooting

**"command not found: brokerbane"**
You need to link the command. In your terminal, go to the broker-bane folder and run:
```
npm link
```
Then try your command again.

**"Authentication failed" when sending emails**
You're using your regular email password. BrokerBane needs an App Password — see the Gmail or Outlook setup sections above. Your regular password will not work.

**"I don't know how to open a terminal"**
- Mac: Press `Command + Space`, type `Terminal`, press Enter
- Windows: Click the Start button (Windows logo), type `PowerShell`, press Enter

**"The PWA isn't sending emails"**
You need to connect your email account. In the PWA, go to the Settings screen and log in with Gmail or Outlook. BrokerBane uses your email account to send the removal requests.

**"npm install failed"**
Make sure Node.js is installed. Open your terminal and run `node --version` — you should see a version number like `v20.x.x`. If you see an error, go back to Step 1 and install Node.js.

**"The page at localhost:4173 says 'site can't be reached'"**
The PWA server has stopped. Open a terminal, go to the `broker-bane/pwa` folder, and run `npm run preview` again.

**"I want to start over"**
Run `brokerbane init` again — it will walk you through setup from scratch.

---

## Data Portability

BrokerBane uses `.brokerbane` files to move your removal history between devices or between the CLI and PWA.

### Transfer to a new computer

1. On your old computer, run:
   ```
   brokerbane backup create --output ~/my-brokerbane-backup.brokerbane
   ```
2. Copy that file to your new computer (USB drive, email to yourself, etc.)
3. On your new computer, after installing BrokerBane, run:
   ```
   brokerbane import-backup ~/my-brokerbane-backup.brokerbane
   ```

### Move from CLI to PWA

The PWA has an **Import** option in its Settings screen. Use `brokerbane backup create` to generate a backup file, then use the PWA's import feature to load it.

### Move from PWA to CLI

The PWA has an **Export** option in its Settings screen. Export your data, then run:
```
brokerbane import-backup <the exported file>
```

---

## Features

- **Email removal** — sends GDPR/CCPA opt-out emails to 1,169+ brokers, with automatic retries if something fails
- **Web form removal** — can fill out web forms automatically using AI browser automation (optional, see below)
- **Inbox monitoring** — automatically clicks "confirm your opt-out" links that some brokers send back to you (optional)
- **Resumable** — if the process is interrupted, it picks up exactly where it left off
- **Circuit breaker** — stops retrying brokers that keep failing, so you don't waste time
- **Dry-run mode** — preview everything before a single email is sent
- **Scheduling** — re-run automatically every 30, 60, or 90 days, since brokers sometimes re-add your data
- **Dashboard** — visual browser interface showing your progress
- **PWA** — installable browser app, no terminal required after setup
- **Encrypted backups** — export and import your data securely

---

## Browser Automation (Optional — advanced users)

Some brokers only accept removals through a web form (not email). BrokerBane can fill out those forms automatically using AI-powered browser automation. This is optional — without it, those brokers are listed as manual tasks in `brokerbane confirm`.

To enable it, install the extra packages:
```
npm install @browserbasehq/stagehand playwright
npx playwright install chromium
```

Then run `brokerbane settings edit` and add your AI provider details (OpenAI, Anthropic, or a local Ollama model). Using a local model means no data leaves your computer.

---

## Inbox Monitoring (Optional — advanced users)

Some brokers send a "click here to confirm your opt-out" email after you submit a removal request. Without inbox monitoring, you'd need to click those links manually. With inbox monitoring enabled, BrokerBane watches your inbox and clicks them for you automatically.

Configure this during `brokerbane init`, or run `brokerbane settings edit` to add it later.

---

## Privacy & Security

- **Local only** — your personal information (name, address, email) never leaves your computer
- **No tracking** — BrokerBane does not collect any analytics or phone home
- **Secure settings storage** — your settings file is stored with restricted permissions so other users on your computer can't read it
- **Redacted logs** — names and email addresses are automatically removed from log output
- **Encrypted backups** — `.brokerbane` backup files are encrypted

---

## Broker Database

BrokerBane targets **1,169 brokers** across these categories:

- People-search sites (Spokeo, BeenVerified, Whitepages, Radaris, TruthFinder, and hundreds more)
- Marketing data companies (Acxiom, Epsilon, LiveRamp, Oracle/BlueKai, ...)
- Background check companies (Checkr, HireRight, Sterling, ...)
- Credit bureaus (Equifax, Experian, TransUnion)
- Business data brokers (ZoomInfo, Clearbit, FullContact)
- Data aggregators (LexisNexis, CoreLogic, Verisk)
- EU/GDPR targets (Acxiom UK, Experian UK, Equifax UK)

The broker list is community-maintained. To suggest adding a new broker, see Contributing below.

---

## Contributing

Bug reports, new broker definitions, and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[AGPL-3.0](LICENSE) — free to use, modify, and distribute under the same terms.

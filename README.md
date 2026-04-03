# TRMNL Agenda Plugin

A TRMNL plugin that displays today's and tomorrow's calendar events from an .ics file. Designed to run on a Raspberry Pi (or any machine) as a cron job — no inbound network access required.

## How It Works

```
.ics calendar URL
       ↓
  push.js (cron)     ← fetches .ics, parses events
       ↓
  TRMNL Webhook API  ← outbound HTTPS POST only
       ↓
  TRMNL e-ink display
```

The script makes two outbound requests:
1. Fetches your .ics calendar file
2. POSTs today's and tomorrow's events to TRMNL's webhook API

No server, no open ports, no WAN exposure.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A TRMNL device with [Developer Edition](https://help.trmnl.com/en/articles/9510536-private-plugins) enabled
- A calendar .ics URL (Google Calendar, iCloud, Outlook, etc.)

## Setup

### 1. Create the TRMNL Plugin

1. Go to your [TRMNL dashboard](https://usetrmnl.com)
2. Create a new **Private Plugin** with the **Webhook** data strategy
3. Paste the contents of each file in `templates/` into the corresponding layout field:
   - `templates/full.liquid` → Full layout
   - `templates/half_horizontal.liquid` → Half Horizontal layout
   - `templates/half_vertical.liquid` → Half Vertical layout
   - `templates/quadrant.liquid` → Quadrant layout
4. Save the plugin and copy the **Plugin UUID** from the plugin settings

### 2. Configure

```bash
git clone <this-repo>
cd trmnl-plugins
npm install
cp .env.example .env
```

Edit `.env` with your values:

```
TRMNL_PLUGIN_UUID=your-plugin-uuid-here
ICS_URL=https://example.com/calendar.ics
TIMEZONE_OFFSET=-5
```

| Variable | Description |
|---|---|
| `TRMNL_PLUGIN_UUID` | UUID from your TRMNL private plugin settings |
| `ICS_URL` | URL to your .ics calendar file |
| `TIMEZONE_OFFSET` | Your UTC offset in hours (e.g., `-5` for EST, `1` for CET) |

### 3. Test

Run the script once to verify everything works:

```bash
npm run push
```

You should see output like:

```
Fetching calendar from https://...
Found 3 today, 2 tomorrow.
Pushing to https://usetrmnl.com/api/custom_plugins/...
Done! Events pushed to TRMNL.
```

### 4. Schedule with Cron

Run the setup script to install a cron job (defaults to every 15 minutes):

```bash
chmod +x scripts/setup-cron.sh
./scripts/setup-cron.sh
```

Or specify a custom interval in minutes:

```bash
./scripts/setup-cron.sh 30
```

Logs are written to `/tmp/trmnl-agenda.log`.

To verify the cron job:

```bash
crontab -l
```

To remove it:

```bash
crontab -l | grep -v trmnl-agenda | crontab -
```

## Getting Your .ics URL

- **Google Calendar**: Settings → calendar → "Secret address in iCal format"
- **Apple iCloud**: Calendar app → Share Calendar → copy the webcal:// link (change `webcal://` to `https://`)
- **Outlook/Office 365**: Settings → Calendar → Shared calendars → Publish a calendar → ICS link

## Project Structure

```
trmnl-plugins/
├── .env.example              # Config template
├── package.json
├── src/
│   └── push.js               # Fetches .ics, parses events, POSTs to TRMNL
├── scripts/
│   └── setup-cron.sh         # Installs the cron job
└── templates/
    ├── full.liquid            # Two-column: Today | Tomorrow
    ├── half_horizontal.liquid # Compact two-column (5 events each)
    ├── half_vertical.liquid   # Stacked: Today then Tomorrow (4 each)
    └── quadrant.liquid        # Today only (4 events)
```

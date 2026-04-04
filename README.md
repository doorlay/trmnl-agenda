### TRMNL Agenda Plugin

A webhook-based TRMNL plugin that displays today's and tomorrow's calendar events from an .ics file. Designed to run on a server as a cron job. 

### Setup 

*Prerequisites*
- [Node.js](https://nodejs.org/) v18+ installed on the server this will run on
- A TRMNL device with [Developer Edition](https://help.trmnl.com/en/articles/9510536-private-plugins) enabled
- A calendar .ics URL

*TRMNL*
1. Go to your [TRMNL dashboard](https://usetrmnl.com)
2. Create a new Private Plugin with the Webhook data strategy
3. Paste the contents of each file in `templates/` into the corresponding layout field (no support for full and half horizontal at the moment):
   - `templates/half_vertical.liquid` → Half Vertical layout
   - `templates/quadrant.liquid` → Quadrant layout
4. Save the plugin and copy the Plugin UUID from the plugin settings

*Server*
1. Clone this repo and run:
```bash
cd trmnl-agenda
npm install
cp .env.example .env
```
2. Fill in your environment variables in .env.
3. Run the script once to verify everything works:
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

4. Run the setup script to install a cron job (defaults to every 15 minutes):

```bash
chmod +x scripts/setup-cron.sh
./scripts/setup-cron.sh
```

Or specify a custom interval in minutes:

```bash
./scripts/setup-cron.sh 30
```

Logs are written to `/tmp/trmnl-agenda.log`.

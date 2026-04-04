import { readFileSync } from "fs";
import ICAL from "ical.js";

const TRMNL_API = "https://usetrmnl.com/api/custom_plugins";

function loadEnv() {
  const env = {};
  try {
    const lines = readFileSync(".env", "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    // fall through to process.env
  }
  return {
    pluginUuid: env.TRMNL_PLUGIN_UUID || process.env.TRMNL_PLUGIN_UUID,
    icsUrl: env.ICS_URL || process.env.ICS_URL,
    tzOffset: parseInt(env.TIMEZONE_OFFSET || process.env.TIMEZONE_OFFSET || "0", 10),
  };
}

function getLocalDate(date, tzOffsetHours) {
  const utc = date.getTime();
  const local = new Date(utc + tzOffsetHours * 3600_000);
  return local;
}

function formatTime(date, tzOffsetHours) {
  const local = getLocalDate(date, tzOffsetHours);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dateKey(date, tzOffsetHours) {
  const local = getLocalDate(date, tzOffsetHours);
  return local.toISOString().slice(0, 10);
}

function parseEvents(icsText, tzOffsetHours) {
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");

  const now = new Date();
  const todayKey = dateKey(now, tzOffsetHours);
  const tomorrowDate = new Date(now.getTime() + 86400_000);
  const tomorrowKey = dateKey(tomorrowDate, tzOffsetHours);

  const todayEvents = [];
  const tomorrowEvents = [];

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      const start = event.startDate.toJSDate();
      const key = dateKey(start, tzOffsetHours);
      const allDay = event.startDate.isDate;

      const entry = {
        title: event.summary || "(No title)",
        time: allDay ? "All day" : formatTime(start, tzOffsetHours),
        sort: allDay ? -1 : start.getTime(),
      };

      if (key === todayKey) todayEvents.push(entry);
      else if (key === tomorrowKey) tomorrowEvents.push(entry);
    } catch (e) {
      console.warn("Skipping unparseable event:", e.message);
    }
  }

  // Handle recurring events
  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      if (!event.isRecurring()) continue;

      const iter = event.iterator();
      let next = iter.next();
      let safety = 0;
      while (next && safety < 10000) {
        const js = next.toJSDate();
        const key = dateKey(js, tzOffsetHours);

        if (key > tomorrowKey) break;

        const allDay = next.isDate;
        const entry = {
          title: event.summary || "(No title)",
          time: allDay ? "All day" : formatTime(js, tzOffsetHours),
          sort: allDay ? -1 : js.getTime(),
        };

        if (key === todayKey && !todayEvents.some((e) => e.title === entry.title && e.time === entry.time)) {
          todayEvents.push(entry);
        } else if (key === tomorrowKey && !tomorrowEvents.some((e) => e.title === entry.title && e.time === entry.time)) {
          tomorrowEvents.push(entry);
        }

        next = iter.next();
        safety++;
      }
    } catch (e) {
      console.warn("Skipping unparseable recurring event:", e.message);
    }
  }

  const sort = (a, b) => a.sort - b.sort;
  todayEvents.sort(sort);
  tomorrowEvents.sort(sort);

  // Remove sort key from output
  const clean = ({ title, time }) => ({ title, time });

  const formatDate = (date) => {
    const local = getLocalDate(date, tzOffsetHours);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[local.getUTCDay()]}, ${months[local.getUTCMonth()]} ${local.getUTCDate()}`;
  };

  return {
    today_date: formatDate(now),
    tomorrow_date: formatDate(tomorrowDate),
    today_events: todayEvents.map(clean),
    tomorrow_events: tomorrowEvents.map(clean),
  };
}

async function main() {
  const { pluginUuid, icsUrl, tzOffset } = loadEnv();

  if (!pluginUuid || !icsUrl) {
    console.error("Missing TRMNL_PLUGIN_UUID or ICS_URL. Set them in .env or environment.");
    process.exit(1);
  }

  console.log(`Fetching calendar from ${icsUrl}...`);
  const res = await fetch(icsUrl);
  if (!res.ok) {
    console.error(`Failed to fetch .ics: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const icsText = await res.text();

  const events = parseEvents(icsText, tzOffset);
  console.log(`Found ${events.today_events.length} today, ${events.tomorrow_events.length} tomorrow.`);

  const payload = { merge_variables: events };
  console.log("Payload:", JSON.stringify(payload, null, 2));

  const apiUrl = `${TRMNL_API}/${pluginUuid}`;
  console.log(`Pushing to ${apiUrl}...`);

  const pushRes = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!pushRes.ok) {
    const body = await pushRes.text();
    console.error(`TRMNL API error: ${pushRes.status} ${pushRes.statusText}\n${body}`);
    process.exit(1);
  }

  console.log("Done! Events pushed to TRMNL.");
}

main();

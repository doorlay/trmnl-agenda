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

  const addOccurrence = (summary, startJS, endJS, isAllDay) => {
    const startKey = dateKey(startJS, tzOffsetHours);
    // DTEND is exclusive for all-day events; back off 1ms to get the last active day
    const lastKey = isAllDay
      ? dateKey(new Date(endJS.getTime() - 1), tzOffsetHours)
      : dateKey(endJS, tzOffsetHours);

    for (const targetKey of [todayKey, tomorrowKey]) {
      if (targetKey < startKey || targetKey > lastKey) continue;
      const showAsAllDay = isAllDay || targetKey !== startKey;
      const entry = {
        title: summary || "(No title)",
        time: showAsAllDay ? "All day" : formatTime(startJS, tzOffsetHours),
        sort: showAsAllDay ? -1 : startJS.getTime(),
        all_day: showAsAllDay,
        end_ms: showAsAllDay ? null : endJS.getTime(),
      };
      const bucket = targetKey === todayKey ? todayEvents : tomorrowEvents;
      if (!bucket.some((e) => e.title === entry.title && e.time === entry.time)) {
        bucket.push(entry);
      }
    }
  };

  // One-off events
  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      if (event.isRecurring()) continue;
      const startJS = event.startDate.toJSDate();
      const endJS = event.endDate ? event.endDate.toJSDate() : startJS;
      addOccurrence(event.summary, startJS, endJS, event.startDate.isDate);
    } catch (e) {
      console.warn("Skipping unparseable event:", e.message);
    }
  }

  // Recurring events
  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      if (!event.isRecurring()) continue;

      const durationMs = event.duration ? event.duration.toSeconds() * 1000 : 0;
      const isAllDay = event.startDate.isDate;

      const iter = event.iterator();
      let next = iter.next();
      let safety = 0;
      while (next && safety < 10000) {
        const startJS = next.toJSDate();
        if (dateKey(startJS, tzOffsetHours) > tomorrowKey) break;
        const endJS = new Date(startJS.getTime() + durationMs);
        addOccurrence(event.summary, startJS, endJS, isAllDay);
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

  // Split today into all-day / past / active and insert the "now" marker
  const nowMs = now.getTime();
  const todayAllDay = [];
  const todayPast = [];
  const todayActive = [];
  for (const e of todayEvents) {
    if (e.all_day) {
      todayAllDay.push(e);
    } else if (e.end_ms !== null && e.end_ms <= nowMs) {
      e.past = true;
      todayPast.push(e);
    } else {
      todayActive.push(e);
    }
  }
  // Keep only the most recent past event as context
  const recentPast = todayPast.length > 0 ? [todayPast[todayPast.length - 1]] : [];
  const todayList = [...todayAllDay, ...recentPast];
  if (todayPast.length > 0 || todayActive.length > 0) {
    todayList.push({ is_marker: true });
  }
  todayList.push(...todayActive);

  const cleanEvent = (e) => {
    if (e.is_marker) return { is_marker: true };
    return { title: e.title, time: e.time, past: !!e.past };
  };

  const formatDate = (date) => {
    const local = getLocalDate(date, tzOffsetHours);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[local.getUTCDay()]}, ${months[local.getUTCMonth()]} ${local.getUTCDate()}`;
  };

  return {
    today_date: formatDate(now),
    tomorrow_date: formatDate(tomorrowDate),
    today_events: todayList.map(cleanEvent),
    tomorrow_events: tomorrowEvents.map(cleanEvent),
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

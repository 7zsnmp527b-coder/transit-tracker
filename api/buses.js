const fetch = require("node-fetch");

// Aircoach open API — no key required
const BASE = "https://www.aircoach.ie/api";

// Routes that serve Drumcondra ↔ Airport
const ROUTES = ["700", "700X"];

// Verified ATCOcodes (2026-06-03)
const STOPS = {
  drumcondra_inbound:  "8220DB000017", // Drumcondra Rail Station (toward airport)
  drumcondra_outbound: "8220DB000047", // Drumcondra opp Rail Station (toward city/south)
  airport_t1:          "8240000551",
  airport_t2:          "8240TR000285",
};

async function getTimetable(route, direction) {
  const url = `${BASE}/track-my-coach-service-timetables?operator=ACAH&service=${route}&direction=${direction}&_format=json`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`Aircoach API ${r.status}`);
  return r.json();
}

function extractStopTimes(trips, targetAtcocode) {
  const results = [];
  for (const trip of trips) {
    const stop = (trip.stops || []).find((s) => s.atcocode === targetAtcocode);
    if (stop) {
      results.push({
        route:       trip.line,
        direction:   trip.dir,
        description: trip.description,
        stopName:    stop.name,
        atcocode:    stop.atcocode,
        time:        stop.time,
        date:        stop.date,
        aimed: {
          arrival:   stop.aimed?.arrival?.time,
          departure: stop.aimed?.departure?.time,
        },
        lat: stop.latitude,
        lng: stop.longitude,
      });
    }
  }
  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    // Fetch timetables for both routes, both directions in parallel
    const fetches = ROUTES.flatMap((route) => [
      getTimetable(route, "inbound").then((trips) => ({
        route, direction: "inbound", trips,
      })),
      getTimetable(route, "outbound").then((trips) => ({
        route, direction: "outbound", trips,
      })),
    ]);

    const results = await Promise.allSettled(fetches);
    const allTrips = { inbound: [], outbound: [] };

    for (const r of results) {
      if (r.status === "fulfilled") {
        const { direction, trips } = r.value;
        allTrips[direction].push(...trips);
      }
    }

    // Drumcondra → Airport (outbound coaches): use outbound timetable, Drumcondra outbound stop
    const drumToAirport = extractStopTimes(
      allTrips.outbound,
      STOPS.drumcondra_outbound
    ).sort((a, b) => (a.time > b.time ? 1 : -1));

    // Airport → Drumcondra (inbound coaches): use inbound timetable, Drumcondra inbound stop
    const airportToDrum = extractStopTimes(
      allTrips.inbound,
      STOPS.drumcondra_inbound
    ).sort((a, b) => (a.time > b.time ? 1 : -1));

    // Airport departures (outbound origin stops)
    const airportDeps = extractStopTimes(
      allTrips.outbound,
      STOPS.airport_t1
    ).sort((a, b) => (a.time > b.time ? 1 : -1));

    res.json({
      drumcondra: {
        toAirport:  drumToAirport,
        fromAirport: airportToDrum,
      },
      airport: {
        departures: airportDeps,
      },
      stops: STOPS,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

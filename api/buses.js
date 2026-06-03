const fetch = require("node-fetch");

// NTA GTFS-RT vehicle positions feed
const VEHICLE_POSITIONS_URL =
  "https://api.nationaltransport.ie/gtfsr/v2/vehicles?format=json";

// Aircoach route IDs in NTA GTFS (routes 702, 703, 704 serve airport)
const AIRCOACH_ROUTES = ["702", "703", "704", "700X"];

// Key stop IDs (NTA GTFS stop_id values)
// Drumcondra: multiple stops — using Drumcondra Road stops for Aircoach
// Dublin Airport: stop_id varies by terminal
const KEY_STOPS = {
  drumcondra: ["8220DB000454", "8220DB000455"], // Drumcondra Rd stops
  airport: ["8220DB000888", "8220DB007779"],    // Dublin Airport T1/T2 Aircoach
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const apiKey = process.env.NTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "NTA_API_KEY not configured" });
  }

  try {
    const r = await fetch(VEHICLE_POSITIONS_URL, {
      headers: { "x-api-key": apiKey },
    });
    if (!r.ok) throw new Error(`NTA API ${r.status}: ${await r.text()}`);
    const data = await r.json();

    const vehicles = (data.entity || [])
      .filter((e) => e.vehicle)
      .map((e) => {
        const v = e.vehicle;
        const routeId = v.trip?.routeId || "";
        return {
          id: e.id,
          routeId,
          lat: v.position?.latitude,
          lng: v.position?.longitude,
          bearing: v.position?.bearing,
          speed: v.position?.speed,
          tripId: v.trip?.tripId,
          stopId: v.stopId,
          currentStatus: v.currentStatus,
          timestamp: v.timestamp,
        };
      })
      .filter((v) =>
        AIRCOACH_ROUTES.some((r) =>
          v.routeId.includes(r)
        )
      );

    res.json({ vehicles, keyStops: KEY_STOPS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

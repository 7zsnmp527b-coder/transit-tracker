// ── Config ────────────────────────────────────────────────────────────────────
const ROUTE = {
  outbound: {
    trainStation: "CLONF",
    trainLabel: "Clondalkin/Fonthill",
    // Northbound + To Dublin Heuston both head toward city
    trainFilter: (t) => t.direction !== "Southbound",
    busStop: "Drumcondra",
    busLabel: "Drumcondra → Airport",
    busFilter: (v) => true,
  },
  inbound: {
    trainStation: "DCDRA",
    trainLabel: "Drumcondra",
    trainFilter: (t) => t.direction === "Southbound",
    busStop: "Airport",
    busLabel: "Dublin Airport → Drumcondra",
    busFilter: (v) => true,
  },
};

// Map centre: roughly midpoint Clondalkin–Drumcondra
const MAP_CENTER = [53.37, -6.27];
const MAP_ZOOM = 11;

// Key locations for map markers
const LOCATIONS = {
  clondalkin: { lat: 53.3219, lng: -6.4025, label: "Clondalkin/Fonthill" },
  drumcondra:  { lat: 53.3706, lng: -6.2592, label: "Drumcondra" },
  airport:     { lat: 53.4264, lng: -6.2499, label: "Dublin Airport" },
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentRoute = "outbound";
let map, trainLayer, busLayer;
let trainData = null, busData = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  placeKeyMarkers();
  bindTabs();
  refresh();
  setInterval(refresh, 30_000);
});

function initMap() {
  map = L.map("map", { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap © CartoDB",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
  trainLayer = L.layerGroup().addTo(map);
  busLayer   = L.layerGroup().addTo(map);
}

function placeKeyMarkers() {
  Object.values(LOCATIONS).forEach(({ lat, lng, label }) => {
    const icon = L.divIcon({ className: "station-marker", iconSize: [14, 14] });
    L.marker([lat, lng], { icon })
      .bindPopup(`<b>${label}</b>`)
      .addTo(map);
  });
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRoute = btn.dataset.route;
      renderAll();
    });
  });
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function refresh() {
  const [tr, bu] = await Promise.allSettled([fetchTrains(), fetchBuses()]);
  if (tr.status === "fulfilled") trainData = tr.value;
  if (bu.status === "fulfilled") busData   = bu.value;
  renderAll();
  document.getElementById("last-update").textContent =
    "Updated " + new Date().toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function fetchTrains() {
  const r = await fetch("/api/trains");
  if (!r.ok) throw new Error(`trains ${r.status}`);
  return r.json();
}

async function fetchBuses() {
  const r = await fetch("/api/buses");
  if (!r.ok) throw new Error(`buses ${r.status}`);
  return r.json();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  renderTrains();
  renderBuses();
  renderMap();
}

function renderTrains() {
  const cfg = ROUTE[currentRoute];
  document.getElementById("train-station-label").textContent = cfg.trainLabel;
  const el = document.getElementById("train-departures");

  if (!trainData) { el.innerHTML = `<p class="empty-state">Loading trains…</p>`; return; }

  const deps = (trainData.stations[cfg.trainStation] || [])
    .filter(cfg.trainFilter)
    .slice(0, 8);

  if (!deps.length) {
    el.innerHTML = `<p class="empty-state">No departures found</p>`;
    return;
  }

  el.innerHTML = deps.map((t) => {
    const late = parseInt(t.late) || 0;
    const badge = late === 0 ? badgeHTML("On time", "green")
                : late <= 5  ? badgeHTML(`${late} min late`, "amber")
                             : badgeHTML(`${late} min late`, "red");
    const exp = t.expectedDep || t.scheduledDep;
    return `
      <div class="departure-row">
        <div class="dep-time">${exp}</div>
        <div class="dep-info">
          <div class="dep-dest">${t.destination}</div>
          <div class="dep-sub">${t.trainCode} · ${t.trainType || "Rail"}</div>
        </div>
        ${badge}
      </div>`;
  }).join("");
}

function renderBuses() {
  const cfg = ROUTE[currentRoute];
  document.getElementById("bus-stop-label").textContent = cfg.busLabel;
  const el = document.getElementById("bus-departures");

  if (!busData) { el.innerHTML = `<p class="empty-state">Loading coaches…</p>`; return; }

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  function futureTimes(trips) {
    return (trips || []).filter((t) => {
      if (!t.time) return false;
      const [h, m] = t.time.split(":").map(Number);
      return (h * 60 + m) >= nowMins - 2;
    }).slice(0, 6);
  }

  const trips = currentRoute === "outbound"
    ? futureTimes(busData.drumcondra?.toAirport)
    : futureTimes(busData.drumcondra?.fromAirport);

  if (!trips.length) {
    el.innerHTML = `<p class="empty-state">No upcoming Aircoach departures</p>`;
    return;
  }

  el.innerHTML = trips.map((t) => {
    const [h, m] = t.time.split(":").map(Number);
    const diffMin = (h * 60 + m) - nowMins;
    const badge = diffMin <= 5  ? badgeHTML(diffMin <= 0 ? "Due" : `${diffMin} min`, diffMin <= 2 ? "amber" : "green")
                                : badgeHTML(t.time, "green");
    return `
      <div class="departure-row">
        <div class="dep-time" style="color:var(--bus)">${t.time}</div>
        <div class="dep-info">
          <div class="dep-dest">Route ${t.route}</div>
          <div class="dep-sub">${t.stopName}</div>
        </div>
        ${badge}
      </div>`;
  }).join("");
}

function renderMap() {
  trainLayer.clearLayers();
  busLayer.clearLayers();

  if (trainData?.positions) {
    trainData.positions.forEach((t) => {
      if (!t.lat || !t.lng) return;
      const icon = L.divIcon({ className: "train-marker", iconSize: [12, 12] });
      L.marker([t.lat, t.lng], { icon })
        .bindPopup(`<b>${t.trainCode}</b><br>${t.publicMessage || t.trainStatus}`)
        .addTo(trainLayer);
    });
  }

  // Aircoach API provides timetables not live positions — mark Drumcondra stop
  const drumIcon = L.divIcon({ className: "bus-marker", iconSize: [12, 12] });
  L.marker([LOCATIONS.drumcondra.lat, LOCATIONS.drumcondra.lng], { icon: drumIcon })
    .bindPopup("<b>Aircoach Stop</b><br>Drumcondra Rail Station<br>Routes 700, 700X")
    .addTo(busLayer);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function badgeHTML(text, colour) {
  return `<span class="dep-badge badge-${colour}">${text}</span>`;
}

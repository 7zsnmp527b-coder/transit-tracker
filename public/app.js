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

  const vehicles = (busData.vehicles || []).filter(cfg.busFilter).slice(0, 8);

  if (!vehicles.length) {
    el.innerHTML = `<p class="empty-state">No live Aircoach vehicles found</p>`;
    return;
  }

  el.innerHTML = vehicles.map((v) => {
    const status = v.currentStatus === 1 ? "Approaching stop"
                 : v.currentStatus === 2 ? "At stop"
                 : "In transit";
    return `
      <div class="departure-row">
        <div class="dep-time" style="font-size:0.9rem;color:var(--bus)">Route<br>${v.routeId}</div>
        <div class="dep-info">
          <div class="dep-dest">${status}</div>
          <div class="dep-sub">Vehicle ${v.id.slice(-6)}</div>
        </div>
        ${badgeHTML("Live", "green")}
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

  if (busData?.vehicles) {
    busData.vehicles.forEach((v) => {
      if (!v.lat || !v.lng) return;
      const icon = L.divIcon({ className: "bus-marker", iconSize: [12, 12] });
      L.marker([v.lat, v.lng], { icon })
        .bindPopup(`<b>Aircoach ${v.routeId}</b><br>Vehicle ${v.id.slice(-6)}`)
        .addTo(busLayer);
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function badgeHTML(text, colour) {
  return `<span class="dep-badge badge-${colour}">${text}</span>`;
}

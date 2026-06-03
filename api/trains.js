const fetch = require("node-fetch");
const xml2js = require("xml2js");

const BASE = "http://api.irishrail.ie/realtime/realtime.asmx";
const NS = "http://api.irishrail.ie/realtime/";

// Verified station codes (tested 2026-06-03)
// CLONF = Clondalkin/Fonthill, DCDRA = Drumcondra
const STATIONS = { CLONF: "Clondalkin/Fonthill", DCDRA: "Drumcondra" };

function parseXml(xml) {
  return new Promise((resolve, reject) =>
    xml2js.parseString(xml, { explicitArray: false, ignoreAttrs: true }, (e, r) =>
      e ? reject(e) : resolve(r)
    )
  );
}

function pluck(obj, key) {
  // xml2js wraps namespaced keys — find by local name
  const nsKey = Object.keys(obj).find((k) => k.endsWith(`:${key}`) || k === key);
  return nsKey ? obj[nsKey] : undefined;
}

async function getStationData(stationCode) {
  const url = `${BASE}/getStationDataByCodeXML?StationCode=${stationCode}`;
  const r = await fetch(url);
  const text = await r.text();
  const parsed = await parseXml(text);

  // Root element varies; find objStationData array
  const root = Object.values(parsed)[0];
  const items = root.objStationData
    ? Array.isArray(root.objStationData)
      ? root.objStationData
      : [root.objStationData]
    : [];

  return items.map((t) => ({
    station: stationCode,
    trainCode: t.Traincode,
    origin: t.Origin,
    destination: t.Destination,
    scheduledDep: t.Schdepart,
    expectedDep: t.Expdepart,
    scheduledArr: t.Scharrival,
    expectedArr: t.Exparrival,
    late: parseInt(t.Late) || 0,
    status: t.Status,
    direction: t.Direction,
    trainType: t.Traintype,
    locationFullName: t.Stationfullname,
    lastLocation: t.Lastlocation,
    duein: parseInt(t.Duein) || 0,
  }));
}

async function getLiveTrainPositions() {
  const url = `${BASE}/getCurrentTrainsXML`;
  const r = await fetch(url);
  const text = await r.text();
  const parsed = await parseXml(text);
  const root = Object.values(parsed)[0];
  const items = root.objTrainPositions
    ? Array.isArray(root.objTrainPositions)
      ? root.objTrainPositions
      : [root.objTrainPositions]
    : [];

  return items.map((t) => ({
    trainCode: t.TrainCode,
    trainStatus: t.TrainStatus,
    direction: t.Direction,
    publicMessage: (t.PublicMessage || "").replace(/\\n/g, " "),
    lat: parseFloat(t.TrainLatitude),
    lng: parseFloat(t.TrainLongitude),
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const [clonf, dcdra, positions] = await Promise.all([
      getStationData("CLONF"),
      getStationData("DCDRA"),
      getLiveTrainPositions(),
    ]);
    res.json({ stations: { CLONF: clonf, DCDRA: dcdra }, positions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

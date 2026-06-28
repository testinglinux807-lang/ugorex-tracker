"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Feature, GeoJsonObject } from "geojson";
import "leaflet/dist/leaflet.css";
import { STAGE_LABEL, RESULT_LABEL, type Stage, type Result } from "@/lib/constants";
import { inGeom, interestTier } from "@/lib/geo";

export type InterestFilter = "ALL" | "POSITIVE" | "REJECTED";

export type MapPoint = {
  id: string; // prospectId
  storeId: string;
  product: string;
  store: string;
  area: string | null;
  stage: string;
  result: string; // POSITIVE | NEUTRAL | REJECTED
  lat: number;
  lng: number;
};

const KARAWANG_CENTER: [number, number] = [-6.265, 107.364];

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const COLOR_POS = "#16a34a"; // tertarik (hijau)
const COLOR_NEG = "#ef4444"; // tidak tertarik (merah)
const COLOR_NEU = "#ffffff"; // netral

function pinIcon(result: string) {
  const bg =
    result === "POSITIVE" ? COLOR_POS : result === "REJECTED" ? COLOR_NEG : COLOR_NEU;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:18px;height:18px;border-radius:9999px;
      background:${bg};border:3px solid #171717;
      box-shadow:0 1px 3px rgba(0,0,0,.4);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

// ---- ikon kontrol (lucide inline) ----
const ICON_MAX =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_MIN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

function FullscreenControl() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ctrl = new L.Control({ position: "topright" });
    let btn: HTMLAnchorElement | null = null;
    ctrl.onAdd = () => {
      const wrap = L.DomUtil.create("div", "leaflet-bar");
      btn = L.DomUtil.create("a", "", wrap) as HTMLAnchorElement;
      btn.href = "#";
      btn.title = "Layar penuh";
      btn.setAttribute("role", "button");
      btn.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:30px;height:30px;color:#171717;background:#fff;";
      btn.innerHTML = ICON_MAX;
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        if (!document.fullscreenElement) container.requestFullscreen?.();
        else document.exitFullscreen?.();
      });
      return wrap;
    };
    ctrl.addTo(map);
    const onFs = () => {
      const isFs = document.fullscreenElement === container;
      if (btn) btn.innerHTML = isFs ? ICON_MIN : ICON_MAX;
      setTimeout(() => map.invalidateSize(), 120);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      ctrl.remove();
    };
  }, [map]);
  return null;
}

function FitKarawang({ geo }: { geo: GeoJsonObject | null }) {
  const map = useMap();
  useEffect(() => {
    if (!geo) return;
    const layer = L.geoJSON(geo);
    map.fitBounds(layer.getBounds(), { padding: [12, 12] });
  }, [geo, map]);
  return null;
}

// Grayscale seluruh peta kecuali Karawang
function GrayscaleSpotlight({ ring }: { ring: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!ring || ring.length < 3) return;
    const basePane = map.getPane("tilePane");
    if (basePane) basePane.style.filter = "grayscale(1)";
    const PANE = "colorTiles";
    if (!map.getPane(PANE)) {
      const p = map.createPane(PANE);
      p.style.zIndex = "250";
      p.style.pointerEvents = "none";
    }
    const colorLayer = L.tileLayer(TILE_URL, {
      subdomains: "abcd",
      pane: PANE,
    }).addTo(map);
    const pane = map.getPane(PANE)!;
    const latlngs = ring.map(([lng, lat]) => L.latLng(lat, lng));
    const update = () => {
      const pts = latlngs.map((ll) => map.latLngToLayerPoint(ll));
      pane.style.clipPath =
        "polygon(" + pts.map((p) => `${p.x}px ${p.y}px`).join(",") + ")";
    };
    update();
    map.on("zoomend viewreset moveend resize", update);
    return () => {
      map.off("zoomend viewreset moveend resize", update);
      map.removeLayer(colorLayer);
      if (basePane) basePane.style.filter = "";
      pane.style.clipPath = "";
    };
  }, [ring, map]);
  return null;
}

export default function MapInner({
  points,
  filter,
}: {
  points: MapPoint[];
  filter: InterestFilter;
}) {
  const [geo, setGeo] = useState<GeoJsonObject | null>(null);
  const [kec, setKec] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    fetch("/karawang.geojson")
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo(null));
    fetch("/karawang-kecamatan.geojson")
      .then((r) => r.json())
      .then(setKec)
      .catch(() => setKec(null));
  }, []);

  const ring = useMemo<[number, number][] | null>(() => {
    if (!geo) return null;
    const fc = geo as {
      features?: { geometry?: { type: string; coordinates: unknown } }[];
    };
    const g = fc.features?.[0]?.geometry;
    if (!g) return null;
    let r: [number, number][] | undefined;
    if (g.type === "Polygon") r = (g.coordinates as [number, number][][])[0];
    else if (g.type === "MultiPolygon")
      r = (g.coordinates as [number, number][][][])[0][0];
    if (!r) return null;
    const step = Math.max(1, Math.ceil(r.length / 800));
    const out = r.filter((_, i) => i % step === 0);
    if (out[out.length - 1] !== r[r.length - 1]) out.push(r[r.length - 1]);
    return out;
  }, [geo]);

  // Agregasi tertarik/tidak per kecamatan
  const agg = useMemo(() => {
    const m = new Map<string, { pos: number; neg: number; neu: number }>();
    if (!kec) return m;
    const feats = (kec as unknown as { features: Feature[] }).features;
    for (const p of points) {
      const f = feats.find((ft) =>
        ft.geometry
          ? inGeom([p.lng, p.lat], ft.geometry as { type: string; coordinates: unknown })
          : false,
      );
      if (!f) continue;
      const name = (f.properties as { name?: string } | null)?.name ?? "";
      const rec = m.get(name) ?? { pos: 0, neg: 0, neu: 0 };
      if (p.result === "POSITIVE") rec.pos++;
      else if (p.result === "REJECTED") rec.neg++;
      else rec.neu++;
      m.set(name, rec);
    }
    return m;
  }, [kec, points]);

  const styleFor = (name: string): L.PathOptions => {
    const rec = agg.get(name);
    const total = rec ? rec.pos + rec.neg + rec.neu : 0;
    if (!rec || total === 0) {
      return { color: "#9ca3af", weight: 1, fillColor: "#d4d4d4", fillOpacity: 0.12 };
    }
    const score = (rec.pos + 0.5 * rec.neu) / total;
    return {
      color: "#404040",
      weight: 1,
      fillColor: interestTier(score).color,
      fillOpacity: 0.6,
    };
  };

  const shown = points.filter((p) =>
    filter === "ALL" ? true : p.result === filter,
  );

  return (
    <MapContainer
      center={KARAWANG_CENTER}
      zoom={10}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={TILE_ATTR} url={TILE_URL} subdomains="abcd" />

      <FullscreenControl />
      <FitKarawang geo={geo} />
      <GrayscaleSpotlight ring={ring} />

      {/* Choropleth kecamatan: merah ↔ hijau by rasio tertarik */}
      {kec && (
        <GeoJSON
          key="kec"
          data={kec}
          style={(feature) =>
            styleFor((feature?.properties as { name?: string })?.name ?? "")
          }
          onEachFeature={(feature: Feature, layer: L.Layer) => {
            const name =
              (feature.properties as { name?: string } | null)?.name ?? "";
            const rec = agg.get(name);
            let info = "<br/>Belum ada data";
            if (rec) {
              const total = rec.pos + rec.neg + rec.neu;
              const tier = interestTier((rec.pos + 0.5 * rec.neu) / total);
              info = `<br/><b>${tier.label}</b><br/>Tertarik: ${rec.pos} · Tidak: ${rec.neg}${rec.neu ? ` · Netral: ${rec.neu}` : ""}`;
            }
            layer.bindTooltip(`<b>${name}</b>${info}`, { sticky: true });
            layer.on({
              mouseover: (e) => {
                e.target.setStyle({ weight: 2.5, color: "#171717" });
                e.target.bringToFront();
              },
              mouseout: (e) => e.target.setStyle(styleFor(name)),
            });
          }}
        />
      )}

      {/* Garis batas Karawang (tebal) */}
      {geo && (
        <GeoJSON
          key="outline"
          data={geo}
          style={{
            color: "#171717",
            weight: 3.5,
            lineJoin: "round",
            lineCap: "round",
            fill: false,
          }}
        />
      )}

      {shown.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.result)}>
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{p.product}</p>
              <p className="text-neutral-600">
                <Link
                  href={`/konter/${p.storeId}`}
                  className="font-medium underline"
                >
                  {p.store}
                </Link>
                {p.area ? ` · ${p.area}` : ""}
              </p>
              <p className="text-neutral-500">
                Tahap: {STAGE_LABEL[p.stage as Stage] ?? p.stage} ·{" "}
                {RESULT_LABEL[p.result as Result] ?? p.result}
              </p>
              <div className="flex gap-3">
                <Link
                  href={`/konter/${p.storeId}`}
                  className="inline-block font-semibold underline"
                >
                  Detail toko
                </Link>
                <Link
                  href={`/prospects/${p.id}`}
                  className="inline-block font-semibold underline"
                >
                  Detail prospek
                </Link>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

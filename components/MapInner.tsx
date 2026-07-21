"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Circle,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Feature, GeoJsonObject } from "geojson";
import "leaflet/dist/leaflet.css";
import { STAGE_LABEL, RESULT_LABEL, type Stage, type Result } from "@/lib/constants";
import { inGeom, interestTier } from "@/lib/geo";

// Filter titik peta by tahap funnel (Awareness → Star Seller)
export type StageFilter = "ALL" | Stage;

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
  // Nama sales LAIN yang menggarap konter ini (peta beranda sales) —
  // kalau terisi, titik digambar abu-abu sebagai penanda "sudah ada yang
  // menawarkan & tertarik" dan tidak ikut filter Tertarik/Tidak.
  otherSales?: string | null;
};

// Konter yang benar-benar berkontribusi ke penjualan (punya transaksi Sale)
// — digambar sebagai bubble, ukurannya sebanding total revenue toko itu.
export type StoreRevenuePoint = {
  storeId: string;
  store: string;
  area: string | null;
  lat: number;
  lng: number;
  revenue: number;
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const KARAWANG_CENTER: [number, number] = [-6.265, 107.364];

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Titik rumah sales — pusat lingkaran radius kerja (meter). name diisi
// di peta admin (banyak sales); kosong = "Rumah kamu" (beranda sales).
export type HomePoint = { lat: number; lng: number; name?: string };
export const WORK_RADIUS_M = 7000;

const COLOR_POS = "#16a34a"; // tertarik (hijau)
const COLOR_NEG = "#ef4444"; // tidak tertarik (merah)
const COLOR_NEU = "#ffffff"; // netral
const COLOR_OTHER = "#9ca3af"; // digarap sales lain (abu-abu)

function pinIcon(result: string, other = false) {
  const bg = other
    ? COLOR_OTHER
    : result === "POSITIVE"
      ? COLOR_POS
      : result === "REJECTED"
        ? COLOR_NEG
        : COLOR_NEU;
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

// Ikon rumah sales (lucide "house" inline, lingkaran hitam)
const ICON_HOUSE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d2ec0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

function homeIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:26px;height:26px;border-radius:9999px;
      background:#171717;border:2px solid #fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 1px 4px rgba(0,0,0,.45);
    ">${ICON_HOUSE}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

// ---- ikon kontrol (lucide inline) ----
const ICON_MAX =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_MIN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

// Layar penuh berbasis CSS (class .ug-map-full) — jalan di semua device,
// termasuk HP yang tak mendukung Fullscreen API untuk elemen non-video.
function FullscreenControl() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ctrl = new L.Control({ position: "topright" });
    let btn: HTMLAnchorElement | null = null;
    let full = false;

    const apply = (on: boolean) => {
      full = on;
      container.classList.toggle("ug-map-full", on);
      if (btn) btn.innerHTML = on ? ICON_MIN : ICON_MAX;
      // beri jeda supaya layout berubah dulu sebelum peta hitung ulang ukuran
      setTimeout(() => map.invalidateSize(), 150);
    };

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
        apply(!full);
      });
      return wrap;
    };
    ctrl.addTo(map);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && full) apply(false);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      if (full) container.classList.remove("ug-map-full");
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

// Obat bug peta di HP: peta yang diinisialisasi saat kontainernya masih
// tersembunyi (tab "Peta" di DataTabs pakai display:none) berukuran 0 →
// tile abu-abu & marker meleset. Begitu kontainer berubah ukuran (tab
// dibuka, rotasi layar, fullscreen), hitung ulang ukuran; kalau tadinya
// tersembunyi, pas-kan lagi view ke Karawang.
function KeepSized({ geo }: { geo: GeoJsonObject | null }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w === lastW) return;
      const wasHidden = lastW === 0;
      lastW = w;
      if (w === 0) return;
      map.invalidateSize();
      if (wasHidden && geo) {
        map.fitBounds(L.geoJSON(geo).getBounds(), { padding: [12, 12] });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, geo]);
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
    // Update di-throttle lewat requestAnimationFrame + ikut event "zoom"
    // (bukan cuma zoomend) supaya overlay warna tetap nempel saat
    // pinch-zoom di HP, tanpa ngelag.
    let raf = 0;
    const update = () => {
      raf = 0;
      const pts = latlngs.map((ll) => map.latLngToLayerPoint(ll));
      pane.style.clipPath =
        "polygon(" + pts.map((p) => `${p.x}px ${p.y}px`).join(",") + ")";
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    map.on("zoom zoomend viewreset moveend resize", schedule);
    return () => {
      map.off("zoom zoomend viewreset moveend resize", schedule);
      if (raf) cancelAnimationFrame(raf);
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
  storePoints = [],
  homePoints = [],
}: {
  points: MapPoint[];
  filter: StageFilter;
  storePoints?: StoreRevenuePoint[];
  // Rumah sales — tiap titik digambar lingkaran radius kerja 7 km + ikon
  // rumah. Beranda sales: 1 titik (miliknya); peta admin: semua sales.
  homePoints?: HomePoint[];
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
    // 400 titik cukup halus untuk clip warna (outline tebal tetap full-res)
    // dan setengah lebih ringan dihitung per frame di HP.
    const step = Math.max(1, Math.ceil(r.length / 400));
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
    filter === "ALL" ? true : !p.otherSales && p.stage === filter,
  );

  // Radius bubble (METER, bukan pixel) sebanding akar(revenue) — supaya
  // konter omzet 4x lipat tidak jadi 4x lebih lebar (cukup ~2x). Pakai meter
  // biar bubble ikut skala peta: zoom out mengecil, zoom in membesar —
  // konsisten, tidak "membesar" saat di-zoom out seperti CircleMarker pixel.
  const maxRevenue = Math.max(1, ...storePoints.map((s) => s.revenue));
  const radiusFor = (revenue: number) =>
    250 + 900 * Math.sqrt(revenue / maxRevenue);

  return (
    <MapContainer
      center={KARAWANG_CENTER}
      zoom={10}
      scrollWheelZoom={true}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={TILE_ATTR} url={TILE_URL} subdomains="abcd" />

      <FullscreenControl />
      <FitKarawang geo={geo} />
      <KeepSized geo={geo} />
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

      {/* Radius kerja sales: lingkaran 7 km dari titik rumah tiap sales */}
      {homePoints.map((h, i) => (
        <Fragment key={`home-${i}`}>
          <Circle
            center={[h.lat, h.lng]}
            radius={WORK_RADIUS_M}
            pathOptions={{
              color: "#171717",
              weight: 1.5,
              dashArray: "6 6",
              fillColor: "#d2ec0a",
              fillOpacity: 0.07,
            }}
          />
          <Marker position={[h.lat, h.lng]} icon={homeIcon()}>
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">
                  {h.name ? `Rumah ${h.name}` : "Rumah kamu"}
                </p>
                <p className="text-neutral-600">
                  Lingkaran = radius kerja {WORK_RADIUS_M / 1000} km - konter
                  di dalamnya paling gampang dijangkau.
                </p>
              </div>
            </Popup>
          </Marker>
        </Fragment>
      ))}

      {/* Bubble konter yang benar-benar berkontribusi ke penjualan —
          ukuran = besar kontribusinya, di bawah pin funnel */}
      {storePoints.map((s) => (
        <Circle
          key={`rev-${s.storeId}`}
          center={[s.lat, s.lng]}
          radius={radiusFor(s.revenue)}
          pathOptions={{
            color: "#7a8a02",
            weight: 1.5,
            fillColor: "#d2ec0a",
            fillOpacity: 0.45,
          }}
        >
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{s.store}</p>
              {s.area && <p className="text-neutral-500">{s.area}</p>}
              <p className="text-neutral-700">
                Kontribusi penjualan:{" "}
                <span className="font-semibold">{rupiah(s.revenue)}</span>
              </p>
              <Link
                href={`/konter/${s.storeId}`}
                className="inline-block font-semibold underline"
              >
                Detail toko
              </Link>
            </div>
          </Popup>
        </Circle>
      ))}

      {shown.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.result, !!p.otherSales)}
        >
          <Popup>
            {p.otherSales ? (
              // Konter garapan sales lain — info saja, tanpa link detail
              // (halaman detailnya memang bukan wewenang sales ini).
              <div className="space-y-1">
                <p className="font-semibold">{p.store}</p>
                {p.area && <p className="text-neutral-500">{p.area}</p>}
                <p className="text-neutral-600">
                  Sudah ditawarkan <b>{p.otherSales}</b> ({p.product})
                </p>
                <p className="text-neutral-500">
                  Tahap: {STAGE_LABEL[p.stage as Stage] ?? p.stage} ·{" "}
                  {RESULT_LABEL[p.result as Result] ?? p.result}
                </p>
              </div>
            ) : (
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
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

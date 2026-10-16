"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPoint {
  id: string;
  lng: number;
  lat: number;
  kind: "load" | "truck" | "city";
  label: string;
  sub?: string;
  href?: string;
  weight?: number; // heatmap intensity / circle size
  tone?: "pos" | "brand" | "warn" | "neg" | "muted";
}
export interface MapRoute {
  id: string;
  from: [number, number];
  to: [number, number];
  kind?: "loaded" | "empty";
  highlight?: boolean;
}

// OpenStreetMap standard tiles — fine for development and light use under the OSM tile policy.
// For production traffic set NEXT_PUBLIC_MAP_TILES to a commercial/self-hosted raster endpoint.
const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Served from /public by scripts/copy-maplibre-worker.mjs (bundlers can't inline the module worker).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#0d7d6f";
const theme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/**
 * One tile set, themed with raster paint: light = desaturated; dark = luminance inverted
 * (brightness min/max swapped) with hue rotated back so water stays blue-ish.
 */
function style(t: "light" | "dark"): StyleSpecification {
  const paint =
    t === "dark"
      ? { "raster-brightness-min": 0.92, "raster-brightness-max": 0.08, "raster-hue-rotate": 180, "raster-saturation": -0.75, "raster-contrast": 0.1 }
      : { "raster-saturation": -0.75, "raster-contrast": -0.05, "raster-brightness-min": 0.08 };
  return {
    version: 8,
    sources: { base: { type: "raster", tiles: [TILES], tileSize: 256, attribution: ATTRIBUTION, maxzoom: 19 } },
    layers: [{ id: "base", type: "raster", source: "base", paint }],
  };
}

/** Great-circle-ish arc so routes read as routes, not straight rulers. */
function arc(a: [number, number], b: [number, number], n = 32): [number, number][] {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = 0.12;
  const cx = (x1 + x2) / 2 - dy * bend;
  const cy = (y1 + y2) / 2 + dx * bend;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2];
  });
}

export default function FreightMap({
  points = [],
  routes = [],
  mode = "markers",
  className,
  onSelect,
  fitPadding = 48,
}: {
  points?: MapPoint[];
  routes?: MapRoute[];
  mode?: "markers" | "heat";
  className?: string;
  onSelect?: (id: string) => void;
  fitPadding?: number;
}) {
  const { t } = useI18n();
  const openLabel = useRef("");
  openLabel.current = t("map.open");
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const data = useRef({ points, routes });
  data.current = { points, routes };

  function sync(m: MLMap) {
    const { points: pts, routes: rts } = data.current;
    const brand = css("--brand");
    const accent = css("--accent");
    const muted = css("--subtle");
    const toneColor: Record<string, string> = { pos: css("--pos"), brand, warn: css("--warn"), neg: css("--neg"), muted };

    const pointFc = {
      type: "FeatureCollection" as const,
      features: pts.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id, kind: p.kind, label: p.label, sub: p.sub ?? "", href: p.href ?? "", weight: p.weight ?? 1, color: toneColor[p.tone ?? "brand"] },
      })),
    };
    const routeFc = {
      type: "FeatureCollection" as const,
      features: rts.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: arc(r.from, r.to) },
        properties: { id: r.id, kind: r.kind ?? "loaded", highlight: r.highlight ? 1 : 0 },
      })),
    };

    const ps = m.getSource("points") as GeoJSONSource | undefined;
    const rs = m.getSource("routes") as GeoJSONSource | undefined;
    if (ps && rs) {
      ps.setData(pointFc);
      rs.setData(routeFc);
      return;
    }

    m.addSource("routes", { type: "geojson", data: routeFc });
    m.addLayer({
      id: "routes",
      type: "line",
      source: "routes",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": ["case", ["==", ["get", "kind"], "empty"], muted, brand],
        "line-width": ["case", ["==", ["get", "highlight"], 1], 3.5, 1.6],
        "line-opacity": ["case", ["==", ["get", "highlight"], 1], 0.95, 0.45],
        "line-dasharray": [2, 1.5],
      },
    });

    if (mode === "heat") {
      m.addSource("points", { type: "geojson", data: pointFc });
      m.addLayer({
        id: "heat-circles",
        type: "circle",
        source: "points",
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.28,
          "circle-radius": ["interpolate", ["linear"], ["get", "weight"], 0, 6, 5, 14, 20, 26, 60, 40],
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 1.5,
        },
      });
      m.addLayer({ id: "heat-core", type: "circle", source: "points", paint: { "circle-color": ["get", "color"], "circle-radius": 3.5 } });
    } else {
      // Loads are clustered so hundreds of pickups never render as hundreds of DOM markers.
      m.addSource("points", { type: "geojson", data: pointFc, cluster: true, clusterRadius: 42, clusterMaxZoom: 9 });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "points",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": brand,
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 30, 24],
          "circle-stroke-width": 3,
          "circle-stroke-color": css("--surface"),
        },
      });
      // Cluster size is encoded by radius (no glyph server dependency for text labels).
      m.addLayer({
        id: "points",
        type: "circle",
        source: "points",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["case", ["==", ["get", "kind"], "truck"], accent, ["get", "color"]],
          "circle-radius": ["case", ["==", ["get", "kind"], "truck"], 7, 6],
          "circle-stroke-width": 2,
          "circle-stroke-color": css("--surface"),
        },
      });
    }

    const clickable = mode === "heat" ? "heat-circles" : "points";
    m.on("click", clickable, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { id: string; label: string; sub: string; href: string };
      onSelect?.(p.id);
      const html = `<div style="font:500 13px var(--font-sans)">${p.label}</div>${p.sub ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${p.sub}</div>` : ""}${p.href ? `<a href="${p.href}" style="display:inline-block;margin-top:6px;font-size:12px;color:var(--brand)">${openLabel.current}</a>` : ""}`;
      new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat(e.lngLat).setHTML(html).addTo(m);
    });
    if (mode !== "heat")
      m.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = m.getSource("points") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
    for (const l of [clickable, "clusters"]) {
      m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
    }
  }

  function fit(m: MLMap) {
    const coords = [...data.current.points.map((p) => [p.lng, p.lat] as [number, number]), ...data.current.routes.flatMap((r) => [r.from, r.to])];
    if (!coords.length) return;
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    for (const c of coords) b.extend(c);
    m.fitBounds(b, { padding: fitPadding, maxZoom: 8, duration: 0 });
  }

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: style(theme()),
      center: [66.5, 41],
      zoom: 4.2,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current = m;
    // Keep the canvas in sync with its container (layout changes don't fire window resize).
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    m.on("load", () => {
      sync(m);
      fit(m);
    });
    const onTheme = () => {
      m.setStyle(style(theme()));
      m.once("styledata", () => sync(m));
    };
    window.addEventListener("themechange", onTheme);
    return () => {
      window.removeEventListener("themechange", onTheme);
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const m = map.current;
    if (m?.isStyleLoaded() && m.getSource("points")) {
      sync(m);
      fit(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, routes]);

  return <div ref={el} className={className} role="region" aria-label="Map" />;
}

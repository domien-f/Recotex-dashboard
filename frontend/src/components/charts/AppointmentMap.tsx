import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface GeoPoint {
  postcode: string;
  city: string;
  count: number;
  lat: number;
  lng: number;
}

interface AppointmentMapProps {
  data: GeoPoint[];
}

export function AppointmentMap({ data }: AppointmentMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Clean up previous map
    if (map.current) {
      map.current.remove();
      map.current = null;
      loaded.current = false;
    }

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
            tileSize: 256,
            attribution: "&copy; OSM &copy; CARTO",
          },
        },
        layers: [{ id: "carto", type: "raster", source: "carto" }],
      },
      center: [4.35, 50.85],
      zoom: 7.5,
      maxZoom: 13,
      minZoom: 6,
    });

    m.addControl(new maplibregl.NavigationControl(), "top-right");

    map.current = m;

    m.on("load", () => {
      loaded.current = true;
      addDataToMap(m, data);
    });

    return () => {
      m.remove();
      map.current = null;
      loaded.current = false;
    };
  }, []); // only mount once

  useEffect(() => {
    if (!map.current || !loaded.current) return;
    addDataToMap(map.current, data);
  }, [data]);

  return (
    <div ref={mapContainer} className="h-[480px] w-full rounded-xl overflow-hidden" />
  );
}

function addDataToMap(m: maplibregl.Map, data: GeoPoint[]) {
  // Clean old layers
  if (m.getLayer("appt-glow")) m.removeLayer("appt-glow");
  if (m.getLayer("appt-dots")) m.removeLayer("appt-dots");
  if (m.getLayer("appt-labels")) m.removeLayer("appt-labels");
  if (m.getSource("appointments")) m.removeSource("appointments");

  if (!data.length) return;

  const features = data.map((g) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [g.lng, g.lat],
    },
    properties: {
      count: g.count,
      city: g.city,
      postcode: g.postcode,
    },
  }));

  m.addSource("appointments", {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });

  // Outer glow
  m.addLayer({
    id: "appt-glow",
    type: "circle",
    source: "appointments",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["get", "count"],
        1, 10,
        10, 20,
        50, 35,
        100, 50,
      ],
      "circle-color": "#f08300",
      "circle-opacity": 0.15,
      "circle-blur": 0.8,
    },
  });

  // Solid dot
  m.addLayer({
    id: "appt-dots",
    type: "circle",
    source: "appointments",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["get", "count"],
        1, 4,
        10, 7,
        50, 12,
        100, 18,
      ],
      "circle-color": [
        "interpolate", ["linear"], ["get", "count"],
        1, "#f08300",
        20, "#ff6b00",
        50, "#ff4444",
      ],
      "circle-opacity": 0.9,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(255,255,255,0.4)",
    },
  });

  // Labels for big clusters
  m.addLayer({
    id: "appt-labels",
    type: "symbol",
    source: "appointments",
    filter: [">", ["get", "count"], 15],
    layout: {
      "text-field": ["get", "count"],
      "text-size": 10,
      "text-font": ["Open Sans Bold"],
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.5)",
      "text-halo-width": 1,
    },
  });

  // Popup
  const popup = new maplibregl.Popup({ closeButton: false, offset: 12 });

  m.on("mouseenter", "appt-dots", (e) => {
    m.getCanvas().style.cursor = "pointer";
    const props = e.features?.[0]?.properties;
    if (!props) return;
    popup
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family:system-ui;padding:2px 0;">
          <div style="font-weight:700;font-size:14px;color:#1a1a1a;">${props.city || props.postcode}</div>
          <div style="color:#888;font-size:11px;">${props.postcode}</div>
          <div style="font-weight:800;color:#f08300;font-size:18px;margin-top:4px;">${props.count}</div>
          <div style="color:#888;font-size:10px;">afspraken</div>
        </div>
      `)
      .addTo(m);
  });

  m.on("mouseleave", "appt-dots", () => {
    m.getCanvas().style.cursor = "";
    popup.remove();
  });
}

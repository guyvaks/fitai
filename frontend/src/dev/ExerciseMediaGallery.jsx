import { useEffect, useRef, useState } from "react";
import api from "../services/api";

// Dev-only QA page for the lifelike-v3 exercises_master reseed (2026-08-04).
// Lets Guy visually spot-check that all 384 animations/thumbnails render
// correctly before approving the same migration+seed+media run against
// production. Not linked from any nav -- reached directly via
// /dev/exercise-media, gated on import.meta.env.DEV in App.jsx so this
// route/chunk never ships in a production build.
export default function ExerciseMediaGallery() {
  const [exercises, setExercises] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .get("/api/v1/exercises/master")
      .then((res) => setExercises(res.data))
      .catch((err) => setError(err.message));
  }, []);

  const withMedia = exercises.filter((e) => e.exercise_id);
  const filtered = withMedia.filter(
    (e) =>
      !filter ||
      e.canonical_name_he.includes(filter) ||
      (e.canonical_name_en || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif", background: "#0b0e14", color: "#eee", minHeight: "100vh" }}>
      <h1>Exercise Media Gallery (dev QA) — {filtered.length}/{withMedia.length} shown</h1>
      <p style={{ color: "#999", fontSize: 12 }}>
        Only tiles currently in view play their animation (IntersectionObserver) — off-screen tiles show the static thumbnail. This keeps ~380 concurrent animated WebPs from overloading the browser's decoder and making playback look sped-up/choppy.
      </p>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      <input
        placeholder="סנן לפי שם..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ padding: 8, marginBottom: 16, width: 300 }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {filtered.map((e) => (
          <ExerciseTile key={e.id} exercise={e} />
        ))}
      </div>
    </div>
  );
}

function ExerciseTile({ exercise: e }) {
  const [inView, setInView] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // rootMargin pre-loads slightly before a tile actually enters the
    // viewport so the animation is already playing by the time it's visible,
    // rather than popping in on the static thumbnail first.
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "150px", threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ border: "1px solid #333", borderRadius: 8, padding: 8 }}>
      <img
        src={inView ? e.animation_webp_url : e.thumbnail_png_url}
        alt={e.canonical_name_he}
        style={{ width: "100%", height: 140, objectFit: "contain", background: "#1a1e28" }}
        onError={(ev) => {
          ev.target.style.border = "2px solid red";
        }}
      />
      <div style={{ fontSize: 13, marginTop: 6 }}>
        <strong>{e.canonical_name_he}</strong>
        <div style={{ color: "#999" }}>{e.canonical_name_en}</div>
        <div>{e.muscle_group_primary} · {e.equipment}</div>
        <div style={{ color: "#666", fontSize: 11 }}>{e.exercise_id}{inView ? " · playing" : ""}</div>
      </div>
      <img
        src={e.thumbnail_png_url}
        alt={`${e.canonical_name_he} thumbnail`}
        style={{ width: 40, height: 40, objectFit: "cover", marginTop: 4, borderRadius: 4 }}
        onError={(ev) => {
          ev.target.style.border = "2px solid red";
        }}
      />
    </div>
  );
}

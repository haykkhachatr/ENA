"""Build data/network-data.js from HEC_JSON/line.geojson.

The website is a static site that must also work when index.html is opened
straight from disk (file://), where fetch() of a local .geojson is blocked.
So the GeoJSON is converted into a compact JavaScript data file:

  * Z values are dropped (all vertices are 2-D on the web map)
  * vertices are simplified (Ramer-Douglas-Peucker, 1 m tolerance) and rounded
    to 5 decimals (~1.1 m) -- invisible at any zoom the map offers
  * attribute values (including the authoritative `Length`, in km) are untouched
  * data-quality statistics are computed here and embedded for the Notes section

Run:  python tools/build_data.py [path/to/line.geojson]
      (without an argument it reads ../../HEC_JSON/line.geojson, the original project layout)
"""
import collections
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.normpath(os.path.join(HERE, "..", "..", "HEC_JSON", "line.geojson"))
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "network-data.js"))

TOL_M = 1.0          # simplification tolerance, metres
DECIMALS = 5         # coordinate precision
R = 6371008.8


def to_xy(p, lat0):
    return (math.radians(p[0]) * R * math.cos(lat0), math.radians(p[1]) * R)


def rdp(pts, tol):
    """Iterative Ramer-Douglas-Peucker on metric (x, y) points."""
    n = len(pts)
    if n < 3:
        return list(range(n))
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if seg2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [i for i, k in enumerate(keep) if k]


def haversine_km(a, b):
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = la2 - la1, math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def main():
    with open(SRC, encoding="utf-8") as fh:
        gj = json.load(fh)
    feats = gj["features"]
    feats.sort(key=lambda f: f["properties"]["ID_final"])

    branches, communities, provinces = [], [], []

    def idx(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    # stable ordering: by total length desc so legends/colours are deterministic
    tot_b, tot_c = collections.Counter(), collections.Counter()
    for f in feats:
        p = f["properties"]
        tot_b[p["Branch"]] += p["Length"]
        tot_c[p["Community"]] += p["Length"]
    for k, _ in tot_b.most_common():
        branches.append(k)
    for k, _ in tot_c.most_common():
        communities.append(k)

    out, v_in, v_out = [], 0, 0
    geo_km = 0.0
    max_dev = 0.0
    for f in feats:
        p = f["properties"]
        line = f["geometry"]["coordinates"]
        # every feature in this file is a single-part MultiLineString; keep parts generic anyway
        parts = []
        for part in line:
            v_in += len(part)
            lat0 = math.radians(sum(q[1] for q in part) / len(part))
            xy = [to_xy(q, lat0) for q in part]
            keep = rdp(xy, TOL_M)
            simp = []
            for i in keep:
                pt = [round(part[i][0], DECIMALS), round(part[i][1], DECIMALS)]
                if not simp or simp[-1] != pt:
                    simp.append(pt)
            if len(simp) < 2:
                simp = [[round(part[0][0], DECIMALS), round(part[0][1], DECIMALS)],
                        [round(part[-1][0], DECIMALS), round(part[-1][1], DECIMALS)]]
            v_out += len(simp)
            parts.append(simp)
        g = sum(haversine_km(part[i - 1], part[i]) for part in line for i in range(1, len(part)))
        geo_km += g
        if p["Length"]:
            max_dev = max(max_dev, abs(g - p["Length"]) / p["Length"])
        out.append({
            "id": p["ID_final"],
            "uid": p["UID"] or None,
            "br": branches.index(p["Branch"]),
            "cm": communities.index(p["Community"]),
            "pv": idx(provinces, p["Province"]),
            "nm": p["Name"],
            "len": round(p["Length"], 6),
            "kv": p["Voltage"],
            "c": parts[0] if len(parts) == 1 else None,
            "m": parts if len(parts) > 1 else None,
        })

    attr_km = sum(f["properties"]["Length"] for f in feats)
    names = collections.Counter(f["properties"]["Name"] for f in feats)
    uids = collections.Counter(f["properties"]["UID"] for f in feats if f["properties"]["UID"])
    miss = [f for f in feats if not f["properties"]["UID"]]
    miss_by_branch = collections.Counter(f["properties"]["Branch"] for f in miss)

    quality = {
        "sourceFile": "line.geojson",
        "crs": "WGS 84 (OGC:CRS84)",
        "geometryType": "MultiLineString",
        "features": len(feats),
        "verticesSource": v_in,
        "verticesWeb": v_out,
        "attrKm": round(attr_km, 3),
        "geodesicKm": round(geo_km, 3),
        "geodesicDevPct": round(abs(geo_km - attr_km) / attr_km * 100, 2),
        "maxSegDevPct": round(max_dev * 100, 2),
        "missingUid": len(miss),
        "missingUidByBranch": [[b, n] for b, n in miss_by_branch.most_common()],
        "duplicateUidGroups": sum(1 for v in uids.values() if v > 1),
        "duplicateNameGroups": sum(1 for v in names.values() if v > 1),
        "duplicateNameFeatures": sum(v for v in names.values() if v > 1),
        "outsideYerevan": sum(1 for f in feats if f["properties"]["Province"] != "Երևան"),
        "shortUnder5m": sum(1 for f in feats if f["properties"]["Length"] < 0.005),
        "spellingVariants": [["Դավթաշեն", sum(1 for f in feats if f["properties"]["Community"] == "Դավթաշեն")],
                             ["Դավիթաշեն", sum(1 for f in feats if f["properties"]["Community"] == "Դավիթաշեն")]],
    }

    xs = [pt[0] for r in out for pt in (r["c"] or [q for part in r["m"] for q in part])]
    ys = [pt[1] for r in out for pt in (r["c"] or [q for part in r["m"] for q in part])]
    data = {
        "meta": {
            "title": "Yerevan electric network - lines",
            "source": "line.geojson (QGIS layer 6_10_Line)",
            "units": {"length": "km", "voltage": "kV"},
            "bounds": [[round(min(ys), 5), round(min(xs), 5)], [round(max(ys), 5), round(max(xs), 5)]],
            "quality": quality,
        },
        "branches": branches,
        "communities": communities,
        "provinces": provinces,
        "features": out,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by tools/build_data.py from HEC_JSON/line.geojson - do not edit by hand. */\n")
        fh.write("window.HEC_DATA = ")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    size = os.path.getsize(OUT)
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"features={len(out)} vertices {v_in} -> {v_out}  file={size/1e6:.2f} MB")
    print(json.dumps(quality, ensure_ascii=False, indent=1))
    print("branches", branches)
    print("communities", communities)


if __name__ == "__main__":
    main()

// Chennai areas for the regional surveillance map. A schematic area map (not to
// scale): each area is a simple polygon in a 400 × 480 box, north at the top,
// the coast (Bay of Bengal) on the right. Areas only — never a person's location.

export interface SurveillanceArea {
  id: string;
  /** Matches Patient.area (case-insensitive). */
  name: string;
  city: string;
  /** Polygon corners in map units. */
  points: [number, number][];
}

export const MAP_VIEWBOX = { width: 400, height: 480 };

export const CHENNAI_AREAS: SurveillanceArea[] = [
  { id: "perambur", name: "Perambur", city: "Chennai", points: [[175, 40], [290, 30], [305, 125], [250, 140], [175, 120]] },
  { id: "anna_nagar", name: "Anna Nagar", city: "Chennai", points: [[60, 115], [175, 120], [180, 205], [70, 215]] },
  { id: "t_nagar", name: "T. Nagar", city: "Chennai", points: [[175, 120], [250, 140], [260, 215], [250, 260], [185, 255], [180, 205]] },
  { id: "mylapore", name: "Mylapore", city: "Chennai", points: [[250, 140], [305, 125], [345, 135], [350, 240], [275, 250], [250, 260], [260, 215]] },
  { id: "adyar", name: "Adyar", city: "Chennai", points: [[250, 260], [275, 250], [350, 240], [355, 330], [270, 335]] },
  { id: "velachery", name: "Velachery", city: "Chennai", points: [[185, 255], [250, 260], [270, 335], [255, 370], [175, 360]] },
  { id: "tambaram", name: "Tambaram", city: "Chennai", points: [[50, 340], [175, 360], [240, 450], [70, 455]] },
  { id: "sholinganallur", name: "Sholinganallur", city: "Chennai", points: [[255, 370], [270, 335], [355, 330], [370, 445], [260, 450]] },
];

export function areaById(id: string): SurveillanceArea | undefined {
  return CHENNAI_AREAS.find((a) => a.id === id);
}

/** The area a patient lives in, by name (case-insensitive), or undefined. */
export function areaByName(name: string | undefined): SurveillanceArea | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return CHENNAI_AREAS.find((a) => a.name.toLowerCase() === n);
}

export function polygonPath(points: [number, number][]): string {
  return `M${points.map(([x, y]) => `${x},${y}`).join("L")}Z`;
}

/** Label position: the mean of the corners. */
export function labelPoint(points: [number, number][]): [number, number] {
  const x = points.reduce((a, p) => a + p[0], 0) / points.length;
  const y = points.reduce((a, p) => a + p[1], 0) / points.length;
  return [Math.round(x), Math.round(y)];
}

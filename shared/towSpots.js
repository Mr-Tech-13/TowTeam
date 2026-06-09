// Add or remove tow spots here.
// numberRequired spots accept codes like NL614 and flag plain NL as Needs Review.
// exact spots accept the code as-is, such as 30A or 32A.
export const TOW_SPOTS = [
  { code: "NL", name: "North Lot", aliases: ["North Lot"], numberRequired: true },
  { code: "BB", name: "Bird Bath", aliases: ["Bird Bath"], numberRequired: true },
  { code: "WR", name: "West Ramp", aliases: ["West Ramp"], numberRequired: true },
  { code: "30A", name: "30A", aliases: [], numberRequired: false, quickFilter: true },
  { code: "32A", name: "32A", aliases: [], numberRequired: false, quickFilter: true }
];

export const QUICK_FILTER_TOW_SPOTS = TOW_SPOTS.filter((spot) => spot.quickFilter).map((spot) => spot.code);

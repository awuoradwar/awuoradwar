// The store's actual "5 Point 7 Action" weekly deep-clean rotation, as posted
// on their physical chart -- one FOH and one BOH deep-clean area per weekday.
// Content, not logic (same split as defaultInventoryItems.ts): swap this file
// if the store's chart changes, no code elsewhere needs to.

export interface RotationItem {
  weekday: number; // 0=Sun..6=Sat
  category: "FOH" | "BOH";
  area: string;
  title: string;
  description: string;
}

export const WEEKLY_CLEANING_ROTATION: RotationItem[] = [
  {
    weekday: 0,
    category: "FOH",
    area: "Lobby, Entrances & Doors",
    title: "Scrub dining room floor, Entrances, Doors",
    description: "Lobby floor/grout, including all metal part and ledges, windows and door frame, spider web, under drink station.",
  },
  {
    weekday: 0,
    category: "BOH",
    area: "Cook Range",
    title: "Deep clean cook range",
    description: "Hoods, lights, globes, ansul poles and tips, faucets, blancher, wok rings, under cooking range, pipes, drains.",
  },
  {
    weekday: 1,
    category: "FOH",
    area: "Serving Line & DT Area",
    title: "Serving line, DT area",
    description:
      "Serving line shelves, induction unit, heat lamps, condiment cart/shelf, rice warmer, drink station, ice chute, cabinet, DT window, walls, ironman sign, register, behind/under registers, order taker screen and cables, phones.",
  },
  {
    weekday: 1,
    category: "BOH",
    area: "Prep Cooler (Main) & Reach-in Freezer",
    title: "Prep cooler (MAIN), Reach-in freezer",
    description: "Deep clean and polish, gaskets, wheels, vent, cables, doors, hinges, cover panel, meat drawers and sliders.",
  },
  {
    weekday: 2,
    category: "FOH",
    area: "Restrooms",
    title: "Restrooms",
    description: "Restroom door frames, doors, tow kick, walls cleaned with wet towel, baseboards, vents, lights cleaned, underside of toilet and sink.",
  },
  {
    weekday: 2,
    category: "BOH",
    area: "Prep Cooler (Side), Rice Cabinet & Condiment Cart",
    title: "Prep cooler (SIDE), Rice cabinet, Condiment cart",
    description:
      "Deep clean and polish, gaskets, wheels, vent, cables, doors, hinges, cover panel, warmer water revisor, remove warmer metal parts, clean, replace, deep clean cook's condiment cart.",
  },
  {
    weekday: 3,
    category: "FOH",
    area: "Drive Thru Area, Dumpster & Parking Lot",
    title: "Drive Thru Area (Exterior), Dumpster area, Parking lot",
    description:
      "Canopy, metal part above the drive thru window, splatter on building, oil and tire marks, dumpster, sweep leaves and dirt, no clutter, scrub concrete, remove oil stains.",
  },
  {
    weekday: 3,
    category: "BOH",
    area: "Prep & Dishwashing Sink",
    title: "Prep & Dishwashing sink",
    description: "Clean top to bottom, under shelves, pipes, drains, rice bin, 3 compartment sink.",
  },
  {
    weekday: 4,
    category: "FOH",
    area: "Lobby Drink Station",
    title: "Lobby drink station",
    description: "Ice bin/chute, detail drink station, tea machine, under tea machine, cutlery holders cleaned, drink station drain, floor drain, cabinet doors and feet.",
  },
  {
    weekday: 4,
    category: "BOH",
    area: "BOH Floors, Walk-in Freezer & Cooler",
    title: "Buff floors / Walk-in freezer / cooler",
    description:
      "Grout, baseboards, all BOH floors, sweep & dry mop freezer floor, buff walk-in cooler floor, clean plastic curtains, gaskets, veggie display doors, doorframe, shelves wiped clean with rag.",
  },
  {
    weekday: 5,
    category: "FOH",
    area: "Manager Station, Vents, Chairs & Tables",
    title: "Manager station, Air vents/ducts, Chairs, Tables",
    description: "Remove clutter, organize manager station, polish, keyboard, mouse, monitor, lobby vents, airducts wipe clean with wet rag, lobby chairs, highchairs, tables, table legs.",
  },
  {
    weekday: 5,
    category: "BOH",
    area: "Walls, Storage, Mop Sink & Lockers",
    title: "Walls, Storage, Mop sink, Lockers",
    description: "Clean walls, back door, air curtain, organize shelves, clean and organize mop sink area, clean lockers (only personal items, no food or drink).",
  },
  {
    weekday: 6,
    category: "FOH",
    area: "Serving Table & DT Floors",
    title: "Buff serving table floors, DT floors, Drains",
    description: "Baseboards, legs, detail clean drains, grout, buff floor, under serving table, walls.",
  },
  {
    weekday: 6,
    category: "BOH",
    area: "Grill Station, Oil Filter & Fryers",
    title: "Detail Grill Station, Oil filter machine, Fryers",
    description: "Including table, bottom of grill, back wall and side, deep clean both fryers inside and outside & fryer doors, filter machine clean top to bottom.",
  },
];

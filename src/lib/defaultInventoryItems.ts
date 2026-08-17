import type { InventoryCategory } from "./services/inventoryService";

export interface DefaultInventoryItem {
  name: string;
  variant: string | null;
  sortOrder: number;
  category: InventoryCategory;
}

function sizes(name: string, category: InventoryCategory, sizeList: string[]): DefaultInventoryItem[] {
  return sizeList.map((variant, i) => ({ name, variant, sortOrder: i, category }));
}

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const BRACE_SIZES = ["S", "M", "L", "XL"];

/**
 * A store's first-time inventory starter list -- real uniform pieces (with
 * the actual sizes ordered), plus common restaurant smallwares/supplies. A
 * GM can add, edit, or remove anything from here once seeded; this only
 * ever fills a genuinely empty list (see ensureDefaultInventoryItems).
 */
export const DEFAULT_INVENTORY_ITEMS: DefaultInventoryItem[] = [
  // Uniforms
  ...sizes("T-Shirt", "UNIFORMS", SHIRT_SIZES),
  ...sizes("Back Brace", "UNIFORMS", BRACE_SIZES),
  { name: "Apron", variant: null, sortOrder: 0, category: "UNIFORMS" },
  { name: "Hat", variant: null, sortOrder: 0, category: "UNIFORMS" },
  { name: "Name Badge", variant: null, sortOrder: 0, category: "UNIFORMS" },

  // Tools / smallwares
  { name: "Measuring Cups", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Measuring Spoons", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Tongs", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Ladles", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Spatulas", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Whisks", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Portion Scoops", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Rice Paddle", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Wok Spatula", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Cutting Boards", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Chef Knives", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Kitchen Shears", variant: null, sortOrder: 0, category: "TOOLS" },
  { name: "Digital Thermometer", variant: null, sortOrder: 0, category: "TOOLS" },

  // Consumable supplies
  { name: "Disposable Gloves", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Hairnets", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "To-Go Containers", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Napkins", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Plastic Utensils", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Straws", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Aluminum Foil", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Plastic Wrap", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Trash Bags", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Sanitizer Wipes", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Squeeze Bottles", variant: null, sortOrder: 0, category: "SUPPLIES" },
  { name: "Chafing Fuel", variant: null, sortOrder: 0, category: "SUPPLIES" },

  // Larger/durable equipment
  { name: "Sheet Pans", variant: null, sortOrder: 0, category: "EQUIPMENT" },
  { name: "Hotel Pans", variant: null, sortOrder: 0, category: "EQUIPMENT" },
  { name: "Prep Containers (Cambros)", variant: null, sortOrder: 0, category: "EQUIPMENT" },
  { name: "Fire Extinguisher", variant: null, sortOrder: 0, category: "EQUIPMENT" },
  { name: "First Aid Kit", variant: null, sortOrder: 0, category: "EQUIPMENT" },
];

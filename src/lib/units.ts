// Units the ingredient parser understands.
// mass and volume units convert to grams and millilitres; those are the amounts
// the shopping list adds up and rounds to packs. Everything else is "other".

export type Dimension = 'mass' | 'volume' | 'other';

export interface UnitDef {
  id: string;
  dimension: Dimension;
  /** Grams or millilitres per unit, for mass and volume units. */
  factor: number;
  /** Singular and plural label, used when formatting amounts. */
  label: [string, string];
  aliases: string[];
}

const defs: UnitDef[] = [
  {
    id: 'g',
    dimension: 'mass',
    factor: 1,
    label: ['g', 'g'],
    aliases: ['g', 'gr', 'grs', 'gram', 'grams', 'gramme', 'grammes'],
  },
  {
    id: 'kg',
    dimension: 'mass',
    factor: 1000,
    label: ['kg', 'kg'],
    aliases: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  },
  {
    id: 'oz',
    dimension: 'mass',
    factor: 28.35,
    label: ['oz', 'oz'],
    aliases: ['oz', 'ounce', 'ounces'],
  },
  {
    id: 'lb',
    dimension: 'mass',
    factor: 453.6,
    label: ['lb', 'lb'],
    aliases: ['lb', 'lbs', 'pound', 'pounds'],
  },
  {
    id: 'ml',
    dimension: 'volume',
    factor: 1,
    label: ['ml', 'ml'],
    aliases: ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  },
  {
    id: 'cl',
    dimension: 'volume',
    factor: 10,
    label: ['cl', 'cl'],
    aliases: ['cl', 'centilitre', 'centilitres'],
  },
  {
    id: 'dl',
    dimension: 'volume',
    factor: 100,
    label: ['dl', 'dl'],
    aliases: ['dl', 'decilitre', 'decilitres'],
  },
  {
    id: 'l',
    dimension: 'volume',
    factor: 1000,
    label: ['l', 'l'],
    aliases: ['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters'],
  },
  {
    id: 'tsp',
    dimension: 'other',
    factor: 0,
    label: ['tsp', 'tsp'],
    aliases: ['tsp', 'tsps', 'teaspoon', 'teaspoons'],
  },
  {
    id: 'tbsp',
    dimension: 'other',
    factor: 0,
    label: ['tbsp', 'tbsp'],
    aliases: ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons'],
  },
  { id: 'cup', dimension: 'other', factor: 0, label: ['cup', 'cups'], aliases: ['cup', 'cups'] },
  {
    id: 'clove',
    dimension: 'other',
    factor: 0,
    label: ['clove', 'cloves'],
    aliases: ['clove', 'cloves'],
  },
  {
    id: 'pinch',
    dimension: 'other',
    factor: 0,
    label: ['pinch', 'pinches'],
    aliases: ['pinch', 'pinches'],
  },
  {
    id: 'slice',
    dimension: 'other',
    factor: 0,
    label: ['slice', 'slices'],
    aliases: ['slice', 'slices'],
  },
  {
    id: 'tin',
    dimension: 'other',
    factor: 0,
    label: ['tin', 'tins'],
    aliases: ['tin', 'tins', 'can', 'cans'],
  },
  {
    id: 'pack',
    dimension: 'other',
    factor: 0,
    label: ['pack', 'packs'],
    aliases: ['pack', 'packs', 'packet', 'packets'],
  },
  { id: 'jar', dimension: 'other', factor: 0, label: ['jar', 'jars'], aliases: ['jar', 'jars'] },
  {
    id: 'bunch',
    dimension: 'other',
    factor: 0,
    label: ['bunch', 'bunches'],
    aliases: ['bunch', 'bunches'],
  },
  {
    id: 'handful',
    dimension: 'other',
    factor: 0,
    label: ['handful', 'handfuls'],
    aliases: ['handful', 'handfuls'],
  },
  {
    id: 'sprig',
    dimension: 'other',
    factor: 0,
    label: ['sprig', 'sprigs'],
    aliases: ['sprig', 'sprigs'],
  },
  {
    id: 'stalk',
    dimension: 'other',
    factor: 0,
    label: ['stalk', 'stalks'],
    aliases: ['stalk', 'stalks'],
  },
  {
    id: 'rasher',
    dimension: 'other',
    factor: 0,
    label: ['rasher', 'rashers'],
    aliases: ['rasher', 'rashers'],
  },
  {
    id: 'fillet',
    dimension: 'other',
    factor: 0,
    label: ['fillet', 'fillets'],
    aliases: ['fillet', 'fillets'],
  },
  {
    id: 'piece',
    dimension: 'other',
    factor: 0,
    label: ['piece', 'pieces'],
    aliases: ['piece', 'pieces', 'pc', 'pcs'],
  },
  {
    id: 'knob',
    dimension: 'other',
    factor: 0,
    label: ['knob', 'knobs'],
    aliases: ['knob', 'knobs'],
  },
  {
    id: 'splash',
    dimension: 'other',
    factor: 0,
    label: ['splash', 'splashes'],
    aliases: ['splash', 'splashes'],
  },
  {
    id: 'dash',
    dimension: 'other',
    factor: 0,
    label: ['dash', 'dashes'],
    aliases: ['dash', 'dashes'],
  },
  {
    id: 'sheet',
    dimension: 'other',
    factor: 0,
    label: ['sheet', 'sheets'],
    aliases: ['sheet', 'sheets'],
  },
  { id: 'bag', dimension: 'other', factor: 0, label: ['bag', 'bags'], aliases: ['bag', 'bags'] },
  {
    id: 'sachet',
    dimension: 'other',
    factor: 0,
    label: ['sachet', 'sachets'],
    aliases: ['sachet', 'sachets'],
  },
  {
    id: 'head',
    dimension: 'other',
    factor: 0,
    label: ['head', 'heads'],
    aliases: ['head', 'heads'],
  },
  {
    id: 'bulb',
    dimension: 'other',
    factor: 0,
    label: ['bulb', 'bulbs'],
    aliases: ['bulb', 'bulbs'],
  },
  { id: 'tub', dimension: 'other', factor: 0, label: ['tub', 'tubs'], aliases: ['tub', 'tubs'] },
  {
    id: 'bottle',
    dimension: 'other',
    factor: 0,
    label: ['bottle', 'bottles'],
    aliases: ['bottle', 'bottles'],
  },
  {
    id: 'carton',
    dimension: 'other',
    factor: 0,
    label: ['carton', 'cartons'],
    aliases: ['carton', 'cartons'],
  },
];

const byAlias = new Map<string, UnitDef>();
const byId = new Map<string, UnitDef>();
for (const def of defs) {
  byId.set(def.id, def);
  for (const alias of def.aliases) byAlias.set(alias, def);
}

/** Finds a unit by any of its spellings, ignoring case and a trailing full stop. */
export function findUnit(word: string): UnitDef | undefined {
  return byAlias.get(word.toLowerCase().replace(/\.$/, ''));
}

export function getUnit(id: string): UnitDef | undefined {
  return byId.get(id);
}

/** Units that can trail the name, as in "3 garlic cloves". */
export const trailingUnits = new Set(['clove', 'sprig', 'stalk']);

/** Words that describe a container rather than the food, as in "2 x 400 g tins chopped tomatoes". */
export const containerWords = new Set([
  'tin',
  'tins',
  'can',
  'cans',
  'jar',
  'jars',
  'pack',
  'packs',
  'packet',
  'packets',
  'bag',
  'bags',
  'bottle',
  'bottles',
  'carton',
  'cartons',
  'box',
  'boxes',
  'tub',
  'tubs',
]);

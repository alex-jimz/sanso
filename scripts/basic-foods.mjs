// Builds src/lib/basicFoods.json, the built-in table of basic foods, from
// USDA FoodData Central's SR Legacy data (public domain).
//
//   curl -LO https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   unzip FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   node scripts/basic-foods.mjs FoodData_Central_sr_legacy_food_csv_2018-04
//
// Each food below names its USDA entry exactly, and its weights name the USDA
// portion to read, as in "medium" for one medium onion. A food or portion that
// isn't found stops the script, so every number comes from the data. Piece
// weights are left out where USDA's American sizes are far from Irish ones,
// such as a 272 g chicken breast or a 396 g salmon fillet; the product form
// then asks for the user's own.
//
// Carbs are USDA's "carbohydrate, by difference" minus fibre, to match EU
// labels, which leave fibre out.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/basic-foods.mjs <SR Legacy CSV folder>');
  process.exit(1);
}

// name: shown in Sanso. aliases: other names, as Irish shops and recipes write them.
// Single words that end other foods' names (pepper, oil, mince) stay out, so
// Black pepper doesn't match Red pepper.
// weights: Sanso weight key -> pattern matched against the start of USDA's portion text.
const foods = [
  // Vegetables
  {
    name: 'Onion',
    aliases: ['brown onion', 'yellow onion', 'white onion', 'red onion'],
    usda: 'Onions, raw',
    weights: { piece: 'medium', tbsp: 'tbsp' },
  },
  {
    name: 'Spring onion',
    aliases: ['scallion', 'green onion', 'salad onion'],
    usda: 'Onions, spring or scallions (includes tops and bulb), raw',
    weights: { piece: 'medium' },
  },
  { name: 'Shallot', usda: 'Shallots, raw', weights: { tbsp: 'tbsp' } },
  { name: 'Garlic', usda: 'Garlic, raw', weights: { clove: 'clove', tsp: 'tsp' } },
  { name: 'Leek', usda: 'Leeks, (bulb and lower leaf-portion), raw', weights: { piece: 'leek' } },
  { name: 'Carrot', usda: 'Carrots, raw', weights: { piece: 'medium' } },
  {
    name: 'Potato',
    aliases: ['rooster potato', 'baby potato', 'new potato', 'roosters'],
    usda: 'Potatoes, flesh and skin, raw',
    weights: { piece: 'Potato medium' },
  },
  {
    name: 'Sweet potato',
    usda: "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
    weights: { piece: 'sweetpotato' },
  },
  { name: 'Parsnip', usda: 'Parsnips, raw', weights: { piece: '' } },
  { name: 'Turnip', usda: 'Turnips, raw', weights: { piece: 'medium' } },
  { name: 'Swede', aliases: ['rutabaga'], usda: 'Rutabagas, raw', weights: { piece: 'large' } },
  { name: 'Beetroot', aliases: ['beet'], usda: 'Beets, raw', weights: { piece: 'beet' } },
  {
    name: 'Celery',
    usda: 'Celery, raw',
    weights: { stalk: 'stalk, medium', piece: 'stalk, medium' },
  },
  { name: 'Celeriac', usda: 'Celeriac, raw', weights: {} },
  { name: 'Fennel', usda: 'Fennel, bulb, raw', weights: { piece: 'bulb' } },
  { name: 'Cucumber', usda: 'Cucumber, with peel, raw', weights: { piece: 'cucumber' } },
  {
    name: 'Tomato',
    aliases: ['vine tomato', 'salad tomato'],
    usda: 'Tomatoes, red, ripe, raw, year round average',
    weights: { piece: 'medium' },
  },
  {
    name: 'Cherry tomato',
    usda: 'Tomatoes, red, ripe, raw, year round average',
    weights: { piece: 'cherry' },
  },
  {
    name: 'Red pepper',
    aliases: ['red bell pepper'],
    usda: 'Peppers, sweet, red, raw',
    weights: { piece: 'medium' },
  },
  {
    name: 'Green pepper',
    aliases: ['green bell pepper'],
    usda: 'Peppers, sweet, green, raw',
    weights: { piece: 'medium' },
  },
  {
    name: 'Yellow pepper',
    aliases: ['yellow bell pepper'],
    usda: 'Peppers, sweet, yellow, raw',
    weights: { piece: 'pepper, large' },
  },
  {
    name: 'Chilli',
    aliases: ['red chilli', 'chili', 'fresh chilli'],
    usda: 'Peppers, hot chili, red, raw',
    weights: { piece: 'pepper' },
  },
  {
    name: 'Broccoli',
    aliases: ['tenderstem broccoli'],
    usda: 'Broccoli, raw',
    weights: { piece: 'bunch' },
  },
  { name: 'Cauliflower', usda: 'Cauliflower, raw', weights: { piece: 'head medium' } },
  {
    name: 'Cabbage',
    aliases: ['white cabbage', 'savoy cabbage', 'green cabbage'],
    usda: 'Cabbage, raw',
    weights: { piece: 'head, medium' },
  },
  { name: 'Red cabbage', usda: 'Cabbage, red, raw', weights: { piece: 'head, medium' } },
  { name: 'Brussels sprout', usda: 'Brussels sprouts, raw', weights: { piece: 'sprout' } },
  {
    name: 'Pak choi',
    aliases: ['bok choy'],
    usda: 'Cabbage, chinese (pak-choi), raw',
    weights: {},
  },
  { name: 'Kale', usda: 'Kale, raw', weights: {} },
  { name: 'Spinach', aliases: ['baby spinach'], usda: 'Spinach, raw', weights: {} },
  { name: 'Rocket', aliases: ['arugula'], usda: 'Arugula, raw', weights: {} },
  {
    name: 'Iceberg lettuce',
    aliases: ['lettuce'],
    usda: 'Lettuce, iceberg (includes crisphead types), raw',
    weights: { piece: 'head, medium' },
  },
  {
    name: 'Romaine lettuce',
    aliases: ['cos lettuce', 'little gem'],
    usda: 'Lettuce, cos or romaine, raw',
    weights: { piece: 'head' },
  },
  {
    name: 'Courgette',
    aliases: ['zucchini'],
    usda: 'Squash, summer, zucchini, includes skin, raw',
    weights: { piece: 'medium' },
  },
  {
    name: 'Aubergine',
    aliases: ['eggplant'],
    usda: 'Eggplant, raw',
    weights: { piece: 'eggplant' },
  },
  { name: 'Butternut squash', usda: 'Squash, winter, butternut, raw', weights: {} },
  { name: 'Pumpkin', usda: 'Pumpkin, raw', weights: {} },
  {
    name: 'Mushroom',
    aliases: ['button mushroom', 'white mushroom', 'closed cup mushroom'],
    usda: 'Mushrooms, white, raw',
    weights: { piece: 'medium' },
  },
  {
    name: 'Chestnut mushroom',
    aliases: ['brown mushroom', 'crimini mushroom'],
    usda: 'Mushrooms, brown, italian, or crimini, raw',
    weights: { piece: 'piece whole' },
  },
  {
    name: 'Green beans',
    aliases: ['fine beans', 'french beans'],
    usda: 'Beans, snap, green, raw',
    weights: {},
  },
  { name: 'Peas', aliases: ['garden peas', 'frozen peas'], usda: 'Peas, green, raw', weights: {} },
  {
    name: 'Sweetcorn',
    aliases: ['corn', 'corn on the cob'],
    usda: 'Corn, sweet, yellow, raw',
    weights: { piece: 'ear, medium' },
  },
  { name: 'Asparagus', usda: 'Asparagus, raw', weights: { piece: 'spear, medium' } },
  { name: 'Radish', usda: 'Radishes, raw', weights: { piece: 'medium' } },
  {
    name: 'Ginger',
    aliases: ['fresh ginger', 'root ginger'],
    usda: 'Ginger root, raw',
    weights: { tsp: 'tsp' },
  },

  // Herbs
  {
    name: 'Parsley',
    aliases: ['flat leaf parsley', 'curly parsley'],
    usda: 'Parsley, fresh',
    weights: { tbsp: 'tbsp', sprig: 'sprigs' },
  },
  {
    name: 'Coriander',
    aliases: ['fresh coriander', 'cilantro'],
    usda: 'Coriander (cilantro) leaves, raw',
    weights: { sprig: 'sprigs' },
  },
  { name: 'Basil', aliases: ['fresh basil'], usda: 'Basil, fresh', weights: { tbsp: 'tbsp' } },
  { name: 'Mint', aliases: ['fresh mint'], usda: 'Spearmint, fresh', weights: { tbsp: 'tbsp' } },

  // Fruit
  { name: 'Banana', usda: 'Bananas, raw', weights: { piece: 'medium' } },
  {
    name: 'Apple',
    usda: "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
    weights: { piece: 'medium' },
  },
  { name: 'Pear', usda: 'Pears, raw', weights: { piece: 'medium' } },
  { name: 'Orange', usda: 'Oranges, raw, all commercial varieties', weights: { piece: 'fruit' } },
  {
    name: 'Mandarin',
    aliases: ['easy peeler', 'clementine', 'satsuma', 'tangerine'],
    usda: 'Tangerines, (mandarin oranges), raw',
    weights: { piece: 'medium' },
  },
  { name: 'Lemon', usda: 'Lemons, raw, without peel', weights: { piece: 'fruit' } },
  { name: 'Lime', usda: 'Limes, raw', weights: { piece: 'fruit' } },
  {
    name: 'Grapes',
    aliases: ['grape', 'seedless grapes'],
    usda: 'Grapes, red or green (European type, such as Thompson seedless), raw',
    weights: { piece: 'grape' },
  },
  {
    name: 'Strawberries',
    aliases: ['strawberry'],
    usda: 'Strawberries, raw',
    weights: { piece: 'medium' },
  },
  { name: 'Blueberries', aliases: ['blueberry'], usda: 'Blueberries, raw', weights: {} },
  { name: 'Raspberries', aliases: ['raspberry'], usda: 'Raspberries, raw', weights: {} },
  {
    name: 'Kiwi',
    aliases: ['kiwi fruit', 'kiwifruit'],
    usda: 'Kiwifruit, green, raw',
    weights: { piece: 'fruit' },
  },
  { name: 'Mango', usda: 'Mangos, raw', weights: { piece: 'fruit' } },
  { name: 'Pineapple', usda: 'Pineapple, raw, all varieties', weights: { piece: 'fruit' } },
  { name: 'Peach', usda: 'Peaches, yellow, raw', weights: { piece: 'medium' } },
  { name: 'Nectarine', usda: 'Nectarines, raw', weights: { piece: 'medium' } },
  { name: 'Plum', usda: 'Plums, raw', weights: { piece: 'fruit' } },
  {
    name: 'Avocado',
    usda: 'Avocados, raw, all commercial varieties',
    weights: { piece: 'avocado' },
  },
  { name: 'Melon', aliases: ['cantaloupe'], usda: 'Melons, cantaloupe, raw', weights: {} },
  { name: 'Watermelon', usda: 'Watermelon, raw', weights: {} },

  // Eggs, meat and fish, raw
  {
    name: 'Egg',
    aliases: ['free range egg', 'large egg'],
    usda: 'Egg, whole, raw, fresh',
    weights: { piece: 'large' },
  },
  {
    name: 'Whole chicken',
    aliases: ['chicken'],
    usda: 'Chicken, broilers or fryers, meat and skin, raw',
    weights: {},
  },
  {
    name: 'Chicken breast',
    aliases: ['chicken fillet', 'chicken breast fillet'],
    usda: 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw',
    weights: {},
  },
  {
    name: 'Chicken thighs',
    aliases: ['chicken thigh', 'chicken thigh fillet', 'boneless chicken thigh'],
    usda: 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw',
    weights: { piece: 'thigh' },
  },
  {
    name: 'Chicken drumsticks',
    aliases: ['chicken drumstick', 'drumstick'],
    usda: 'Chicken, broilers or fryers, drumstick, meat and skin, raw',
    weights: { piece: 'drumstick' },
  },
  {
    name: 'Chicken wings',
    aliases: ['chicken wing', 'wing'],
    usda: 'Chicken, broilers or fryers, wing, meat and skin, raw',
    weights: { piece: 'piece' },
  },
  {
    name: 'Beef mince 5% fat',
    aliases: ['lean beef mince', 'extra lean beef mince', 'ground beef 5% fat'],
    usda: 'Beef, ground, 95% lean meat / 5% fat, raw',
    weights: {},
  },
  {
    name: 'Beef mince 10% fat',
    aliases: ['beef mince', 'minced beef', 'ground beef', 'ground beef 10% fat'],
    usda: 'Beef, ground, 90% lean meat / 10% fat, raw',
    weights: {},
  },
  {
    name: 'Beef mince 15% fat',
    aliases: ['ground beef 15% fat'],
    usda: "Beef, ground, 85% lean meat / 15% fat, raw (Includes foods for USDA's Food Distribution Program)",
    weights: {},
  },
  {
    name: 'Beef mince 20% fat',
    aliases: ['ground beef 20% fat'],
    usda: 'Beef, ground, 80% lean meat / 20% fat, raw',
    weights: {},
  },
  {
    name: 'Pork mince',
    aliases: ['minced pork', 'ground pork'],
    usda: 'Pork, fresh, ground, raw',
    weights: {},
  },
  {
    name: 'Lamb mince',
    aliases: ['minced lamb', 'ground lamb'],
    usda: 'Lamb, ground, raw',
    weights: {},
  },
  { name: 'Pork belly', usda: 'Pork, fresh, belly, raw', weights: {} },
  {
    name: 'Salmon',
    aliases: ['salmon fillet'],
    usda: 'Fish, salmon, Atlantic, farmed, raw',
    weights: {},
  },
  { name: 'Cod', aliases: ['cod fillet'], usda: 'Fish, cod, Atlantic, raw', weights: {} },
  { name: 'Haddock', aliases: ['haddock fillet'], usda: 'Fish, haddock, raw', weights: {} },
  {
    name: 'Mackerel',
    aliases: ['mackerel fillet'],
    usda: 'Fish, mackerel, Atlantic, raw',
    weights: { fillet: 'fillet', piece: 'fillet' },
  },
  {
    name: 'Prawns',
    aliases: ['prawn', 'shrimp', 'king prawn'],
    usda: 'Crustaceans, shrimp, raw',
    weights: {},
  },

  // Staples weighed by the spoon or cup
  {
    name: 'Olive oil',
    aliases: ['extra virgin olive oil'],
    usda: 'Oil, olive, salad or cooking',
    weights: { tbsp: 'tablespoon', tsp: 'tsp' },
  },
  {
    name: 'Sunflower oil',
    aliases: ['vegetable oil', 'rapeseed oil'],
    usda: 'Oil, sunflower, linoleic, (approx. 65%)',
    weights: { tbsp: 'tbsp', tsp: 'tsp' },
  },
  { name: 'Butter', usda: 'Butter, salted', weights: { tbsp: 'tbsp' } },
  {
    name: 'Sugar',
    aliases: ['caster sugar', 'white sugar', 'granulated sugar'],
    usda: 'Sugars, granulated',
    weights: { tsp: 'tsp', cup: 'cup' },
  },
  { name: 'Honey', usda: 'Honey', weights: { tbsp: 'tbsp' } },
  {
    name: 'Plain flour',
    aliases: ['flour', 'all purpose flour'],
    usda: 'Wheat flour, white, all-purpose, enriched, bleached',
    weights: { cup: 'cup' },
  },
  {
    name: 'Rice',
    aliases: ['white rice', 'basmati rice', 'long grain rice'],
    usda: 'Rice, white, long-grain, regular, raw, enriched',
    weights: { cup: 'cup' },
  },
  {
    name: 'Brown rice',
    usda: "Rice, brown, long-grain, raw (Includes foods for USDA's Food Distribution Program)",
    weights: { cup: 'cup' },
  },
  {
    name: 'Pasta',
    aliases: ['spaghetti', 'penne', 'fusilli', 'dry pasta'],
    usda: 'Pasta, dry, enriched',
    weights: {},
  },
  {
    name: 'Oats',
    aliases: ['porridge oats', 'rolled oats'],
    usda: 'Cereals, oats, regular and quick, not fortified, dry',
    weights: { cup: 'cup' },
  },
  {
    name: 'Lentils',
    aliases: ['red lentils', 'green lentils', 'brown lentils', 'lentil'],
    usda: 'Lentils, raw',
    weights: { cup: 'cup' },
  },
];

// A small CSV reader for USDA's files: every field is quoted, "" is a quote.
function* rows(text) {
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      yield row;
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) yield [...row, field];
}

async function table(file) {
  const [header, ...body] = [...rows(await readFile(join(dir, file), 'utf8'))];
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const nutrientIds = { kcal: '1008', protein: '1003', fat: '1004', carbs: '1005', fibre: '1079' };

const byDescription = new Map((await table('food.csv')).map((f) => [f.description, f.fdc_id]));
const wanted = new Set(foods.map((f) => byDescription.get(f.usda)).filter(Boolean));
const nutrients = new Map();
for (const n of await table('food_nutrient.csv')) {
  if (!wanted.has(n.fdc_id)) continue;
  const values = nutrients.get(n.fdc_id) ?? {};
  for (const [key, id] of Object.entries(nutrientIds))
    if (n.nutrient_id === id) values[key] = Number(n.amount);
  nutrients.set(n.fdc_id, values);
}
const portions = new Map();
for (const p of await table('food_portion.csv')) {
  if (!wanted.has(p.fdc_id)) continue;
  portions.set(p.fdc_id, [...(portions.get(p.fdc_id) ?? []), p]);
}

const round1 = (n) => Math.round(n * 10) / 10;
const problems = [];
const out = foods.map((food) => {
  const fdcId = byDescription.get(food.usda);
  if (!fdcId) {
    problems.push(`${food.name}: no USDA food "${food.usda}"`);
    return undefined;
  }
  const n = nutrients.get(fdcId) ?? {};
  for (const key of ['kcal', 'protein', 'fat', 'carbs'])
    if (n[key] === undefined) problems.push(`${food.name}: no ${key}`);
  const weights = {};
  for (const [key, pattern] of Object.entries(food.weights ?? {})) {
    const list = portions.get(fdcId) ?? [];
    const portion = list.find((p) => p.modifier.toLowerCase().startsWith(pattern.toLowerCase()));
    if (!portion) {
      problems.push(
        `${food.name}: no "${pattern}" portion; has ${list.map((p) => `"${p.modifier}"`).join(', ')}`,
      );
      continue;
    }
    weights[key] = round1(Number(portion.gram_weight) / Number(portion.amount || 1));
  }
  return {
    name: food.name,
    aliases: food.aliases ?? [],
    usda: food.usda,
    fdcId: Number(fdcId),
    kcal: Math.round(n.kcal),
    protein: round1(n.protein),
    fat: round1(n.fat),
    carbs: round1(Math.max(0, n.carbs - (n.fibre ?? 0))),
    ...(Object.keys(weights).length ? { weights } : {}),
  };
});

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const file = 'src/lib/basicFoods.json';
await writeFile(
  file,
  JSON.stringify(
    {
      source: 'USDA FoodData Central, SR Legacy (April 2018), public domain',
      foods: out,
    },
    null,
    1,
  ) + '\n',
);
console.log(`${out.length} foods written to ${file}`);

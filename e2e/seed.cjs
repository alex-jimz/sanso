// Runs in the page: fills the app's IndexedDB with realistic sample data.
// Dates are relative to the browser's today.
async function seed() {
  const iso = (offset) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const now = new Date().toISOString();
  const recipe = (
    id,
    title,
    tags,
    portions,
    prep,
    total,
    score,
    ingredients,
    steps,
    notes = '',
  ) => ({
    id,
    title,
    tags,
    portions,
    prepMinutes: prep,
    totalMinutes: total,
    score,
    ingredients,
    steps,
    notes,
    createdAt: now,
    updatedAt: now,
  });
  const recipes = [
    recipe(
      'tikka',
      'Chicken tikka masala',
      ['Meal'],
      2,
      20,
      50,
      9,
      [
        '400 g chicken breast',
        '150 g natural yoghurt',
        '2 tsp garam masala',
        '3 garlic cloves',
        '1 onion, finely chopped',
        '400 g chopped tomatoes',
        '100 ml cream',
        '200 g basmati rice',
        'fresh coriander, to serve',
      ],
      [
        'Mix the yoghurt, garlic and half the garam masala, and coat the chicken.',
        'Grill the chicken until charred at the edges.',
        'Soften the onion, add the rest of the spices and the tomatoes, and simmer for 10 minutes.',
        'Stir in the cream and the chicken. Serve with rice.',
      ],
      'Marinate overnight if you can. Freezes well.',
    ),
    recipe(
      'carbonara',
      'Spaghetti carbonara',
      ['Meal'],
      1,
      10,
      20,
      8,
      ['120 g spaghetti', '70 g pancetta', '2 eggs', '30 g parmesan', 'black pepper'],
      [
        'Cook the pasta.',
        'Fry the pancetta.',
        'Mix eggs and cheese, then toss everything off the heat.',
      ],
    ),
    recipe(
      'oats',
      'Overnight oats',
      ['Breakfast/snack'],
      1,
      5,
      480,
      7,
      ['50 g oats', '120 ml milk', '1 tbsp honey', 'a handful of berries'],
      ['Mix everything in a jar and leave in the fridge overnight.'],
    ),
    recipe(
      'salmon',
      'Salmon with roast veg',
      ['Meal'],
      2,
      15,
      40,
      8,
      [
        '2 salmon fillets',
        '500 g baby potatoes',
        '1 red pepper',
        '1 courgette',
        '2 tbsp olive oil',
        '1 lemon',
      ],
      ['Roast the potatoes for 20 minutes.', 'Add the veg and salmon and roast for 15 more.'],
    ),
    recipe(
      'banana',
      'Banana bread',
      ['Baking', 'Dessert'],
      8,
      15,
      75,
      9,
      ['3 ripe bananas', '250 g self-raising flour', '100 g butter', '100 g brown sugar', '2 eggs'],
      ['Mash the bananas.', 'Mix everything.', 'Bake at 180 °C for an hour.'],
    ),
    recipe(
      'chilli',
      'Beef chilli',
      ['Meal'],
      4,
      15,
      90,
      8,
      [
        '500 g beef mince',
        '1 onion',
        '2 garlic cloves',
        '1 tin kidney beans',
        '400 g chopped tomatoes',
        '1 tbsp chilli powder',
        '200 g basmati rice',
      ],
      ['Brown the mince with the onion and garlic.', 'Add everything else and simmer for an hour.'],
    ),
    recipe(
      'mousse',
      'Chocolate mousse',
      ['Dessert'],
      4,
      20,
      260,
      undefined,
      ['200 g dark chocolate', '4 eggs', '1 tbsp sugar'],
      ['Melt, fold, chill.'],
    ),
  ];
  const product = (id, name, sectionId, packSize, packUnit, price, extra = {}) => ({
    id,
    name,
    sectionId,
    shop: 'aldi',
    packSize,
    packUnit,
    price,
    listMode: 'auto',
    aliases: [],
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
  const products = [
    product('p-chicken', 'Irish chicken fillets', 'meat', 650, 'g', 6.49, {
      aliases: ['chicken breast'],
    }),
    product('p-rice', 'Basmati rice', 'grains', 1000, 'g', 1.89),
    product('p-tomatoes', 'Chopped tomatoes', 'tins', 400, 'g', 0.55),
    product('p-yoghurt', 'Natural yoghurt', 'dairy', 500, 'g', 1.15),
    product('p-spaghetti', 'Spaghetti', 'grains', 500, 'g', 0.85),
    product('p-mince', 'Irish beef mince', 'meat', 500, 'g', 4.29, {
      aliases: ['beef mince'],
      offer: { price: 3.49, until: iso(3) },
    }),
    product('p-oil', 'Olive oil', 'sauces', 500, 'ml', 5.49, { listMode: 'check' }),
    product('p-salt', 'Sea salt', 'sauces', undefined, undefined, undefined, {
      aliases: ['salt'],
      listMode: 'skip',
    }),
    product('p-cream', 'Cream', 'dairy', 250, 'ml', 1.29),
    product('p-potatoes', 'Baby potatoes', 'veg', 1000, 'g', 1.49),
  ];
  const meal = (offset, slot, recipeId, state, portions = 1, note) => ({
    id: `${iso(offset)}:${slot}`,
    date: iso(offset),
    slot,
    recipeId,
    state,
    portions,
    note,
  });
  const meals = [
    meal(-4, 'dinner', 'chilli', 'cooked'),
    meal(-3, 'lunch', 'chilli', 'cooked', 1, 'Leftovers'),
    meal(-2, 'dinner', 'carbonara', 'cooked'),
    meal(0, 'dinner', 'tikka', 'toShop'),
    meal(1, 'lunch', 'tikka', 'toShop', 1, 'Leftovers'),
    meal(1, 'dinner', 'carbonara', 'toShop'),
    meal(2, 'lunch', undefined, 'noCooking', 1, 'Brunch with friends'),
    meal(2, 'dinner', 'salmon', 'toShop', 2),
    meal(4, 'dinner', 'chilli', 'toShop'),
  ];

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('sanso', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['recipes', 'products', 'meals'], 'readwrite');
    for (const r of recipes) tx.objectStore('recipes').put(r);
    for (const p of products) tx.objectStore('products').put(p);
    for (const m of meals) tx.objectStore('meals').put(m);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Runs in the page: draws a food-like test photo and returns it as base64 PNG. */
async function testPhoto() {
  const canvas = new OffscreenCanvas(1600, 1200);
  const c = canvas.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 1600, 1200);
  bg.addColorStop(0, '#6b4a2b');
  bg.addColorStop(1, '#2e2117');
  c.fillStyle = bg;
  c.fillRect(0, 0, 1600, 1200);
  c.fillStyle = '#efe6d8';
  c.beginPath();
  c.arc(800, 600, 470, 0, Math.PI * 2);
  c.fill();
  const sauce = c.createRadialGradient(780, 560, 40, 800, 600, 400);
  sauce.addColorStop(0, '#e2913b');
  sauce.addColorStop(1, '#b4521f');
  c.fillStyle = sauce;
  c.beginPath();
  c.arc(800, 600, 390, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 26; i++) {
    c.fillStyle = i % 3 ? '#f3d2a2' : '#5c8a3a';
    c.beginPath();
    c.ellipse(
      560 + ((i * 97) % 480),
      380 + ((i * 61) % 440),
      i % 3 ? 46 : 18,
      i % 3 ? 32 : 10,
      i,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

module.exports = { seed, testPhoto };

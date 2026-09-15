// The recipe-writing house style, shared by generation, recipe edits and the
// chat agent. This is the heart of the product: every recipe the app shows
// must read like something a tired couple will actually cook on a Tuesday.

const HOUSE_STYLE = `
# Who you cook for
Thomas and Lote, a couple in Amsterdam cooking dinner for two after work. They want food that is
tasty and filling with the least possible effort. Convenience beats culinary quality, every time.
They shop at a regular city-centre Albert Heijn (AH Haarlemmerplein), not an AH XL.
Their own preference texts (in the context below) are authoritative: where they differ from the
defaults here, follow the preferences, and always apply "Learned from our feedback".

# Recipe rules (hard constraints)
1. PANS: at most two. The standard setup is one pot for the carb (rice, pasta, noodles, tortellini,
   gnocchi) and one wok or frying pan for protein + veg + sauce. One-pan dishes are great.
   No oven, no air fryer, no grill, no blender, no third pan, no separate bowl for marinating or
   mixing sauces (stir sauces straight into the wok).
2. CHOPPING: almost none. Vegetables come from AH pre-cut bags: e.g. wokgroente / roerbakgroente
   (Oosterse, Thaise, Chinese mix), Italiaanse groentemix, Mexicaanse groentemix, nasi/bami groente,
   gesneden prei, spinazie, sugar snaps, sperziebonen, broccoli roosjes, taugé, cherry tomatoes,
   frozen peas/edamame, sweetcorn. At most two very easy things to cut (a bell pepper, a courgette,
   spring onions, a chili). Garlic/ginger from a tube or jar, never peel-and-mince.
3. TIME: 30 minutes or less, including boiling the carb.
4. SHORTCUTS WELCOME: store-bought curry pastes (AH, Go-Tan, Patak's, Thai Kitchen), jarred
   pasta/stir-fry sauces, ketjap, sambal, gochujang, stock cubes, coconut milk, kookroom,
   pre-cut meat (kipreepjes, kipdijreepjes, shoarmareepjes), pre-grated cheese, ready-made gnocchi / fresh pasta / tortellini (AH verse tortellini),
   wok noodles (mie/udon), frozen veg straight into the wok.
5. NO SEASONING FLUFF: never list salt, pepper, cooking oil, butter for frying or water as
   ingredients, and never write "season to taste", "heat the oil", "salt the water",
   "pat dry", "garnish if desired", "enjoy". Assume there is oil in the pan and salt in the pasta
   water. DO name the specific flavour-makers that matter: a paste, sauce, spice mix
   (e.g. AH kruidenmix), sambal, chili flakes, a fresh herb.
6. SPICY: they love heat. Unless the dish would be odd with it, build in real spice
   (sambal oelek, fresh red chili, chili flakes, sriracha, gochujang, hot curry paste,
   jalapeños) and say how much.
7. INGREDIENTS: only things reliably stocked at a regular Dutch Albert Heijn. Write the English
   name with the Dutch product name in parentheses when it helps to find it, e.g.
   "chicken thigh fillet (kipdijfilet)", "Thai red curry paste (AH / Go-Tan)",
   "wok vegetable mix (AH wokgroente)". Do not invent brands or niche products; if unsure it
   exists at a normal AH, pick the common alternative.
   Amounts are supermarket packs for 2 hungry people: "1 pack (300 g)", "1 bag (400 g)",
   "1 can (400 ml)", "1/2 jar"; 200-250 g dry rice or pasta for two. Put each ingredient in the
   right aisle. Keep the list short (typically 5-9 items).
8. STEPS: 3-6 steps, each one short imperative line (max ~20 words). Start with the carb pot if
   there is one. Call the pans "pot" and "wok"/"pan" consistently. Give heat or timing only when
   useful ("Simmer 5 min"). No intro, no plating, no serving suggestions beyond the carb.
9. TITLE & COPY: short appetising title that says what it is ("Thai green chicken curry",
   "Spicy beef red sauce with penne"). One fitting emoji. Description: one plain sentence on what
   it is and why it fits them. cuisine: short label. tags: 2-5 lowercase tags (protein, format,
   "spicy", "vegetarian", ...). pans and timeMinutes must be honest. servings is always 2.
`.trim();

// A compact example so the model can see the target density and tone.
const EXAMPLE_RECIPE = {
  title: 'Thai red chicken curry',
  emoji: '🍛',
  description: 'Your go-to curry format: chicken, a bag of wok veg and red curry paste over rice.',
  cuisine: 'Thai',
  tags: ['curry', 'chicken', 'spicy'],
  timeMinutes: 25,
  servings: 2,
  pans: 2,
  ingredients: [
    { name: 'pandan rice (pandanrijst)', amount: '250 g', aisle: 'pasta-rice-noodles', note: null },
    { name: 'chicken thigh strips (kipdijreepjes)', amount: '1 pack (300 g)', aisle: 'meat-fish', note: null },
    { name: 'wok vegetable mix (AH wokgroente)', amount: '1 bag (400 g)', aisle: 'produce', note: null },
    { name: 'Thai red curry paste (AH / Go-Tan)', amount: '3 tbsp', aisle: 'sauces-spices', note: null },
    { name: 'coconut milk (kokosmelk)', amount: '1 can (400 ml)', aisle: 'canned-jars', note: null },
    { name: 'sambal oelek', amount: '1 tsp', aisle: 'sauces-spices', note: 'more if you dare' },
  ],
  steps: [
    'Cook the rice in the pot.',
    'Brown the chicken in the wok on high heat, 5 min.',
    'Add the veg mix and stir-fry 4 min.',
    'Stir in curry paste and sambal for 1 min, then the coconut milk.',
    'Simmer 5 min and serve over the rice.',
  ],
};

module.exports = { HOUSE_STYLE, EXAMPLE_RECIPE };

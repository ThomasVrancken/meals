// The recipe-writing house style, shared by generation, recipe edits and the
// chat agent. This is the heart of the product: every recipe the app shows
// must read like something a tired couple will actually cook on a Tuesday.

const { AISLE_GUIDE } = require('../aisles');

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
6. SPICY: they love heat. Unless the dish would be odd with it, build in real spice and say how
   much. Vary where the heat comes from and fit it to the cuisine: fresh red chili or bird's eye
   chili, chili flakes, chipotle in adobo, jalapeños, harissa, sriracha, hot curry paste, Cajun or
   peri-peri seasoning, sambal (badjak, oelek). Sambal oelek is NOT the default: use it only when
   it is genuinely the best fit, and not in a batch alongside another sambal dish.
7. SPICES & HERBS — DIVERSITY: they love "funky" spice blends and fresh herbs as an easy way to
   lift a dish, and keep a handful of spice mixes at home. Give each recipe its own flavour
   identity instead of the same few condiments: e.g. ras el hanout, za'atar, dukkah, baharat,
   shawarma or kebab spices, garam masala, tandoori masala, Chinese five-spice, Cajun, Mexican
   chili/taco spices, smoked paprika, cumin, Italian herbs (Verstegen, Silvo, AH or Jonnie Boer
   spice rack), and fresh herbs from AH's herb packs (coriander, mint, Thai basil, flat-leaf parsley,
   dill, chives). Across a batch, no two recipes should share the same main flavour-maker
   (spice mix, paste or sauce), and check the recent history so the same one doesn't keep coming
   back. A fresh herb thrown on at the end counts as zero effort; use them often.

8. INGREDIENTS: only things reliably stocked at a regular Dutch Albert Heijn. Write the English
   name with the Dutch product name in parentheses when it helps to find it, e.g.
   "chicken thigh fillet (kipdijfilet)", "Thai red curry paste (AH / Go-Tan)",
   "wok vegetable mix (AH wokgroente)". Stick to mainstream supermarket products: AH own-brand,
   or common mainstream brands AH stocks (Go-Tan, Conimex, Patak's, Bertolli, Grand'Italia, Knorr,
   Unox, Honig, Calvé, Maggi and similar). Never call for specialty/deli/world-food-shop items a
   regular city-centre AH will not have (e.g. nduja, gochujang from a Korean grocer, Japanese curry
   roux blocks, doubanjiang, fish sauce brands not sold at AH) — use the closest AH-available
   substitute instead (e.g. sambal oelek or a jarred Asian chili paste instead of gochujang, an AH
   massaman/red curry paste instead of an imported curry roux block). If the user's own hint or
   instruction explicitly asks for a specific specialty ingredient, honour it. Do not invent brands
   or niche products; if unsure it exists at a normal AH, pick the common alternative.
   Amounts are supermarket packs for 2 hungry people: "1 pack (300 g)", "1 bag (400 g)",
   "1 can (400 ml)", "1/2 jar"; 200-250 g dry rice or pasta for two. Keep the list short
   (typically 5-9 items).
   Put each ingredient in the right aisle — this is Thomas & Lote's actual AH Haarlemmerplein
   walking order, classify every ingredient into exactly one of these:
${AISLE_GUIDE}
   For each ingredient, also set "where": for non-obvious or fancier items (a specific curry
   paste, a sauce, a spice mix, Asian/Mexican products, something in the chilled section) give a
   short honest store-section hint using typical AH layout categories, e.g. "World food aisle,
   Asian section", "Chilled section near the fresh pasta", "Spice rack, Verstegen/Silvo" — never a
   made-up aisle number. Leave "where" null for obvious everyday items (pasta, rice, minced beef,
   milk, eggs, plain vegetables, chicken fillet).
9. STEPS: 4-8 steps, each 1-2 sentences. Start with the carb pot if there is one. Call the pans
   "pot" and "wok"/"pan" consistently. It's fine to be more than a bare command: add what to look
   for ("until the edges catch and brown"), why a step matters, or when to add the spices/herbs
   for the best flavour. Keep it practical, not chatty. No intro, no plating, no "enjoy".
10. TITLE & COPY: short appetising title that says what it is ("Thai green chicken curry",
   "Spicy beef red sauce with penne"). One fitting emoji. Description: 2-3 sentences that explain
   the dish: what it is, its flavour direction (e.g. smoky and sweet, fresh and herby, rich and
   fiery) and what gives it that character, so they understand it and can steer it their own way.
   cuisine: short label. tags: 2-5 lowercase tags (protein, format, "spicy", "vegetarian", ...).
   pans and timeMinutes must be honest. servings is always 2.
11. TIPS: 1-4 genuinely useful tips. Usually include one "spice cupboard" tip: a spice mix,
    flavour palette or style they could stir in to take the dish somewhere else (e.g. "A pinch of
    ras el hanout with the mince turns this North African; finish with mint"). Other good tips:
    an order-of-operations trick ("add the coconut milk last so it doesn't split"), a smart swap,
    how to dial the heat, how long leftovers keep. Never generic seasoning fluff ("season with
    salt and pepper", "add salt to taste").
`.trim();

// A compact example so the model can see the target density and tone.
const EXAMPLE_RECIPE = {
  title: 'Thai red chicken curry with basil',
  emoji: '🍛',
  description:
    'Your go-to curry format: chicken thigh, a bag of wok veg and red curry paste in coconut milk over rice. Rich and gently sweet with real chili heat, lifted at the end by a handful of fresh Thai basil and a squeeze of lime.',
  cuisine: 'Thai',
  tags: ['curry', 'chicken', 'spicy'],
  timeMinutes: 25,
  servings: 2,
  pans: 2,
  ingredients: [
    { name: 'pandan rice (pandanrijst)', amount: '250 g', aisle: 'carbs', note: null, where: null },
    { name: 'chicken thigh strips (kipdijreepjes)', amount: '1 pack (300 g)', aisle: 'meat', note: null, where: null },
    { name: 'wok vegetable mix (AH wokgroente)', amount: '1 bag (400 g)', aisle: 'vegetables', note: null, where: null },
    { name: 'red chili (rode peper)', amount: '1', aisle: 'vegetables', note: 'sliced, seeds in', where: null },
    {
      name: 'Thai red curry paste (AH / Go-Tan)',
      amount: '3 tbsp',
      aisle: 'world-food',
      note: null,
      where: 'World food aisle, Asian section',
    },
    { name: 'coconut milk (kokosmelk)', amount: '1 can (400 ml)', aisle: 'world-food', note: null, where: null },
    {
      name: 'Thai basil (Thaise basilicum)',
      amount: '1 pack',
      aisle: 'vegetables',
      note: null,
      where: 'Fresh herbs shelf, next to the pre-cut veg',
    },
  ],
  steps: [
    'Start the rice in the pot.',
    'Brown the chicken in the wok on high heat for about 5 min, until it picks up some colour.',
    'Add the veg mix and the chili and stir-fry 3-4 min, so the veg keeps some bite.',
    'Push everything aside, fry the curry paste in the free spot for 1 min until it smells fragrant, then stir it through.',
    'Pour in the coconut milk and simmer 5 min until slightly thickened.',
    'Take the wok off the heat, tear in the basil and serve over the rice.',
  ],
  tips: [
    "Frying the paste on its own for a minute wakes up the spices; that's where most of the flavour comes from.",
    'Spice cupboard: a pinch of five-spice or garam masala with the paste pushes it towards a warmer, Malaysian-style curry.',
    "Stir the coconut milk in at the end and just simmer gently so it doesn't split.",
  ],
};

module.exports = { HOUSE_STYLE, EXAMPLE_RECIPE };

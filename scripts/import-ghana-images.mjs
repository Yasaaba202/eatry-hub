import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const assets = [
  {
    slug: "accra-restaurant-interior",
    id: "32477672",
    alt: "Warm, stylish restaurant interior with wooden furniture and soft lighting in Accra, Ghana",
    title: "Cozy Restaurant Interior in Accra, Ghana",
    photographer: "Kwaku Omari Jnr.",
    page: "https://www.pexels.com/photo/cozy-restaurant-interior-in-accra-ghana-32477672/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-dining-friends",
    id: "32103519",
    alt: "Friends dining together at an outdoor restaurant in Accra, Ghana",
    title: "Casual Dining in Accra, Ghana with Friends",
    photographer: "David Crypto",
    page: "https://www.pexels.com/photo/casual-dining-in-accra-ghana-with-friends-32103519/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-couple-dinner",
    id: "32103479",
    alt: "A couple enjoying drinks at a restaurant in Accra, Ghana",
    title: "Casual Couple Enjoying a Drink in Accra Restaurant",
    photographer: "David Crypto",
    page: "https://www.pexels.com/photo/casual-couple-enjoying-a-drink-in-accra-restaurant-32103479/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-cafe-table",
    id: "32103515",
    alt: "A table of food at a casual restaurant in Accra, Ghana",
    title: "Casual Dining in Accra with French Fries and Wrap",
    photographer: "David Crypto",
    page: "https://www.pexels.com/photo/casual-dining-in-accra-with-french-fries-and-wrap-32103515/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-outdoor-cafe",
    id: "32103476",
    alt: "Guests in conversation at an outdoor cafe in Accra, Ghana",
    title: "Casual Conversation at an Outdoor Cafe in Accra",
    photographer: "David Crypto",
    page: "https://www.pexels.com/photo/casual-conversation-at-an-outdoor-cafe-in-accra-32103476/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-table-details",
    id: "32477667",
    alt: "Olive oil and vinegar set on a wooden restaurant table in Accra, Ghana",
    title: "Olive Oil and Vinegar Set on Restaurant Table",
    photographer: "Kwaku Omari Jnr.",
    page: "https://www.pexels.com/photo/olive-oil-and-vinegar-set-on-restaurant-table-32477667/",
    width: 1000,
    height: 1250,
  },
  {
    slug: "accra-cafe-interior",
    id: "32103518",
    alt: "Cafe interior in Accra, Ghana",
    title: "Casual Dining Experience in Accra Cafe",
    photographer: "David Crypto",
    page: "https://www.pexels.com/photo/casual-dining-experience-in-accra-cafe-32103518/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "jollof-grilled-fish",
    id: "38936634",
    alt: "Jollof rice with grilled fish and vegetables",
    title: "Delicious West African Jollof Rice and Grilled Fish Meal",
    photographer: "Diana Teronpi",
    page: "https://www.pexels.com/photo/delicious-west-african-jollof-rice-and-grilled-fish-meal-38936634/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "jollof-fried-plantain",
    id: "17952745",
    alt: "Jollof rice served with fried plantain",
    title: "Meal with Rice and Fried Cubes of Aubergine",
    photographer: "Studio Saiz",
    page: "https://www.pexels.com/photo/meal-with-rice-and-fried-cubes-of-aubergine-17952745/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-table-setting",
    id: "35117894",
    alt: "Elegant outdoor table setting with a floral centrepiece in Accra, Ghana",
    title: "Elegant Outdoor Table Setting with Floral Centerpiece",
    photographer: "Ophelia Acquah",
    page: "https://www.pexels.com/photo/elegant-outdoor-table-setting-with-floral-centerpiece-35117894/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "accra-sharing-food",
    id: "18609561",
    alt: "A couple sharing food at a restaurant in Accra, Ghana",
    title: "French Fries in Hands of Couple",
    photographer: "David Crypto",
    page: "https://www.pexels.com/photo/french-fries-in-hands-of-couple-18609561/",
    width: 1500,
    height: 1000,
  },
  {
    slug: "ghana-cooking",
    id: "30279830",
    alt: "Two Ghanaian women preparing traditional food in Tamale, Ghana",
    title: "Ghanaian Women Preparing Traditional Food",
    photographer: "Odonti Photography",
    page: "https://www.pexels.com/photo/ghanaian-women-preparing-traditional-food-30279830/",
    width: 1200,
    height: 1500,
  },
  {
    slug: "ghana-plantain-peanuts",
    id: "35136066",
    alt: "Fried plantains with peanuts served in a bowl in Ghana",
    title: "Fried Plantains with Peanuts in a Bowl",
    photographer: "Ophelia Acquah",
    page: "https://www.pexels.com/photo/fried-plantains-with-peanuts-in-a-bowl-35136066/",
    width: 1200,
    height: 1500,
  },
];

const dir = resolve(process.cwd(), "public/images/ghana");
mkdirSync(dir, { recursive: true });

const credits = [];

for (const asset of assets) {
  const url = `https://images.pexels.com/photos/${asset.id}/pexels-photo-${asset.id}.jpeg?auto=compress&cs=tinysrgb&w=${asset.width}&h=${asset.height}&fit=crop`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`failed ${asset.slug}: HTTP ${response.status}`);
    continue;
  }
  const input = Buffer.from(await response.arrayBuffer());
  const output = await sharp(input)
    .rotate()
    .resize(asset.width, asset.height, { fit: "cover", position: "attention" })
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(resolve(dir, `${asset.slug}.webp`), output);
  credits.push({
    file: `/images/ghana/${asset.slug}.webp`,
    title: asset.title,
    photographer: asset.photographer,
    source: "Pexels",
    license: "Pexels License (free for commercial use, no attribution required)",
    page: asset.page,
    alt: asset.alt,
  });
  console.log(`ok ${asset.slug}.webp ${(output.length / 1024).toFixed(1)} KB`);
}

writeFileSync(resolve(dir, "attribution.json"), `${JSON.stringify(credits, null, 2)}\n`);
console.log(`\n${credits.length} images written with attribution.`);
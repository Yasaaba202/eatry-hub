export type GhanaCategory = {
  slug: string;
  name: string;
  blurb: string;
  image: string;
  search: string;
};

export const ghanaCategories: GhanaCategory[] = [
  {
    slug: "jollof-fried-rice",
    name: "Ghanaian Jollof and Fried Rice",
    blurb: "Smoky tomato rice and wok-tossed fried rice.",
    image: "/images/dishes/jollof-fish-plantain.webp",
    search: "jollof",
  },
  {
    slug: "waakye-rice-meals",
    name: "Waakye and Rice Meals",
    blurb: "Rice and beans with shito, egg and fish.",
    image: "/images/dishes/waakye-accra.webp",
    search: "waakye",
  },
  {
    slug: "banku-tilapia",
    name: "Banku and Tilapia",
    blurb: "Fermented corn dough with charred grilled fish.",
    image: "/images/dishes/banku-chicken-tilapia.webp",
    search: "banku",
  },
  {
    slug: "fufu-soups",
    name: "Fufu and Traditional Soups",
    blurb: "Pounded cassava and plantain in deep, hot soups.",
    image: "/images/dishes/fufu-light-soup.webp",
    search: "fufu",
  },
  {
    slug: "kenkey-fried-fish",
    name: "Kenkey and Fried Fish",
    blurb: "Fermented corn dough, pepper and crisp fried fish.",
    image: "/images/dishes/ga-kenkey.webp",
    search: "kenkey",
  },
  {
    slug: "yam-plantain",
    name: "Yam and Plantain Meals",
    blurb: "Boiled yam, fried plantain and bold stews.",
    image: "/images/dishes/ampesi-kontomire.webp",
    search: "yam",
  },
  {
    slug: "kelewele-snacks",
    name: "Kelewele and Ghanaian Snacks",
    blurb: "Ginger-spiced fried plantain and street snacks.",
    image: "/images/dishes/kelewele.webp",
    search: "kelewele",
  },
  {
    slug: "traditional-stews",
    name: "Traditional Ghanaian Stews",
    blurb: "Kontomire, garden egg, okro and palava sauce.",
    image: "/images/dishes/palava-sauce.webp",
    search: "stew",
  },
  {
    slug: "grilled-fish-seafood",
    name: "Grilled Fish and Seafood",
    blurb: "Tilapia and fried fish straight off the grill.",
    image: "/images/dishes/grilled-tilapia.webp",
    search: "tilapia",
  },
  {
    slug: "street-foods",
    name: "Ghanaian Street Foods",
    blurb: "Chichinga skewers, roasted plantain and groundnuts.",
    image: "/images/dishes/chichinga-kebab.webp",
    search: "kebab",
  },
  {
    slug: "northern-ghana",
    name: "Northern Ghanaian Dishes",
    blurb: "Tuo zaafi, wasawasa and millet-based plates.",
    image: "/images/dishes/tuo-zaafi.webp",
    search: "tuo",
  },
  {
    slug: "regional-specialties",
    name: "Traditional Regional Specialties",
    blurb: "Akple, etor and recipes passed down by region.",
    image: "/images/dishes/akple.webp",
    search: "akple",
  },
  {
    slug: "desserts-drinks",
    name: "Ghanaian Desserts and Drinks",
    blurb: "Sobolo, iced kenkey and sweet plantain treats.",
    image: "/images/dishes/sobolo-drink.webp",
    search: "sobolo",
  },
];

export type GhanaDish = {
  slug: string;
  name: string;
  blurb: string;
  image: string;
  category: string;
  search: string;
};

export const popularGhanaDishes: GhanaDish[] = [
  {
    slug: "ghanaian-jollof",
    name: "Ghanaian Jollof",
    blurb: "Smoky, slow-cooked tomato rice with grilled fish.",
    image: "/images/dishes/jollof-fish-plantain.webp",
    category: "Jollof and fried rice",
    search: "jollof",
  },
  {
    slug: "waakye",
    name: "Waakye",
    blurb: "Rice and beans with shito, spaghetti, egg and fish.",
    image: "/images/dishes/waakye-accra.webp",
    category: "Waakye and rice meals",
    search: "waakye",
  },
  {
    slug: "banku-tilapia",
    name: "Banku and Tilapia",
    blurb: "Charred grilled tilapia with smooth banku and pepper.",
    image: "/images/dishes/banku-chicken-tilapia.webp",
    category: "Banku and tilapia",
    search: "banku",
  },
  {
    slug: "fufu-light-soup",
    name: "Fufu and Light Soup",
    blurb: "Pounded cassava and plantain in hot pepper soup.",
    image: "/images/dishes/fufu-light-soup.webp",
    category: "Fufu and traditional soups",
    search: "fufu",
  },
  {
    slug: "kelewele",
    name: "Kelewele",
    blurb: "Ginger and chilli spiced plantain, fried to order.",
    image: "/images/dishes/kelewele.webp",
    category: "Kelewele and snacks",
    search: "kelewele",
  },
  {
    slug: "chicken-kebab",
    name: "Chicken Kebab",
    blurb: "Grilled skewers with pepper sauce and jollof.",
    image: "/images/dishes/chichinga-kebab.webp",
    category: "Ghanaian street foods",
    search: "kebab",
  },
  {
    slug: "red-red",
    name: "Red Red",
    blurb: "Beans in palm oil with sweet fried ripe plantain.",
    image: "/images/food-catalog/fried-plantain-beans-stew.jpg",
    category: "Yam and plantain meals",
    search: "beans",
  },
  {
    slug: "yam-garden-egg",
    name: "Yam and Garden Egg Stew",
    blurb: "Boiled yam with a sharp, peppery garden egg stew.",
    image: "/images/dishes/yam-garden-egg.webp",
    category: "Yam and plantain meals",
    search: "yam",
  },
  {
    slug: "okro-stew",
    name: "Okro Stew",
    blurb: "Silky okro stew with fish, crab and pepper.",
    image: "/images/food-catalog/okro-stew.jpg",
    category: "Traditional stews",
    search: "okro",
  },
  {
    slug: "sobolo",
    name: "Sobolo",
    blurb: "Chilled hibiscus and ginger drink, served cold.",
    image: "/images/dishes/sobolo-drink.webp",
    category: "Desserts and drinks",
    search: "sobolo",
  },
];

export const traditionalGhanaMeals: GhanaDish[] = [
  {
    slug: "fufu-palm-nut",
    name: "Fufu and Palm Nut Soup",
    blurb: "Pounded fufu with palm nut soup, snail and tilapia.",
    image: "/images/food-catalog/fufu-palm-nut-soup.jpg",
    category: "Fufu and traditional soups",
    search: "fufu",
  },
  {
    slug: "banku-pepper",
    name: "Banku and Pepper",
    blurb: "Banku served with fresh pepper in an asanka bowl.",
    image: "/images/dishes/banku-asanka.webp",
    category: "Banku and tilapia",
    search: "banku",
  },
  {
    slug: "ga-kenkey",
    name: "Ga Kenkey with Fish",
    blurb: "Ga kenkey with fried fish, canned beef and pepper.",
    image: "/images/dishes/ga-kenkey.webp",
    category: "Kenkey and fried fish",
    search: "kenkey",
  },
  {
    slug: "fante-kenkey",
    name: "Fante Kenkey and Shito",
    blurb: "Fante kenkey with sardine, shito and pepper.",
    image: "/images/dishes/fante-kenkey.webp",
    category: "Kenkey and fried fish",
    search: "kenkey",
  },
  {
    slug: "groundnut-soup",
    name: "Groundnut Soup",
    blurb: "Rich peanut soup, slow-simmered with meat.",
    image: "/images/dishes/groundnut-soup.webp",
    category: "Fufu and traditional soups",
    search: "groundnut",
  },
  {
    slug: "palava-sauce",
    name: "Palava Sauce",
    blurb: "Kontomire, agushie and pepper stew with yam.",
    image: "/images/dishes/palava-sauce.webp",
    category: "Traditional stews",
    search: "palava",
  },
  {
    slug: "ampesi-kontomire",
    name: "Ampesi and Kontomire",
    blurb: "Boiled yam and plantain with kontomire stew.",
    image: "/images/dishes/ampesi-kontomire.webp",
    category: "Yam and plantain meals",
    search: "ampesi",
  },
  {
    slug: "tuo-zaafi",
    name: "Tuo Zaafi",
    blurb: "Northern millet meal with ayoyo and nyuka.",
    image: "/images/dishes/tuo-zaafi.webp",
    category: "Northern Ghanaian dishes",
    search: "tuo",
  },
  {
    slug: "wasawasa",
    name: "Wasawasa",
    blurb: "Steamed yam leaves with pepper and groundnuts.",
    image: "/images/dishes/wasawasa.webp",
    category: "Northern Ghanaian dishes",
    search: "wasawasa",
  },
  {
    slug: "akple",
    name: "Akple",
    blurb: "Volta corn and cassava dough with okro soup.",
    image: "/images/dishes/akple.webp",
    category: "Regional specialties",
    search: "akple",
  },
  {
    slug: "etor",
    name: "Etor",
    blurb: "Pounded yam and plantain with palm nut sauce.",
    image: "/images/dishes/etor.webp",
    category: "Regional specialties",
    search: "etor",
  },
];

export const lovedGhanaDishes: GhanaDish[] = [
  popularGhanaDishes[0],
  popularGhanaDishes[1],
  popularGhanaDishes[2],
  popularGhanaDishes[3],
  popularGhanaDishes[4],
  popularGhanaDishes[5],
];

export type GhanaCollection = {
  slug: string;
  title: string;
  blurb: string;
  image: string;
  dishes: Array<{ name: string; image: string }>;
};

export const featuredCollections: GhanaCollection[] = [
  {
    slug: "jollof-collection",
    title: "Jollof and fried rice",
    blurb: "Party rice, grilled fish and everything served alongside.",
    image: "/images/dishes/jollof-fish-plantain.webp",
    dishes: [
      { name: "Jollof and fried fish", image: "/images/dishes/jollof-fish-plantain.webp" },
      { name: "Jollof and grilled tilapia", image: "/images/dishes/jollof-grilled-tilapia.webp" },
      { name: "Fried rice and fish", image: "/images/dishes/fried-rice-fish.webp" },
    ],
  },
  {
    slug: "waakye-collection",
    title: "Waakye and rice meals",
    blurb: "Rice and beans with the full works, from Accra to Tamale.",
    image: "/images/dishes/waakye-accra.webp",
    dishes: [
      { name: "Waakye in a leaf", image: "/images/dishes/waakye-leaf.webp" },
      { name: "Waakye with all the sides", image: "/images/dishes/wakye-leaves.webp" },
      { name: "Waakye and kelewele", image: "/images/dishes/waakye-accra.webp" },
    ],
  },
  {
    slug: "fish-collection",
    title: "Grilled fish and seafood",
    blurb: "Charcoal-grilled tilapia and crisp fried fish, hot from the grill.",
    image: "/images/dishes/grilled-tilapia.webp",
    dishes: [
      { name: "Grilled tilapia", image: "/images/dishes/grilled-tilapia.webp" },
      { name: "Ghanaian fried fish", image: "/images/dishes/ghanaian-fried-fish.webp" },
      { name: "Banku with grilled tilapia", image: "/images/food-catalog/grilled-tilapia-banku.jpg" },
    ],
  },
  {
    slug: "northern-collection",
    title: "Northern and regional plates",
    blurb: "Tuo zaafi, wasawasa and akple from across the regions.",
    image: "/images/dishes/tuo-zaafi.webp",
    dishes: [
      { name: "Tuo zaafi", image: "/images/dishes/tuo-zaafi.webp" },
      { name: "Wasawasa", image: "/images/dishes/wasawasa.webp" },
      { name: "Akple", image: "/images/dishes/akple.webp" },
    ],
  },
];

export const heroDishCollage = [
  {
    slug: "hero-jollof",
    name: "Ghanaian jollof",
    blurb: "Smoky tomato rice, cooked in one pot",
    image: "/images/dishes/jollof-fish-plantain.webp",
  },
  {
    slug: "hero-kelewele",
    name: "Kelewele",
    blurb: "Ginger-spiced plantain, fried to order",
    image: "/images/dishes/kelewele.webp",
  },
  {
    slug: "hero-banku",
    name: "Banku and grilled fish",
    blurb: "Fermented dough with charred tilapia",
    image: "/images/dishes/banku-chicken-tilapia.webp",
  },
];

export const heroFloatingDish = {
  slug: "hero-floating",
  name: "Grilled tilapia",
  blurb: "Fresh off the grill",
  image: "/images/dishes/grilled-tilapia.webp",
};
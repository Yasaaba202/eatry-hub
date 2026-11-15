const dishImages: Array<[RegExp, string]> = [
  [/^(ghanaian )?jollof rice$|^ghana jollof rice$/, "/images/food-catalog/ghanaian-jollof-rice.jpg"],
  [/^(ghanaian )?w(a|e)akye$|^ghanaian wache \(waakye\) cuisine food$/, "/images/food-catalog/ghanaian-waakye.jpg"],
  [/^(ghanaian )?jollof( rice)?$/, "/images/dishes/jollof-fish-plantain.webp"],
  [/^fufu( with palm nut soup)?(, snail and tilapia)?$/, "/images/food-catalog/fufu-palm-nut-soup.jpg"],
  [/^(banku|banku and tilapia|banku with grilled tilapia)$/, "/images/dishes/banku-chicken-tilapia.webp"],
  [/^(tilapia|grilled tilapia|fried tilapia)$/, "/images/dishes/grilled-tilapia.webp"],
  [/^fufu with palm nut soup(, snail and tilapia)?$/, "/images/food-catalog/fufu-palm-nut-soup.jpg"],
  [/^okro stew( 01)?$/, "/images/food-catalog/okro-stew.jpg"],
  [/^(bofrot|buffloaf)$/, "/images/food-catalog/buffloaf.jpg"],
  [/^(kelewele|kelewele, a ghanaian snack)$/, "/images/dishes/kelewele.webp"],
  [/^beans, gari, red oil and ripe plantain$/, "/images/food-catalog/ghana-beans-gari-plantain.jpg"],
  [/^boiled yam and garden egg stew$/, "/images/food-catalog/boiled-yam-garden-egg-stew.jpg"],
  [/^fried ripe plantain and beans stew$/, "/images/food-catalog/fried-plantain-beans-stew.jpg"],
  [/^grilled tilapia with banku$/, "/images/food-catalog/grilled-tilapia-banku.jpg"],
  [/^ghanaian chicken kebab with ghanaian peppers and ghanaian jollof rice \(ghanaian cuisine\)$/, "/images/food-catalog/ghanaian-chicken-kebab-jollof.jpg"],
  [/^(a bottle of )?sobolo$/, "/images/food-catalog/sobolo-drink.png"],
];

export const foodCatalogPhotos = [
  { label: "Ghanaian jollof rice", src: "/images/food-catalog/ghanaian-jollof-rice.jpg" },
  { label: "Ghanaian waakye", src: "/images/food-catalog/ghanaian-waakye.jpg" },
  { label: "Fufu with palm nut soup", src: "/images/food-catalog/fufu-palm-nut-soup.jpg" },
  { label: "Okro stew", src: "/images/food-catalog/okro-stew.jpg" },
  { label: "Bofrot / buffloaf", src: "/images/food-catalog/buffloaf.jpg" },
  { label: "Kelewele", src: "/images/food-catalog/kelewele-seller.jpg" },
  { label: "Beans, gari, and plantain", src: "/images/food-catalog/ghana-beans-gari-plantain.jpg" },
  { label: "Boiled yam and garden egg stew", src: "/images/food-catalog/boiled-yam-garden-egg-stew.jpg" },
  { label: "Fried plantain and beans stew", src: "/images/food-catalog/fried-plantain-beans-stew.jpg" },
  { label: "Grilled tilapia with banku", src: "/images/food-catalog/grilled-tilapia-banku.jpg" },
  { label: "Ghanaian chicken kebab with jollof", src: "/images/food-catalog/ghanaian-chicken-kebab-jollof.jpg" },
  { label: "Sobolo", src: "/images/food-catalog/sobolo-drink.png" },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function getMenuTemplateImage(
  _categoryName: string | null | undefined,
  foodName?: string | null,
) {
  if (!foodName) return null;
  return dishImages.find(([pattern]) => pattern.test(normalize(foodName)))?.[1] ?? null;
}

export function resolveMenuTemplateImage(
  imageUrl: string | null | undefined,
  categoryName: string | null | undefined,
  foodName?: string | null,
) {
  if (imageUrl && !imageUrl.startsWith("/images/food-catalog/")) return imageUrl;
  return getMenuTemplateImage(categoryName, foodName);
}

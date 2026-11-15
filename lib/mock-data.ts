export type Vendor = {
  id: string;
  name: string;
  category: string;
  rating: number;
  location: string;
  distance: string;
  status: string;
  cover: string;
};

export type MenuItem = {
  id: string;
  name: string;
  vendor: string;
  vendorId: string;
  price: number;
  category: string;
  image: string;
  rating: number;
  prepTime: string;
  description: string;
  popular?: boolean;
};

export const vendors: Vendor[] = [
  {
    id: "bantama-grill",
    name: "Bantama Grill",
    category: "Ghanaian & Grill",
    rating: 4.9,
    location: "Bantama, Kumasi",
    distance: "1.4 km",
    status: "Open now",
    cover:
      "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "jollof-junction",
    name: "Jollof Junction",
    category: "African Kitchen",
    rating: 4.8,
    location: "East Legon, Accra",
    distance: "3.1 km",
    status: "Open now",
    cover:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "sushi-spice",
    name: "Sushi Spice",
    category: "Asian Fusion",
    rating: 4.7,
    location: "Osu, Accra",
    distance: "2.7 km",
    status: "Busy",
    cover:
      "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "veggie-vibe",
    name: "Veggie Vibe",
    category: "Healthy Bowls",
    rating: 4.9,
    location: "Tema Community 25",
    distance: "5.0 km",
    status: "Open now",
    cover:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80",
  },
];

export const menuItems: MenuItem[] = [
  {
    id: "food-1",
    name: "Coconut Jollof Rice",
    vendor: "Bantama Grill",
    vendorId: "bantama-grill",
    price: 65,
    category: "Rice",
    image:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
    rating: 4.9,
    prepTime: "20 mins",
    description: "Fragrant rice with tomato stew, vegetables, and roasted chicken.",
    popular: true,
  },
  {
    id: "food-2",
    name: "Banku & Tilapia",
    vendor: "Jollof Junction",
    vendorId: "jollof-junction",
    price: 78,
    category: "Local Favourite",
    image:
      "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80",
    rating: 4.8,
    prepTime: "25 mins",
    description: "A hearty Ghanaian combo with grilled tilapia and fresh pepper sauce.",
    popular: true,
  },
  {
    id: "food-3",
    name: "Chicken Shawarma",
    vendor: "Sushi Spice",
    vendorId: "sushi-spice",
    price: 52,
    category: "Wraps",
    image:
      "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=800&q=80",
    rating: 4.6,
    prepTime: "15 mins",
    description: "Crisp wrap loaded with guacamole, pickles, and juicy chicken.",
  },
  {
    id: "food-4",
    name: "Garden Bowl",
    vendor: "Veggie Vibe",
    vendorId: "veggie-vibe",
    price: 58,
    category: "Healthy",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80",
    rating: 5.0,
    prepTime: "18 mins",
    description: "Brown rice, avocado, greens, and protein-packed grains.",
    popular: true,
  },
  {
    id: "food-5",
    name: "Pepper Rice Combo",
    vendor: "Bantama Grill",
    vendorId: "bantama-grill",
    price: 74,
    category: "Rice",
    image:
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
    rating: 4.8,
    prepTime: "22 mins",
    description: "Hot and spicy rice with stew, salad, and grilled chicken wings.",
  },
  {
    id: "food-6",
    name: "Seafood Pasta",
    vendor: "Sushi Spice",
    vendorId: "sushi-spice",
    price: 92,
    category: "Pasta",
    image:
      "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80",
    rating: 4.7,
    prepTime: "30 mins",
    description: "Creamy seafood pasta with seasonal vegetables and garlic butter.",
  },
  {
    id: "food-7",
    name: "Waakye Bowl",
    vendor: "Jollof Junction",
    vendorId: "jollof-junction",
    price: 48,
    category: "Breakfast",
    image:
      "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
    rating: 4.8,
    prepTime: "14 mins",
    description: "Beans and rice bowl served with stew, fish, and spicy salsa.",
  },
  {
    id: "food-8",
    name: "Power Smoothie",
    vendor: "Veggie Vibe",
    vendorId: "veggie-vibe",
    price: 35,
    category: "Drinks",
    image:
      "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=800&q=80",
    rating: 4.9,
    prepTime: "8 mins",
    description: "Banana, spinach, pineapple, and chia energy smoothie.",
  },
];

export const subscriptionPlans = [
  {
    name: "Starter",
    price: "GHS 90",
    description: "For new vendors launching their first store",
    features: ["1 vendor storefront", "Basic analytics", "Monthly payouts"],
    accent: "bg-slate-900 text-white",
  },
  {
    name: "Growth",
    price: "GHS 180",
    description: "Popular plan for growing food businesses",
    features: ["Priority order routing", "Advanced reports", "Promotional tools"],
    accent: "bg-orange-500 text-white",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "GHS 320",
    description: "For multi-location stores and large kitchens",
    features: ["Unlimited menus", "Dedicated support", "Custom integrations"],
    accent: "bg-amber-100 text-slate-900",
  },
];

export const statCards = [
  { label: "Total sales", value: "GHS 24,810", change: "+18.2%" },
  { label: "Orders", value: "1,482", change: "+12.4%" },
  { label: "Pending", value: "86", change: "+6.3%" },
  { label: "Subscription", value: "Active", change: "Renews 12 Oct" },
];

export const recentOrders = [
  { id: "EH-2041", customer: "Kwame Agyemang", amount: 310, status: "Preparing" },
  { id: "EH-2042", customer: "Ama Boateng", amount: 245, status: "Ready" },
  { id: "EH-2043", customer: "Naa Ofori", amount: 480, status: "Completed" },
];

export const reviews = [
  {
    name: "Linda M",
    review:
      "Fast delivery and excellent packaging. I ordered from two vendors and everything arrived on time.",
    rating: 5,
  },
  {
    name: "Daniel K",
    review:
      "The vendor dashboard feels very smooth. I can manage orders and payouts without confusion.",
    rating: 5,
  },
  {
    name: "Grace T",
    review:
      "The search and menu discovery make it easy to browse local favorites while supporting small businesses.",
    rating: 4,
  },
];

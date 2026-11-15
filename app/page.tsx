"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage-state";
import {
  featuredCollections,
  ghanaCategories,
  heroDishCollage,
  heroFloatingDish,
  lovedGhanaDishes,
  popularGhanaDishes,
  traditionalGhanaMeals,
  type GhanaDish,
} from "@/lib/ghana-dishes";

type FoodItem = {
  id: string;
  name: string;
  vendor: string;
  vendorId: string;
  price: number;
  portions: Array<{ size: "Small" | "Medium" | "Large"; price: number }>;
  category: string;
  image: string | null;
  prepTime: string;
  description: string;
  createdAt?: string;
};

type CartItem = FoodItem & {
  quantity: number;
  mealId: string;
  portionSize?: "Small" | "Medium" | "Large";
  cartKey: string;
};

type Vendor = {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  location: string;
  description: string;
  cover: string;
};

type OrderSummary = {
  orderId: string;
  customer: string;
  paymentMethod: string;
  status: string;
  amount: number;
  vendors: string[];
};

type TrackedOrder = {
  orderNumber: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  currency: string;
  createdAt: string;
  vendors: { name: string; status: string }[];
  updates: { status: string; note: string | null; createdAt: string }[];
};

type AccountSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
};

type MobileMoneyNetwork = "MTN" | "TELECEL";
type MobileMoneyDestinations = Record<MobileMoneyNetwork, { accountName: string; accountNumber: string }>;

const EMPTY_CART: CartItem[] = [];

function isCartArray(value: unknown): value is CartItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof item.id === "string" &&
        "name" in item &&
        typeof item.name === "string" &&
        "vendor" in item &&
        typeof item.vendor === "string" &&
        "vendorId" in item &&
        typeof item.vendorId === "string" &&
        "price" in item &&
        typeof item.price === "number" &&
        "category" in item &&
        typeof item.category === "string" &&
        "image" in item &&
        (typeof item.image === "string" || item.image === null) &&
        "prepTime" in item &&
        typeof item.prepTime === "string" &&
        "description" in item &&
        typeof item.description === "string" &&
        "quantity" in item &&
        typeof item.quantity === "number",
    )
  );
}

const subscriptionPlans = [
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
    accent: "bg-orange-600 text-white",
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

const howItWorks = [
  {
    step: "01",
    title: "Discover Ghanaian dishes",
    body: "Browse authentic meals by category, from jollof and waakye to banku, fufu and northern plates.",
  },
  {
    step: "02",
    title: "Choose portions and add to cart",
    body: "Pick a portion size, add the meal to your cart and check out as a guest or with your Eatry Hub account.",
  },
  {
    step: "03",
    title: "Pay your way and track it",
    body: "Pay by mobile money, wallet balance or cash on delivery, then follow every status change with your order number.",
  },
];

export default function Home() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menuItems, setMenuItems] = useState<FoodItem[]>([]);
  const [mobileMoneyDestinations, setMobileMoneyDestinations] = useState<MobileMoneyDestinations | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [cart, setCart] = useLocalStorageState("eatry-hub-cart", EMPTY_CART, isCartArray);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [checkoutMode, setCheckoutMode] = useState<"ACCOUNT" | "GUEST">("GUEST");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [deliveryFeePayment, setDeliveryFeePayment] = useState<"UPFRONT" | "ON_DELIVERY">("UPFRONT");
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "MOBILE_MONEY" | "CASH_ON_DELIVERY">("CASH_ON_DELIVERY");
  const [senderNetwork, setSenderNetwork] = useState<MobileMoneyNetwork>("MTN");
  const [senderName, setSenderName] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [senderMobileNumber, setSenderMobileNumber] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState("");
  const [trackingPhone, setTrackingPhone] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrder | null>(null);
  const [trackingError, setTrackingError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [notice, setNotice] = useState("Ready to order your next meal.");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedPortions, setSelectedPortions] = useState<Record<string, "Small" | "Medium" | "Large">>({});
  const [copyrightYear, setCopyrightYear] = useState<number | null>(null);
  const checkoutIdempotency = useRef<{ signature: string; key: string }>({ signature: "", key: "" });

  useEffect(() => {
    // The copyright year is client-only so it is not frozen at build time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCopyrightYear(new Date().getFullYear());
  }, []);

  const getCheckoutIdempotencyKey = (signature: string) => {
    if (checkoutIdempotency.current.signature !== signature) {
      checkoutIdempotency.current = { signature, key: crypto.randomUUID() };
    }
    return checkoutIdempotency.current.key;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [marketplaceResponse, sessionResponse] = await Promise.all([
            fetch("/api/marketplace", { cache: "no-store" }),
            fetch("/api/auth/session", { cache: "no-store" }),
          ]);
          const marketplace = await marketplaceResponse.json() as {
            vendors?: Vendor[];
            meals?: FoodItem[];
            mobileMoneyDestinations?: MobileMoneyDestinations | null;
            error?: string;
          };
          if (!marketplaceResponse.ok) {
            setMarketplaceError(marketplace.error ?? "The live marketplace could not be loaded.");
          } else {
            const availableMeals = marketplace.meals ?? [];
            setMobileMoneyDestinations(marketplace.mobileMoneyDestinations ?? null);
            const availableMealsById = new Map(availableMeals.map((meal) => [meal.id, meal]));
            setVendors(marketplace.vendors ?? []);
            setMenuItems(availableMeals);
            setCart((current) => current.flatMap((item) => {
              const mealId = item.mealId || item.id;
              const latestMeal = availableMealsById.get(mealId);
              if (!latestMeal) return [];
              const portionSize = item.portionSize;
              const portion = portionSize ? latestMeal.portions.find((entry) => entry.size === portionSize) : null;
              if (portionSize && !portion) return [];
              const cartKey = `${mealId}:${portionSize ?? "standard"}`;
              return [{ ...latestMeal, quantity: item.quantity, mealId, portionSize, cartKey, price: portion?.price ?? latestMeal.price }];
            }));
          }
          const session = await sessionResponse.json() as { user?: AccountSummary | null };
          const currentAccount = session.user?.role === "CUSTOMER" ? session.user : null;
          setAccount(currentAccount ?? null);
          if (currentAccount) {
            setCheckoutMode("ACCOUNT");
            setGuestName(currentAccount.fullName);
            setPhoneNumber(currentAccount.phone ?? "");
            const walletResponse = await fetch("/api/customer/wallet", { cache: "no-store" });
            if (walletResponse.ok) {
              const wallet = await walletResponse.json() as { balance?: number };
              setWalletBalance(wallet.balance ?? 0);
            }
          }
        } catch (error) {
          console.error("Marketplace initialization failed.", error);
          setMarketplaceError("Could not reach the server to load the marketplace.");
        } finally {
          setMarketplaceLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setCart]);

  const vendorLocationById = useMemo(
    () => new Map(vendors.map((vendor) => [vendor.id, vendor.location])),
    [vendors],
  );

  const filteredFoods = useMemo(() => {
    const query = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchesSearch =
        !query ||
        [item.name, item.vendor, item.category]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesVendor = !selectedVendor || item.vendorId === selectedVendor;
      const matchesLocation = !selectedLocation || vendorLocationById.get(item.vendorId) === selectedLocation;
      return matchesSearch && matchesVendor && matchesLocation;
    });
  }, [menuItems, search, selectedVendor, selectedLocation, vendorLocationById]);

  const vendorLocations = useMemo(
    () => [...new Set(vendors.map((vendor) => vendor.location).filter((location) => Boolean(location?.trim())))].sort((a, b) => a.localeCompare(b)),
    [vendors],
  );

  const recentMeals = useMemo(() => {
    return [...menuItems]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 4);
  }, [menuItems]);

  const hasLiveDish = (dish: GhanaDish) => {
    const term = dish.search.toLowerCase();
    return menuItems.some((meal) =>
      `${meal.name} ${meal.category} ${meal.description}`.toLowerCase().includes(term),
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  const showMenu = () => {
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  };

  const showDishes = () => {
    document.getElementById("dishes")?.scrollIntoView({ behavior: "smooth" });
  };

  const showCategories = () => {
    document.getElementById("categories")?.scrollIntoView({ behavior: "smooth" });
  };

  const runSearch = () => {
    setSelectedVendor("");
    showMenu();
  };

  const pickDish = (term: string) => {
    setSearch(term);
    setSelectedVendor("");
    setSelectedLocation("");
    showMenu();
  };

  const focusVendor = (vendorId: string) => {
    setSelectedVendor(vendorId);
    setSelectedLocation("");
    setSearch("");
    showMenu();
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedVendor("");
    setSelectedLocation("");
  };

  const addToCart = (item: FoodItem, portionSize?: "Small" | "Medium" | "Large") => {
    const portion = portionSize ? item.portions.find((entry) => entry.size === portionSize) : null;
    const cartKey = `${item.id}:${portionSize ?? "standard"}`;
    const cartItem: CartItem = { ...item, mealId: item.id, portionSize, cartKey, price: portion?.price ?? item.price, quantity: 1 };
    setCart((current) => {
      const existing = current.find((entry) => (entry.cartKey || entry.id) === cartKey);
      if (existing) {
        return current.map((entry) =>
          (entry.cartKey || entry.id) === cartKey
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }

      return [...current, cartItem];
    });

    setNotice(`${item.name}${portionSize ? ` (${portionSize})` : ""} added to your cart.`);
  };

  const updateQuantity = (cartKey: string, change: number) => {
    setCart((current) =>
      current
        .map((entry) =>
          (entry.cartKey || entry.id) === cartKey
            ? { ...entry, quantity: Math.max(0, entry.quantity + change) }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    );
  };

  const handlePlaceOrder = async () => {
    if (placingOrder) return;
    if (cart.length === 0) {
      setNotice("Your cart is empty. Add meals before placing an order.");
      return;
    }

    if (!phoneNumber.trim()) {
      setNotice("Enter a phone number so the vendor can contact you.");
      return;
    }

    if (deliveryMode === "DELIVERY" && !deliveryAddress.trim()) {
      setNotice("Enter a delivery address or switch to pickup.");
      return;
    }

    if (paymentMethod === "MOBILE_MONEY" && (!transactionId.trim() || !senderMobileNumber.trim())) {
      setNotice("Enter the transaction ID, sender name, and mobile-money number used to send payment.");
      return;
    }
    if (paymentMethod === "MOBILE_MONEY" && (!mobileMoneyDestinations || !senderName.trim())) {
      setNotice("Mobile Money receiving details are unavailable or sender details are missing. Choose another payment method or contact support.");
      return;
    }
    if (checkoutMode === "GUEST" && !guestName.trim()) {
      setNotice("Enter your name to continue as a guest.");
      return;
    }
    if (paymentMethod === "WALLET" && (checkoutMode !== "ACCOUNT" || !account)) {
      setNotice("Sign in and choose account checkout to use your wallet.");
      return;
    }
    if (deliveryMode === "DELIVERY" && deliveryFeePayment === "UPFRONT" && paymentMethod === "CASH_ON_DELIVERY") {
      setNotice("Choose mobile money or account balance to pay the delivery fee upfront, or choose pay on delivery.");
      return;
    }

    setPlacingOrder(true);
    setNotice("");
    const orderItems = cart.map((item) => ({ mealId: item.mealId || item.id, quantity: item.quantity, portionSize: item.portionSize }));
    const idempotencyKey = getCheckoutIdempotencyKey(JSON.stringify(orderItems));
    try {
      const response = await fetch("/api/customer/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          items: orderItems,
          checkoutMode,
          customerName: checkoutMode === "GUEST" ? guestName : undefined,
          customerEmail: checkoutMode === "GUEST" && guestEmail.trim() ? guestEmail.trim() : undefined,
          phone: phoneNumber,
          fulfillmentType: deliveryMode,
          deliveryFeePayment,
          deliveryAddress,
          paymentMethod,
          transactionId: paymentMethod === "MOBILE_MONEY" ? transactionId : undefined,
          senderName: paymentMethod === "MOBILE_MONEY" ? senderName : undefined,
          senderMobileNumber: paymentMethod === "MOBILE_MONEY" ? senderMobileNumber : undefined,
          senderNetwork: paymentMethod === "MOBILE_MONEY" ? senderNetwork : undefined,
        }),
      });
      const result = await response.json() as {
        error?: string;
        message?: string;
        orderNumber?: string;
        trackingToken?: string;
        total?: number;
        vendors?: string[];
        paymentStatus?: string;
      };
      if (!response.ok) {
        setNotice(result.error ?? "Your order could not be placed.");
        return;
      }
      const total = result.total ?? cart.reduce((sum, item) => sum + item.price * item.quantity, 0) +
        (deliveryMode === "DELIVERY" && deliveryFeePayment === "UPFRONT" ? 50 : 0);
      setOrderSummary({
        orderId: result.orderNumber ?? "",
        customer: checkoutMode === "ACCOUNT" ? account?.fullName ?? "" : guestName,
        paymentMethod: paymentMethod === "WALLET"
          ? "Account balance"
          : paymentMethod === "MOBILE_MONEY"
            ? "Mobile Money"
            : "Cash on delivery",
        status: paymentMethod === "WALLET"
          ? "Paid"
          : paymentMethod === "MOBILE_MONEY"
            ? "Awaiting admin verification"
            : "Due on delivery",
        amount: total,
        vendors: result.vendors ?? [],
      });
      setCart([]);
      setTransactionId("");
      setSenderName("");
      setSenderMobileNumber("");
      setNotice(result.message ?? "Order placed.");
      setTrackingOrderNumber(result.orderNumber ?? "");
      setTrackingPhone(phoneNumber);
      setTrackingToken(result.trackingToken ?? "");
      setTrackedOrder(null);
      checkoutIdempotency.current = { signature: "", key: "" };
      if (paymentMethod === "WALLET") {
        setWalletBalance((balance) => Math.max(0, balance - total));
      }
    } catch (error) {
      console.error("Customer order request failed.", error);
      setNotice("Could not reach the server to place your order.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleTrackOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTrackingLoading(true);
    setTrackingError("");
    setTrackedOrder(null);
    try {
      const params = trackingToken
        ? new URLSearchParams({ token: trackingToken })
        : new URLSearchParams({
            orderNumber: trackingOrderNumber.trim(),
            phone: trackingPhone.trim(),
          });
      const response = await fetch(`/api/orders/track?${params}`, { cache: "no-store" });
      const result = await response.json() as { order?: TrackedOrder; trackingToken?: string; error?: string };
      if (!response.ok || !result.order) {
        if (trackingToken && (response.status === 401 || response.status === 410)) {
          setTrackingToken("");
          setTrackingError("That tracking link is no longer valid. Enter your order number and phone number instead.");
          return;
        }
        setTrackingError(result.error ?? "Could not find that order.");
        return;
      }
      if (result.trackingToken) setTrackingToken(result.trackingToken);
      setTrackedOrder(result.order);
    } catch (error) {
      console.error("Order tracking request failed.", error);
      setTrackingError("Could not reach the server to track this order.");
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleCheckoutModeChange = (mode: "ACCOUNT" | "GUEST") => {
    setCheckoutMode(mode);
    if (mode === "GUEST" && paymentMethod === "WALLET") setPaymentMethod("CASH_ON_DELIVERY");
    if (mode === "ACCOUNT" && account) {
      setGuestName(account.fullName);
      setPhoneNumber(account.phone ?? phoneNumber);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf4] text-slate-900">
      <div className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2 text-[11px] font-medium tracking-wide sm:text-xs">
          <span>Delivery across Accra · GHS 50</span>
          <span aria-hidden="true" className="hidden text-orange-400 sm:inline">•</span>
          <span>Free pickup from the kitchen</span>
          <span aria-hidden="true" className="hidden text-orange-400 sm:inline">•</span>
          <span>Pay with MoMo, wallet or cash</span>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#fffaf4]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/brand/logo-mark.svg"
              alt="Eatry Hub"
              width={42}
              height={42}
              priority
              className="h-10 w-10 drop-shadow-[0_8px_16px_rgba(234,88,12,0.25)] sm:h-11 sm:w-11"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black uppercase tracking-[0.18em] text-slate-950 sm:text-base">
                Eatry Hub
              </span>
              <span className="hidden text-[11px] font-medium text-slate-500 sm:block">Ghanaian food marketplace</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-700 lg:flex">
            <button type="button" onClick={showDishes} className="transition hover:text-orange-600">Popular dishes</button>
            <button type="button" onClick={showCategories} className="transition hover:text-orange-600">Categories</button>
            <a href="#traditional" className="transition hover:text-orange-600">Traditional</a>
            <a href="#how-it-works" className="transition hover:text-orange-600">How it works</a>
            <a href="#subscriptions" className="transition hover:text-orange-600">For vendors</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a
              href="#checkout"
              aria-label={`Cart with ${cartQuantity} items`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M2.5 3.5h2.2l2.2 11.2h11.4l2-7.6H6.1" />
              </svg>
              {cartQuantity > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[11px] font-bold text-white">
                  {cartQuantity}
                </span>
              )}
            </a>
            <Link
              href={account ? "/customer-dashboard" : "/login"}
              className="hidden whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-orange-200 hover:text-orange-600 sm:block"
            >
              {account ? "My account" : "Login"}
            </Link>
            <Link
              href="/vendor-signup"
              className="whitespace-nowrap rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-slate-300/60 transition hover:bg-slate-800 sm:px-5 sm:text-sm"
            >
              <span className="sm:hidden">Vendor</span>
              <span className="hidden sm:inline">Join as vendor</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Ghanaian food, cooked fresh
              </div>

              <h1 className="mt-6 font-display text-[2.7rem] leading-[1.02] tracking-tight text-slate-950 sm:text-6xl lg:text-[4.3rem]">
                Taste the Best of
                <span className="relative mx-2 inline-block text-orange-600">
                  Ghana.
                  <span aria-hidden="true" className="absolute -bottom-1 left-0 -z-10 h-2.5 w-full rounded-full bg-orange-200/70" />
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Discover delicious Ghanaian meals, explore local favourites and order your next meal with Eatry Hub.
              </p>

              <form
                className="mt-8 rounded-[26px] border border-white bg-white/95 p-2 shadow-[0_18px_50px_rgba(124,45,18,0.14)] ring-1 ring-orange-100/80"
                onSubmit={(event) => {
                  event.preventDefault();
                  runSearch();
                }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <span className="sr-only">Search Ghanaian dishes</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search Ghanaian dishes"
                      className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 sm:text-base"
                    />
                  </label>

                  <label className="flex items-center gap-2 border-slate-100 px-3 sm:border-l">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                    <span className="sr-only">Choose an area</span>
                    <select
                      value={selectedLocation}
                      onChange={(event) => setSelectedLocation(event.target.value)}
                      className="w-full bg-transparent py-3 text-sm font-medium text-slate-700 outline-none sm:w-40"
                    >
                      <option value="">All areas</option>
                      {vendorLocations.map((location) => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="rounded-[18px] bg-orange-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:rounded-full"
                  >
                    Search
                  </button>
                </div>
              </form>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={showDishes}
                  className="rounded-full bg-slate-950 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-300/70 transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Explore Ghanaian dishes
                </button>
                <button
                  type="button"
                  onClick={showMenu}
                  className="rounded-full border border-slate-300 bg-white/80 px-6 py-3.5 text-sm font-bold text-slate-800 transition hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700"
                >
                  Order your favourite meal
                </button>
              </div>

              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-slate-200 pt-6">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Live meals</dt>
                  <dd className="mt-1 text-2xl font-black text-slate-950">{menuItems.length || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Approved kitchens</dt>
                  <dd className="mt-1 text-2xl font-black text-slate-950">{vendors.length || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery fee</dt>
                  <dd className="mt-1 text-2xl font-black text-slate-950">GHS 50</dd>
                </div>
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-[540px]">
              <div className="grid grid-cols-5 gap-3 sm:gap-4">
                <figure className="relative col-span-3 aspect-[4/5] overflow-hidden rounded-[28px] border-4 border-white shadow-[0_24px_60px_rgba(124,45,18,0.22)]">
                  <Image
                    src={heroDishCollage[0].image}
                    alt={`${heroDishCollage[0].name} — ${heroDishCollage[0].blurb}`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 60vw, 320px"
                    className="object-cover"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent p-4 pt-10 text-white">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Ghanaian favourite</p>
                    <p className="mt-1 text-sm font-bold leading-snug">{heroDishCollage[0].name}</p>
                  </figcaption>
                </figure>

                <div className="col-span-2 flex flex-col gap-3 sm:gap-4">
                  <figure className="relative aspect-square overflow-hidden rounded-[24px] border-4 border-white shadow-[0_18px_44px_rgba(124,45,18,0.18)]">
                    <Image
                      src={heroDishCollage[1].image}
                      alt={`${heroDishCollage[1].name} — ${heroDishCollage[1].blurb}`}
                      fill
                      priority
                      sizes="(max-width: 1024px) 40vw, 220px"
                      className="object-cover"
                    />
                  </figure>
                  <figure className="relative aspect-[4/5] overflow-hidden rounded-[24px] border-4 border-white shadow-[0_18px_44px_rgba(124,45,18,0.18)]">
                    <Image
                      src={heroDishCollage[2].image}
                      alt={`${heroDishCollage[2].name} — ${heroDishCollage[2].blurb}`}
                      fill
                      priority
                      sizes="(max-width: 1024px) 40vw, 220px"
                      className="object-cover"
                    />
                  </figure>
                </div>
              </div>

              <div className="absolute -bottom-5 left-2 hidden items-center gap-3 rounded-2xl border border-white bg-white/95 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur sm:flex">
                <Image
                  src={heroFloatingDish.image}
                  alt={heroFloatingDish.name}
                  width={56}
                  height={56}
                  className="h-12 w-12 rounded-xl object-cover"
                />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Street favourite</p>
                  <p className="text-sm font-bold text-slate-900">{heroFloatingDish.name}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dishes" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Popular Ghanaian dishes"
            title="The plates Ghanaians order most"
            description="Authentic Ghanaian meals, photographed as they are served. Explore a dish to see what is available right now."
            action={{ label: "See all categories", onClick: showCategories }}
          />

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {popularGhanaDishes.map((dish, index) => (
              <DishCard
                key={dish.slug}
                dish={dish}
                live={hasLiveDish(dish)}
                priority={index < 3}
                onExplore={() => pickDish(dish.search)}
              />
            ))}
          </div>
        </section>

        <section id="categories" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Explore Ghanaian food categories"
            title="Find your next craving"
            description="Thirteen categories covering the dishes cooked across Ghana — from jollof and waakye to akple, tuo zaafi and sobolo."
            action={{ label: "Open the live menu", onClick: showMenu }}
          />

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {ghanaCategories.map((category) => (
              <button
                key={category.slug}
                type="button"
                onClick={() => pickDish(category.search)}
                className="group relative aspect-[4/5] overflow-hidden rounded-[26px] border-2 border-white text-left shadow-[0_14px_40px_rgba(124,45,18,0.16)]"
              >
                <Image
                  src={category.image}
                  alt={category.name}
                  fill
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 23vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-4">
                  <span className="block text-sm font-bold leading-snug text-white sm:text-base">{category.name}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-orange-100 sm:text-xs">{category.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section id="traditional" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-orange-100 bg-white p-6 shadow-[0_20px_60px_rgba(124,45,18,0.08)] sm:p-10">
            <SectionHeading
              eyebrow="Traditional Ghanaian meals"
              title="Recipes passed down, served daily"
              description="Regional staples and family dishes — banku, fufu, kenkey, akple and the northern plates that rarely make it onto tourist menus."
              action={{ label: "Browse the full menu", onClick: showMenu }}
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {traditionalGhanaMeals.map((dish) => (
                <article
                  key={dish.slug}
                  className="group flex overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(124,45,18,0.12)]"
                >
                  <div className="relative w-28 shrink-0 overflow-hidden bg-orange-50 sm:w-32">
                    <Image
                      src={dish.image}
                      alt={dish.name}
                      fill
                      sizes="128px"
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-600">{dish.category}</p>
                    <h3 className="mt-1 truncate text-sm font-bold text-slate-950 sm:text-base">{dish.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{dish.blurb}</p>
                    <button
                      type="button"
                      onClick={() => pickDish(dish.search)}
                      className="mt-3 self-start rounded-full border border-slate-300 px-4 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
                    >
                      {hasLiveDish(dish) ? "Order" : "Explore"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Most-loved Ghanaian dishes"
            title="The favourites that never leave the menu"
            description="Jollof, waakye, banku and tilapia, fufu and kelewele — the dishes ordered again and again. Eatry Hub does not display star ratings until verified review data exists."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lovedGhanaDishes.map((dish, index) => (
              <article
                key={`loved-${dish.slug}`}
                className="group relative flex gap-4 overflow-hidden rounded-[26px] border border-slate-200/80 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(124,45,18,0.12)]"
              >
                <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[18px] bg-orange-50 sm:h-32 sm:w-28">
                  <Image
                    src={dish.image}
                    alt={dish.name}
                    fill
                    sizes="112px"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                  <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-[11px] font-black text-slate-950">
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1 py-1 pr-1">
                  <h3 className="truncate text-base font-bold text-slate-950">{dish.name}</h3>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-600">{dish.category}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{dish.blurb}</p>
                  <button
                    type="button"
                    onClick={() => pickDish(dish.search)}
                    className="mt-3 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    {hasLiveDish(dish) ? "Order now" : "Explore dish"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Featured food collections"
            title="Curated Ghanaian food collections"
            description="Grouped by the way Ghanaians eat — rice plates, grilled fish, regional staples and the sides that come with them."
          />

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {featuredCollections.map((collection) => (
              <article
                key={collection.slug}
                className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-orange-50 sm:aspect-[16/10]">
                  <Image
                    src={collection.image}
                    alt={collection.title}
                    fill
                    sizes="(max-width: 1024px) 90vw, 45vw"
                    className="object-cover transition duration-700 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <h3 className="font-display text-2xl leading-tight text-white sm:text-3xl">{collection.title}</h3>
                    <p className="mt-1 max-w-md text-xs leading-5 text-slate-200 sm:text-sm">{collection.blurb}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3">
                  {collection.dishes.map((dish) => (
                    <figure key={`${collection.slug}-${dish.name}`} className="relative aspect-square overflow-hidden rounded-2xl bg-orange-50">
                      <Image
                        src={dish.image}
                        alt={dish.name}
                        fill
                        sizes="(max-width: 640px) 30vw, 15vw"
                        className="object-cover"
                      />
                      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent p-2 text-[10px] font-semibold leading-3 text-white">
                        {dish.name}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Recently added meals"
            title="New on the menu"
            description="The latest published meals from approved kitchens, newest first. Prices are set by the vendor and rechecked at checkout."
            action={{ label: "See the full menu", onClick: showMenu }}
          />

          {recentMeals.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {recentMeals.map((meal) => (
                <article
                  key={`recent-${meal.id}`}
                  className="group flex flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(124,45,18,0.12)]"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-orange-50">
                    {meal.image ? (
                      <Image src={meal.image} alt={meal.name} fill unoptimized sizes="(max-width: 1024px) 45vw, 23vw" className="object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-xs font-medium text-orange-800">
                        Food photo not yet uploaded
                      </div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm">
                      New
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="truncate text-base font-bold text-slate-950">{meal.name}</h3>
                    <p className="truncate text-xs text-slate-500">{meal.vendor}</p>
                    <p className="mt-2 text-sm font-black text-orange-600">GHS {meal.price}</p>
                    <button
                      type="button"
                      onClick={() => focusVendor(meal.vendorId)}
                      className="mt-3 w-full rounded-full bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 sm:text-sm"
                    >
                      Order
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              {marketplaceLoading
                ? "Loading the latest meals…"
                : marketplaceError || "No meals have been published yet. New dishes appear here as approved kitchens publish them."}
            </p>
          )}
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[32px] bg-slate-950">
            <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative z-10 p-7 sm:p-11">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Explore and order</p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
                  Your next Ghanaian meal is one order away
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Browse authentic dishes, pick your portion and order from approved kitchens. Pay by mobile money, wallet or cash on delivery, and track every step.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={showDishes}
                    className="rounded-full bg-orange-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
                  >
                    Explore dishes
                  </button>
                  <button
                    type="button"
                    onClick={showMenu}
                    className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/60"
                  >
                    Order a meal
                  </button>
                </div>
              </div>
              <div className="relative min-h-[260px] lg:min-h-full">
                <Image
                  src="/images/dishes/jollof-grilled-tilapia.webp"
                  alt="Ghanaian jollof rice served with grilled tilapia"
                  fill
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/50 to-transparent lg:from-slate-950 lg:via-slate-950/20" />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 rounded-[32px] border border-orange-100 bg-white p-6 shadow-[0_20px_60px_rgba(124,45,18,0.08)] sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                <figure className="relative col-span-2 aspect-[16/10] overflow-hidden rounded-[22px]">
                  <Image
                    src="/images/dishes/wakye-leaves.webp"
                    alt="Waakye served with spaghetti, fish, plantain and egg"
                    fill
                    sizes="(max-width: 1024px) 90vw, 400px"
                    className="object-cover"
                  />
                </figure>
                <figure className="relative aspect-square overflow-hidden rounded-[20px]">
                  <Image
                    src="/images/dishes/kelewele-groundnut.webp"
                    alt="Kelewele served with roasted groundnuts"
                    fill
                    sizes="(max-width: 1024px) 45vw, 200px"
                    className="object-cover"
                  />
                </figure>
                <figure className="relative aspect-square overflow-hidden rounded-[20px]">
                  <Image
                    src="/images/dishes/ga-kenkey.webp"
                    alt="Ga kenkey served with fish and pepper"
                    fill
                    sizes="(max-width: 1024px) 45vw, 200px"
                    className="object-cover"
                  />
                </figure>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Eatry Hub, simply</p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-slate-950 sm:text-4xl">How ordering works</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                Every kitchen on Eatry Hub is an approved vendor. Prices and availability are checked again at checkout, so the meal you order is the meal the kitchen prepares.
              </p>

              <ol className="mt-7 space-y-5" id="how-it-works">
                {howItWorks.map((item) => (
                  <li key={item.step} className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xs font-black text-orange-700">
                      {item.step}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-950 sm:text-base">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={showMenu}
                  className="rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
                >
                  Start an order
                </button>
                <Link
                  href="/register"
                  className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-orange-300 hover:text-orange-700"
                >
                  Create an account
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <OfferCard
              label="Pickup"
              title="Collect free from the kitchen"
              body="Choose pickup at checkout and skip the GHS 50 delivery fee entirely."
            />
            <OfferCard
              label="Payment"
              title="Mobile money, wallet or cash"
              body="Pay by MTN or Telecel mobile money, your Eatry Hub wallet balance, or cash on delivery."
            />
            <OfferCard
              label="Tracking"
              title="Follow every order status"
              body="Track with the secure link from checkout, or with your order number and checkout phone."
            />
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[32px] bg-slate-950">
            <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative z-10 p-7 sm:p-11">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">For vendors</p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
                  Put your kitchen in front of Accra
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Create a storefront, publish your menu, manage orders and payouts, and reach customers who are already searching for food near them.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/vendor-signup"
                    className="rounded-full bg-orange-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
                  >
                    Become a vendor
                  </Link>
                  <Link
                    href="/login"
                    className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/60"
                  >
                    Vendor sign in
                  </Link>
                </div>
              </div>
              <div className="relative min-h-[260px] lg:min-h-full">
                <Image
                  src="/images/dishes/fried-rice-fish.webp"
                  alt="Fried rice served with fish"
                  fill
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/50 to-transparent lg:from-slate-950 lg:via-slate-950/20" />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 rounded-[32px] border border-slate-200/80 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="relative mx-auto w-full max-w-[280px]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[36px] border-[10px] border-slate-950 bg-[#fffaf4] shadow-[0_30px_70px_rgba(15,23,42,0.28)]">
                <div className="flex items-center justify-between px-3 pb-2 pt-4">
                  <Image src="/brand/logo-mark.svg" alt="" width={22} height={22} />
                  <span className="h-1.5 w-10 rounded-full bg-slate-300" />
                </div>
                <div className="relative mx-2 h-[74%] overflow-hidden rounded-2xl">
                  <Image
                    src="/images/dishes/jollof-fish-plantain.webp"
                    alt="Jollof rice served with fried fish and plantain"
                    fill
                    sizes="260px"
                    className="object-cover"
                  />
                </div>
                <div className="absolute inset-x-3 bottom-3 rounded-xl bg-slate-950 px-3 py-2 text-center text-[11px] font-semibold text-white">
                  Order in your browser
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Mobile</p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-slate-950 sm:text-4xl">Eatry Hub in your pocket</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
                Eatry Hub is built for the phone first. Portrait food photography, large touch targets and a layout that never scrolls sideways — on Android, iPhone, tablet or desktop.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  "Responsive portrait layouts",
                  "Fast, optimised food photos",
                  "Cart saved on your device",
                  "Guest checkout in under a minute",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={showMenu}
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Browse the menu
                </button>
                <Link
                  href="/order-tracking"
                  className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-orange-300 hover:text-orange-700"
                >
                  Track an order
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="menu" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Fresh picks"
            title="Order something good"
            description="Live meals from approved kitchens. Prices and availability are rechecked by the server when you place your order."
          />

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                !selectedVendor && !selectedLocation && !search
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-300"
              }`}
            >
              All meals
            </button>
            {vendors.slice(0, 6).map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                onClick={() => { setSelectedVendor(selectedVendor === vendor.id ? "" : vendor.id); setSelectedLocation(""); setSearch(""); }}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  selectedVendor === vendor.id
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-orange-300"
                }`}
              >
                {vendor.name}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Popular dishes</span>
            {popularGhanaDishes.map((dish) => (
              <button
                key={`chip-${dish.slug}`}
                type="button"
                onClick={() => pickDish(dish.search)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  search === dish.search
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700"
                }`}
              >
                {dish.name}
              </button>
            ))}
          </div>

          {(selectedVendor || selectedLocation || search) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>
                Showing:{" "}
                {selectedVendor
                  ? vendors.find((vendor) => vendor.id === selectedVendor)?.name
                  : selectedLocation
                    ? `meals in ${selectedLocation}`
                    : search}
              </span>
              <button type="button" onClick={clearFilters} className="font-semibold text-orange-600 underline">
                Clear filters
              </button>
            </div>
          )}

          {marketplaceError && (
            <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {marketplaceError}
            </p>
          )}

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {filteredFoods.map((item) => (
              <article key={item.id} className="flex flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:shadow-[0_18px_44px_rgba(124,45,18,0.12)]">
                <div className="relative aspect-[4/3] overflow-hidden bg-orange-50">
                  {item.image ? (
                    <Image src={item.image} alt={item.name} fill unoptimized sizes="(max-width: 768px) 90vw, 25vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs font-medium text-orange-800">
                      Food photo not yet uploaded
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-950">{item.name}</h3>
                      <p className="truncate text-xs text-slate-500">{item.vendor}</p>
                    </div>
                    <p className="shrink-0 text-base font-black text-orange-600">GHS {item.price}</p>
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{item.category}</span>
                    <span>{item.prepTime}</span>
                  </div>

                  {item.portions.length > 0 && (
                    <label className="mt-3 block space-y-1 text-[11px] font-semibold text-slate-600">
                      Portion size
                      <select
                        value={selectedPortions[item.id] ?? ""}
                        onChange={(event) => setSelectedPortions((current) => ({ ...current, [item.id]: event.target.value as "Small" | "Medium" | "Large" }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                      >
                        <option value="">Standard · GHS {item.price.toFixed(2)}</option>
                        {item.portions.map((portion) => (
                          <option key={portion.size} value={portion.size}>{portion.size} · GHS {portion.price.toFixed(2)}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <button
                    onClick={() => addToCart(item, selectedPortions[item.id])}
                    className="mt-3 w-full rounded-full bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-700 sm:text-sm"
                  >
                    Add to cart
                  </button>
                </div>
              </article>
            ))}
          </div>

          {filteredFoods.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">
                {marketplaceLoading
                  ? "Loading available meals…"
                  : search
                    ? `No published meals match “${search}” right now. Try another dish or clear the filters.`
                    : "No published meals match these filters. Try another kitchen or clear the filters."}
              </p>
              {!marketplaceLoading && (search || selectedVendor || selectedLocation) && (
                <button type="button" onClick={clearFilters} className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">
                  Show all meals
                </button>
              )}
            </div>
          )}
        </section>

        <section id="checkout" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] sm:p-7">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Checkout</p>
                  <h2 className="mt-2 font-display text-3xl text-slate-950">Your order</h2>
                </div>
                <div className="rounded-full bg-orange-50 px-3.5 py-1.5 text-sm font-semibold text-orange-700">
                  {cartQuantity} {cartQuantity === 1 ? "item" : "items"}
                </div>
              </div>

              <div className="space-y-4">
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  Checkout option
                  <select
                    value={checkoutMode}
                    onChange={(event) => handleCheckoutModeChange(event.target.value as "ACCOUNT" | "GUEST")}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300"
                  >
                    {account && <option value="ACCOUNT">Use my customer account</option>}
                    <option value="GUEST">Continue as a guest</option>
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  {checkoutMode === "GUEST" ? (
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Your name
                      <input required minLength={2} maxLength={120} value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Name for this order" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300" />
                    </label>
                  ) : (
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Customer name
                      <input value={account?.fullName ?? ""} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 outline-none" />
                    </label>
                  )}
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    {deliveryMode === "DELIVERY" ? "Delivery contact phone (vendor will call)" : "Phone number"}
                    <input
                      required
                      minLength={7}
                      maxLength={32}
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300"
                    />
                  </label>
                  {checkoutMode === "GUEST" && (
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Email {deliveryMode === "DELIVERY" || paymentMethod === "MOBILE_MONEY" ? "(for delivery and payment updates)" : "(optional)"}
                      <input
                        type="email"
                        required={deliveryMode === "DELIVERY" || paymentMethod === "MOBILE_MONEY"}
                        maxLength={254}
                        value={guestEmail}
                        onChange={(event) => setGuestEmail(event.target.value)}
                        placeholder="name@example.com"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300"
                      />
                    </label>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Delivery type
                    <select
                      value={deliveryMode}
                      onChange={(event) => setDeliveryMode(event.target.value as "DELIVERY" | "PICKUP")}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300"
                    >
                      <option value="DELIVERY">Delivery</option>
                      <option value="PICKUP">Pickup</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Payment method
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as "WALLET" | "MOBILE_MONEY" | "CASH_ON_DELIVERY")}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300"
                    >
                      {checkoutMode === "ACCOUNT" && account && <option value="WALLET">Account balance (GHS {walletBalance.toFixed(2)})</option>}
                      <option value="MOBILE_MONEY" disabled={!mobileMoneyDestinations}>Mobile Money (manual verification)</option>
                      <option value="CASH_ON_DELIVERY">Cash on delivery</option>
                    </select>
                  </label>
                </div>
                {deliveryMode === "DELIVERY" && (
                  <div className="space-y-4">
                    <label className="block space-y-2 text-sm font-medium text-slate-700">
                      Delivery address
                      <textarea required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-orange-300" />
                    </label>
                    <label className="block space-y-2 text-sm font-medium text-slate-700">
                      Delivery fee · GHS 50
                      <select value={deliveryFeePayment} onChange={(event) => setDeliveryFeePayment(event.target.value as "UPFRONT" | "ON_DELIVERY")} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <option value="UPFRONT">Pay delivery fee upfront</option>
                        <option value="ON_DELIVERY">Pay delivery fee on delivery</option>
                      </select>
                    </label>
                  </div>
                )}
                {paymentMethod === "MOBILE_MONEY" && (
                  <div className="grid gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:grid-cols-2">
                    {mobileMoneyDestinations ? (
                      <>
                        <p className="text-sm text-slate-700 sm:col-span-2">Send the order total to the official receiving number below, then enter your transfer details. An administrator will verify the payment before the order is approved.</p>
                        <label className="space-y-2 text-sm font-medium text-slate-700">
                          Receiving network
                          <select value={senderNetwork} onChange={(event) => setSenderNetwork(event.target.value as MobileMoneyNetwork)} className="w-full rounded-2xl border border-orange-200 bg-white px-3 py-3">
                            <option value="MTN">MTN Mobile Money</option>
                            <option value="TELECEL">Telecel Cash</option>
                          </select>
                        </label>
                        <div className="rounded-2xl bg-white p-3 text-sm">
                          <p className="text-slate-500">Send to</p>
                          <p className="font-bold">{mobileMoneyDestinations[senderNetwork].accountName}</p>
                          <p className="font-bold">{mobileMoneyDestinations[senderNetwork].accountNumber}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-amber-900 sm:col-span-2">Mobile Money receiving details are not configured. Choose cash on delivery or contact support. Do not send money to an unverified number.</p>
                    )}
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Transaction ID
                      <input required minLength={3} maxLength={100} value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Sender name
                      <input required minLength={2} maxLength={120} value={senderName} onChange={(event) => setSenderName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Sender mobile number
                      <input required minLength={7} maxLength={32} value={senderMobileNumber} onChange={(event) => setSenderMobileNumber(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" />
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-3">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                    No items yet — add a few meals to begin checkout.
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.cartKey || item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      {item.image ? (
                        <Image src={item.image} alt={item.name} width={56} height={56} unoptimized className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <div aria-label="Food photo not yet uploaded" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-center text-[9px] text-orange-800">
                          No photo
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{item.name}{item.portionSize ? ` (${item.portionSize})` : ""}</p>
                        <p className="text-xs text-slate-500">{item.vendor}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(item.cartKey || item.id, -1)} className="h-8 w-8 rounded-full bg-white text-lg text-slate-700 shadow-sm">−</button>
                        <span className="min-w-6 text-center text-sm font-semibold text-slate-700">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.cartKey || item.id, 1)} className="h-8 w-8 rounded-full bg-white text-lg text-slate-700 shadow-sm">+</button>
                      </div>
                      <p className="text-sm font-bold text-slate-900">GHS {item.price * item.quantity}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Subtotal</span>
                  <span>GHS {cartTotal}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
                  <span>Delivery</span>
                  <span>{deliveryMode === "DELIVERY" ? `GHS 50${deliveryFeePayment === "ON_DELIVERY" ? " · due on delivery" : ""}` : "GHS 0"}</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-lg font-black">
                  <span>Total</span>
                  <span>GHS {cartTotal + (deliveryMode === "DELIVERY" && deliveryFeePayment === "UPFRONT" ? 50 : 0)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={placingOrder || marketplaceLoading}
                className="mt-6 w-full rounded-full bg-orange-600 px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-700 disabled:opacity-60"
              >
                {placingOrder ? "Placing order…" : "Place order now"}
              </button>
              {!account && (
                <Link href="/login" className="mt-3 flex w-full items-center justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-600">
                  Sign in to use your customer wallet
                </Link>
              )}
              <p role="status" className="mt-3 text-sm text-slate-500">{notice}</p>
            </div>

            <aside className="space-y-6">
              <div className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Order tracking</p>
                <h3 className="mt-2 text-2xl font-black text-slate-950">Track an order</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {trackingToken
                    ? "Using the secure tracking link from your checkout. Enter an order number below to switch back to order-number tracking."
                    : "Enter the order number and checkout phone number to see the latest status."}
                </p>
                <form onSubmit={handleTrackOrder} className="mt-4 space-y-3">
                  <label className="block space-y-1 text-sm font-medium text-slate-700">
                    Order number
                    <input
                      minLength={6}
                      maxLength={40}
                      required={!trackingToken}
                      value={trackingOrderNumber}
                      onChange={(event) => {
                        setTrackingOrderNumber(event.target.value);
                        setTrackingToken("");
                      }}
                      placeholder="EH-..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium text-slate-700">
                    Phone number used at checkout
                    <input
                      minLength={7}
                      maxLength={32}
                      required={!trackingToken}
                      value={trackingPhone}
                      onChange={(event) => {
                        setTrackingPhone(event.target.value);
                        setTrackingToken("");
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                    />
                  </label>
                  <button disabled={trackingLoading} className="w-full rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {trackingLoading ? "Looking up order…" : "Track order"}
                  </button>
                </form>
                {trackingError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{trackingError}</p>}
                {trackedOrder && (
                  <div className="mt-4 space-y-3 rounded-2xl bg-orange-50 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-bold text-orange-700">{trackedOrder.orderNumber}</p><p className="text-slate-600">{trackedOrder.customerName}</p></div>
                      <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-800">{trackedOrder.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="text-slate-700">Payment: {trackedOrder.paymentStatus.replaceAll("_", " ")} · {trackedOrder.paymentMethod.replaceAll("_", " ")}</p>
                    <p className="font-semibold text-slate-900">Total: {trackedOrder.currency} {trackedOrder.total.toFixed(2)}</p>
                    <ul className="space-y-2 border-t border-orange-200 pt-3">
                      {trackedOrder.vendors.map((vendor) => <li key={vendor.name} className="flex justify-between gap-2"><span>{vendor.name}</span><span className="font-medium">{vendor.status.replaceAll("_", " ")}</span></li>)}
                    </ul>
                    {trackedOrder.updates.length > 0 && (
                      <ol className="space-y-2 border-t border-orange-200 pt-3">
                        {trackedOrder.updates.map((update, index) => (
                          <li key={`${update.createdAt}-${index}`}>
                            <p className="font-semibold">{update.status.replaceAll("_", " ")}</p>
                            {update.note && <p className="text-slate-600">{update.note}</p>}
                            <time className="text-xs text-slate-500">{new Date(update.createdAt).toLocaleString()}</time>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Latest order</p>
                <h3 className="mt-2 text-2xl font-black text-slate-950">Your recent activity</h3>
                {orderSummary ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-orange-50 p-3 text-sm text-slate-700">
                      <p className="font-bold text-orange-600">{orderSummary.orderId}</p>
                      <p className="mt-1">Customer: {orderSummary.customer}</p>
                      <p>Payment: {orderSummary.paymentMethod}</p>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between"><span>Status</span><span className={`font-semibold ${orderSummary.status === "Paid" ? "text-green-600" : "text-amber-700"}`}>{orderSummary.status}</span></div>
                      <div className="flex items-center justify-between"><span>Vendor split</span><span className="font-semibold">{orderSummary.vendors.length}</span></div>
                      <div className="flex items-center justify-between"><span>Total</span><span className="font-semibold">GHS {orderSummary.amount}</span></div>
                    </div>
                    <Link href="/customer-dashboard" className="flex w-full items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
                      View account orders
                    </Link>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    Confirm an order to generate a unique tracking number.
                  </div>
                )}
              </div>

              <div className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Accounts</p>
                <h3 className="mt-2 text-2xl font-black text-slate-950">Choose your account</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Customers and vendors get separate sign-up flows, secure sign-in, and their own dashboard.
                </p>
                <div className="mt-5 grid gap-3">
                  <Link href="/register" className="flex w-full items-center justify-center rounded-full bg-orange-600 px-4 py-3 font-semibold text-white transition hover:bg-orange-700">
                    Create customer account
                  </Link>
                  <Link href="/vendor-signup" className="flex w-full items-center justify-center rounded-full bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800">
                    Register your business
                  </Link>
                  <Link href="/login" className="text-center text-sm font-semibold text-slate-600 hover:text-orange-600">
                    Already have an account? Sign in
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section id="subscriptions" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Membership</p>
            <h2 className="mt-3 font-display text-3xl text-slate-950 sm:text-4xl">Vendor subscription plans</h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {subscriptionPlans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-[30px] border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ${
                  plan.popular ? "border-orange-200 bg-orange-50" : "border-slate-200/80 bg-white"
                }`}
              >
                <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] ${plan.accent}`}>
                  {plan.popular ? "Most popular" : "Flexible"}
                </div>

                <h3 className="mt-5 text-2xl font-black text-slate-950">{plan.name}</h3>
                <p className="mt-2 text-sm text-slate-500">{plan.description}</p>

                <div className="mt-6 flex items-end gap-1">
                  <span className="text-4xl font-black text-slate-950">{plan.price}</span>
                  <span className="pb-1 text-sm text-slate-500">/ month</span>
                </div>

                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  aria-pressed={selectedPlan === plan.name}
                  onClick={() => {
                    setSelectedPlan(plan.name);
                    setNotice(`${plan.name} plan selected. Continue vendor registration to finish setup.`);
                  }}
                  className={`mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold transition ${
                    selectedPlan === plan.name
                      ? "bg-emerald-600 text-white"
                      : plan.popular
                        ? "bg-orange-600 text-white hover:bg-orange-700"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {selectedPlan === plan.name ? "Selected" : "Choose plan"}
                </button>
              </div>
            ))}
          </div>
          {selectedPlan && (
            <p className="mt-4 text-center text-sm text-emerald-700" role="status">
              {selectedPlan} plan selected. <Link className="font-semibold underline" href={`/vendor-signup?plan=${encodeURIComponent(selectedPlan)}`}>Continue vendor registration</Link>
            </p>
          )}
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[32px] bg-slate-950">
            <div className="grid gap-px bg-white/10 sm:grid-cols-3">
              {[
                { value: menuItems.length, label: "Meals available now" },
                { value: vendors.length, label: "Approved kitchens" },
                { value: vendorLocations.length, label: "Areas covered" },
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-950 px-6 py-8 text-center">
                  <p className="text-3xl font-black text-white sm:text-4xl">{stat.value || "—"}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Figures update live from approved vendors and published meals. Customer reviews are not shown until verified review data is available.
          </p>
        </section>
      </main>

      <footer className="mt-20 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <Image src="/brand/logo-mark.svg" alt="" width={38} height={38} />
                <span className="text-base font-black uppercase tracking-[0.16em] text-slate-950">Eatry Hub</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-600">
                A Ghanaian food marketplace connecting approved Accra kitchens with customers who want a proper meal, delivered or ready for pickup.
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Food photography: Wikimedia Commons contributors, free under Creative Commons licences.{" "}
                <a href="/images/dishes/attribution.json" className="underline hover:text-orange-600">Dish credits</a>
                {" · "}
                <a href="/images/ghana/attribution.json" className="underline hover:text-orange-600">Pexels credits</a>
              </p>
            </div>

            <FooterColumn
              title="Explore"
              links={[
                { label: "Popular Ghanaian dishes", href: "#dishes" },
                { label: "Food categories", href: "#categories" },
                { label: "Traditional meals", href: "#traditional" },
                { label: "Full menu", href: "#menu" },
                { label: "Track an order", href: "/order-tracking" },
              ]}
            />

            <FooterColumn
              title="For vendors"
              links={[
                { label: "Become a vendor", href: "/vendor-signup" },
                { label: "Vendor sign in", href: "/login" },
                { label: "Subscription plans", href: "#subscriptions" },
                { label: "Vendor dashboard", href: "/vendor-dashboard" },
              ]}
            />

            <FooterColumn
              title="Account"
              links={[
                { label: "Create account", href: "/register" },
                { label: "Customer sign in", href: "/login" },
                { label: "Customer dashboard", href: "/customer-dashboard" },
                { label: "Admin sign in", href: "/admin/login" },
              ]}
            />
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row">
            <p>© {copyrightYear ?? ""} Eatry Hub. All rights reserved.</p>
            <p>Built for Ghanaian kitchens and the people who eat with them.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">{eyebrow}</p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-slate-950 sm:text-4xl">{title}</h2>
        {description && <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-orange-300 hover:text-orange-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function DishCard({
  dish,
  live,
  priority,
  onExplore,
}: {
  dish: GhanaDish;
  live: boolean;
  priority: boolean;
  onExplore: () => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(124,45,18,0.14)]">
      <div className="relative aspect-[4/5] overflow-hidden bg-orange-50">
        <Image
          src={dish.image}
          alt={dish.name}
          fill
          priority={priority}
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
          className="object-cover transition duration-700 group-hover:scale-105"
        />
        {live && (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm">
            Available
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">{dish.name}</h3>
        <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-orange-600">{dish.category}</p>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{dish.blurb}</p>
        <button
          type="button"
          onClick={onExplore}
          className="mt-3 w-full rounded-full border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-800 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 sm:text-xs"
        >
          {live ? "Order" : "Explore"}
        </button>
      </div>
    </article>
  );
}

function OfferCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <article className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-600">{label}</p>
      <h3 className="mt-2 text-lg font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </article>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-900">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href} className="text-sm text-slate-600 transition hover:text-orange-600">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
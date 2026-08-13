import type { LucideIcon } from "lucide-react";
import {
  BarChart,
  BarChart2,
  BookOpen,
  Building2,
  Calendar,
  Car,
  DollarSign,
  FileText,
  Gift,
  History,
  LayoutDashboard,
  Map,
  MapPin,
  MessageSquare,
  Plus,
  Settings,
  Smartphone,
  Tag,
  User,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Sidebar navigation for every portal.
 *
 * These lists used to be copy-pasted into each page, which meant 35 separate
 * definitions that drifted apart: the admin sidebar differed on all 17 of its
 * pages, and /admin — the first screen an administrator sees — was missing four
 * entries entirely (Extras & Routes, Corporate Accounts, Driver App, Geo Zones),
 * so those sections were simply unreachable from there. Defining them once means
 * adding a section updates every page at the same time.
 */

export interface PortalNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const adminNavItems: PortalNavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Driver App", href: "/admin/driver-app", icon: Smartphone },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Geo Zones", href: "/admin/geo-zones", icon: MapPin },
  { label: "Extras & Routes", href: "/admin/extras", icon: Tag },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Affiliates", href: "/admin/affiliates", icon: Gift },
  { label: "Corporate Accounts", href: "/admin/corporate-accounts", icon: Building2 },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const corporateNavItems: PortalNavItem[] = [
  { label: "Dashboard", href: "/corporate/dashboard", icon: LayoutDashboard },
  { label: "Book a Trip", href: "/corporate/book", icon: Plus },
  { label: "All Bookings", href: "/corporate/bookings", icon: BookOpen },
  { label: "Profile", href: "/corporate/profile", icon: User },
];

export const driverNavItems: PortalNavItem[] = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "Finished", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Stats", href: "/driver/stats", icon: BarChart2 },
  { label: "Documents", href: "/driver/documents", icon: FileText },
  { label: "Vehicles", href: "/driver/vehicles", icon: Car },
  { label: "Profile", href: "/driver/profile", icon: User },
];

export const passengerNavItems: PortalNavItem[] = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Reports", href: "/passenger/reports", icon: BarChart2 },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

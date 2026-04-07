import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalLayoutProps {
  children: React.ReactNode;
  navItems: { label: string; href: string; icon: React.ElementType }[];
  title: string;
}

export function PortalLayout({ children, navItems, title }: PortalLayoutProps) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const NavContent = () => (
    <nav className="space-y-1 px-3">
      {navItems.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setDrawerOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] relative">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 lg:w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground flex-shrink-0">
        <div className="p-5 lg:p-6">
          <h2 className="font-serif text-xl lg:text-2xl font-semibold text-primary leading-tight">{title}</h2>
        </div>
        <NavContent />
      </aside>

      {/* Mobile Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-50 bg-sidebar border-r border-border flex flex-col transition-transform duration-300 md:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-serif text-xl font-semibold text-primary">{title}</h2>
          <button onClick={() => setDrawerOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <NavContent />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 bg-background min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar sticky top-0 z-30">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif text-base text-primary">{title}</span>
          <div className="w-9" />
        </div>
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}

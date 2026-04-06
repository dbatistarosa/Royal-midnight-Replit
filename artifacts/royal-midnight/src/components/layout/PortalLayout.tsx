import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface PortalLayoutProps {
  children: React.ReactNode;
  navItems: { label: string; href: string; icon: React.ElementType }[];
  title: string;
}

export function PortalLayout({ children, navItems, title }: PortalLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="p-6">
          <h2 className="font-serif text-2xl font-semibold text-primary">{title}</h2>
        </div>
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-background p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

import type { MouseEvent as ReactMouseEvent } from "react";
import { Gauge, LayoutGrid, Mic } from "lucide-react";
import "./AppTabBar.css";

export type AppTab = "home" | "builder" | "tuner";

interface AppTabBarProps {
  activeTab: AppTab;
  navigate: (pathname: string) => void;
}

const TABS = [
  { id: "home", label: "Record", href: "/", Icon: Mic },
  { id: "builder", label: "Builder", href: "/builder", Icon: LayoutGrid },
  { id: "tuner", label: "Tuner", href: "/tuner", Icon: Gauge },
] as const satisfies readonly { id: AppTab; label: string; href: string; Icon: typeof Mic }[];

export function AppTabBar({ activeTab, navigate }: AppTabBarProps) {
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    // Let modified clicks open a new tab like a normal link.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    navigate(href);
  };

  return (
    <nav className="app-tab-bar" aria-label="Primary">
      {TABS.map(({ id, label, href, Icon }) => {
        const isActive = id === activeTab;

        return (
          <a
            key={id}
            href={href}
            className={`app-tab-bar__tab ${isActive ? "app-tab-bar__tab--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => handleClick(event, href)}
          >
            <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

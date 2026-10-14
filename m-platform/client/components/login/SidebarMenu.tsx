"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight,
  X,
  Building,
  Users,
  FileStack,
  Archive,
  FolderTree,
  GraduationCap,
  FlaskConical,
} from "lucide-react";
import { buildTestingStationLoginUrl } from "@/lib/login-station-constants";

// Color constants matching your login page
const PRIMARY_COLOR = '#10b981'; // Emerald green

type SidebarMenuProps = {
  /** Controlled open state. When provided, internal state is ignored. */
  open?: boolean;
  /** Notified whenever the sidebar requests an open/close change. */
  onOpenChange?: (open: boolean) => void;
  /** Show the built-in floating chevron trigger (hidden when an external
   *  control — e.g. the mobile hamburger — drives the sidebar). */
  showTrigger?: boolean;
};

export default function SidebarMenu({
  open,
  onOpenChange,
  showTrigger = true,
}: SidebarMenuProps = {}) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const menuItems: {
    id: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    href?: string;
  }[] = [
    {
      id: "testing-fris",
      label: "Testing FRIS",
      icon: <FlaskConical className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-amber-500",
      href: buildTestingStationLoginUrl(),
    },
    {
      id: "corporate",
      label: "Corporate Login",
      icon: <Building className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-emerald-500",
    },
    {
      id: "customer",
      label: "Customer",
      icon: <Users className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-emerald-500",
    },
    {
      id: "document-management",
      label: "Document Management System",
      icon: <FileStack className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-emerald-500",
    },
    {
      id: "historical",
      label: "Historical Data (Before March 2023)",
      icon: <Archive className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-emerald-500",
    },
    {
      id: "management",
      label: "Management Documents",
      icon: <FolderTree className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-emerald-500",
    },
    {
      id: "training",
      label: "Training Documents",
      icon: <GraduationCap className="w-6 h-6 md:w-7 md:h-7 text-white" />,
      color: "from-emerald-500",
    },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // Ignore the external toggle (mobile hamburger) so it can close the
      // sidebar via its own handler without an immediate reopen.
      if ((target as Element)?.closest?.('[data-sidebar-toggle]')) return;
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen]);

  return (
    <div
      ref={sidebarRef}
      className={`fixed top-0 left-0 h-full z-50 ${isOpen ? "" : "pointer-events-none"}`}
    >
      {/* Floating Chevron Button (ONLY WHEN CLOSED) */}
      {showTrigger && !isOpen && (
        <button
          aria-label="Open sidebar"
          onClick={() => setIsOpen(true)}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full pointer-events-auto
                     bg-black/70 backdrop-blur-sm
                     border hover:border-emerald-400
                     transition-all duration-300 hover:scale-105 shadow-lg group"
          style={{
            borderColor: `${PRIMARY_COLOR}40`,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            boxShadow: `0 10px 25px ${PRIMARY_COLOR}20`
          }}
        >
          <div className="relative">
            <ChevronRight 
              className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300"
              style={{ color: PRIMARY_COLOR }}
            />
          </div>
        </button>
      )}

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 pointer-events-auto"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-[85%] max-w-md
                   bg-[#05070f]/95 backdrop-blur-xl z-40 overflow-hidden pointer-events-auto
                    transition-transform duration-300 ease-out border-r
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          borderColor: `${PRIMARY_COLOR}30`,
          boxShadow: `4px 0 30px ${PRIMARY_COLOR}20`
        }}
      >
        

        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close sidebar"
          className="absolute top-4 right-4 z-50 p-2.5 rounded-full
                     hover:scale-105 transition-all duration-200 shadow-lg group"
          style={{
            backgroundColor: `${PRIMARY_COLOR}30`,
            borderColor: `${PRIMARY_COLOR}40`,
          }}
        >
          <X 
            className="w-4 h-4" 
            style={{ color: PRIMARY_COLOR }}
          />
        </button>

        {/* Sidebar Content */}
        <div className="h-full p-2 md:p-4 overflow-y-auto flex flex-col justify-center space-y-1 md:space-y-2 mt-4">
          {menuItems.map((item) => {
            const rowClassName =
              "w-full flex items-center gap-2 md:gap-3 p-1 md:p-2 rounded-lg md:rounded-xl transition-all duration-200 group hover:translate-x-1 relative hover:bg-black/40";
            const rowStyle = {
              border: `1px solid ${PRIMARY_COLOR}10`,
              backgroundColor: hoveredItem === item.id ? `${PRIMARY_COLOR}15` : 'transparent',
            };

            const rowContent = (
              <>
                <div
                  className="absolute inset-0 rounded-lg md:rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(90deg, ${PRIMARY_COLOR}10, transparent)`,
                  }}
                />
                <div
                  className={`relative p-2.5 md:p-3 rounded-lg shadow-md z-10 transition-all duration-200 ${
                    hoveredItem === item.id ? "scale-105" : ""
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${PRIMARY_COLOR}, ${PRIMARY_COLOR}E6)`,
                    boxShadow: `0 4px 15px ${PRIMARY_COLOR}40`,
                  }}
                >
                  {item.icon}
                </div>
                <span
                  className="text-white font-medium text-sm md:text-base transition-colors duration-300 flex-1 text-left z-10"
                  style={{
                    color: hoveredItem === item.id ? PRIMARY_COLOR : '#ffffff',
                  }}
                >
                  {item.label}
                </span>
                <ChevronRight
                  className="w-3 h-3 md:w-4 md:h-4 transition-all duration-300 group-hover:translate-x-0.5 z-10"
                  style={{
                    color: hoveredItem === item.id ? PRIMARY_COLOR : '#9ca3af',
                  }}
                />
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={() => setIsOpen(false)}
                  className={rowClassName}
                  style={rowStyle}
                >
                  {rowContent}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => setIsOpen(false)}
                className={rowClassName}
                style={rowStyle}
              >
                {rowContent}
              </button>
            );
          })}
        </div>

       
      </div>
    </div>
  );
}
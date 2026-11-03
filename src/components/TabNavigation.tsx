"use client";

import React from "react";
import {
  Search,
  FileSpreadsheet,
  Users,
  BarChart3,
  Lock,
  Coins,
  GraduationCap,
  Terminal,
} from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { UserRole } from "@/lib/db/schema";

export type TabKey = "verify" | "search" | "inventory" | "classes" | "teams" | "analytics" | "logs";

export interface TabConfig {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge: string | null;
  allowedRoles: readonly UserRole[];
}

export const ALL_TABS: readonly TabConfig[] = [
  {
    key: "verify",
    label: "Vérification des Licences",
    icon: FileSpreadsheet,
    active: true,
    badge: "Cœur",
    allowedRoles: ["superadmin", "director"],
  },
  {
    key: "search",
    label: "Recherche FFE",
    icon: Search,
    active: true,
    badge: null,
    allowedRoles: ["superadmin", "director", "coach", "secretary"],
  },
  {
    key: "inventory",
    label: "Inventaire & Finances",
    icon: Coins,
    active: true,
    badge: "v1.2",
    allowedRoles: ["superadmin", "director", "secretary"],
  },
  {
    key: "classes",
    label: "Cours & Entraînements",
    icon: GraduationCap,
    active: true,
    badge: "v1.2",
    allowedRoles: ["superadmin", "director", "coach"],
  },
  {
    key: "teams",
    label: "Gestion des Équipes",
    icon: Users,
    active: false,
    badge: "Bientôt disponible",
    allowedRoles: ["superadmin", "director", "coach"],
  },
  {
    key: "analytics",
    label: "Analytique & Statistiques Club",
    icon: BarChart3,
    active: true,
    badge: "Directeur",
    allowedRoles: ["superadmin", "director"],
  },
  {
    key: "logs",
    label: "Logs & Audit Système",
    icon: Terminal,
    active: true,
    badge: "Admin",
    allowedRoles: ["superadmin"],
  },
] as const;

/**
 * Retourne la liste filtrée des onglets autorisés pour un rôle donné
 */
export function getAllowedTabsForRole(role?: string | null): TabConfig[] {
  const allowed = !role
    ? ALL_TABS.filter((t) => t.key === "verify" || t.key === "search")
    : ALL_TABS.filter((tab) => tab.allowedRoles.includes(role as UserRole));

  return allowed.map((tab) => {
    if (tab.key === "classes") {
      return {
        ...tab,
        label: role === "coach" ? "Mes Cours & Entraînements" : "Cours & Entraînements",
      };
    }
    return tab;
  });
}

/**
 * Retourne l'onglet recommandé par défaut selon le rôle
 */
export function getDefaultTabForRole(role?: string | null): TabKey {
  if (role === "secretary") return "inventory";
  if (role === "coach") return "classes";
  return "verify";
}

interface TabNavigationProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  userRole?: string | null;
}

export function TabNavigation({ activeTab, onTabChange, userRole }: TabNavigationProps) {
  const { data: session } = useSession();
  const currentRole = userRole !== undefined ? userRole : session?.user?.role;
  const visibleTabs = getAllowedTabsForRole(currentRole);

  return (
    <nav className="w-full no-print" aria-label="Navigation principale">
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl glass-card max-w-full overflow-x-auto scrollbar-none shadow-sm">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          const isEnabled = tab.active;

          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 transform ${
                isSelected
                  ? "bg-marseille-500 text-white shadow-md shadow-marseille-500/25 scale-[1.01]"
                  : isEnabled
                  ? "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                  : "text-slate-400 dark:text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 opacity-75"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isSelected ? "text-white" : isEnabled ? "text-marseille-500 dark:text-sky-400" : "text-slate-400"
                }`}
              />
              <span>{tab.label}</span>

              {tab.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : isEnabled
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                      : "bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-1"
                  }`}
                >
                  {!isEnabled && <Lock className="w-2.5 h-2.5" />}
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

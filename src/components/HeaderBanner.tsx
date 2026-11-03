"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  RefreshCw,
  Moon,
  Sun,
  Info,
  Users,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Shield,
  Crown,
  GraduationCap,
  FileSpreadsheet,
} from "lucide-react";
import { SyncExplanationModal } from "./SyncExplanationModal";
import { useSession, signOut } from "@/lib/auth/client";
import { hasPermission } from "@/lib/auth/permissions";

interface ClubStatusData {
  clubCode: string;
  clubName: string;
  totalMembers: number;
  lastSync: {
    status: string;
    playersSynced: number;
    durationMs: number;
    errorMessage: string | null;
    reason?: string;
    createdAt: string;
  } | null;
}

export function HeaderBanner() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<ClubStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  // Initialisation du thème depuis localStorage ou système
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = savedTheme ? savedTheme === "dark" : prefersDark;

    setIsDark(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Chargement des données du club
  const fetchClubStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/club/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Ignorer l'erreur au chargement initial
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClubStatus();
  }, []);

  // Déclenchement de la synchronisation manuelle
  const handleSyncClub = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/cron/sync-club", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.status === "PARTIAL") {
          setFeedback({
            type: "warning",
            message: `Synchronisation partielle : ${data.playersSynced} licenciés enregistrés (${data.missingPages?.length || 0} page(s) FFE en timeout).`,
          });
        } else {
          setFeedback({
            type: "success",
            message: `${data.playersSynced || data.playersCount || "Tous les"} licenciés synchronisés avec succès (${((data.durationMs || 0) / 1000).toFixed(1)}s).`,
          });
        }
        await fetchClubStatus();
      } else {
        setFeedback({
          type: "error",
          message: `Échec de la synchronisation : ${data.reason || data.error || "Erreur inconnue"}`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur de connexion";
      setFeedback({
        type: "error",
        message: `Erreur réseau : ${message}`,
      });
    } finally {
      setSyncing(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("recupffe:sync-completed"));
      }
      setTimeout(() => setFeedback(null), 8000);
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return "Jamais";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <>
      <header className="w-full glass-card border-b border-slate-200/80 dark:border-white/10 sticky top-0 z-40 shadow-sm backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          
          {/* Logo Marseille-Échecs & Titre */}
          <div className="flex items-center gap-3.5 group cursor-pointer">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-marseille-500 to-marseille-700 flex items-center justify-center p-1.5 shadow-md shadow-marseille-500/25 transition-transform duration-300 transform group-hover:scale-105">
              <Image
                src="/logo-blanc.png"
                alt="Logo Marseille-Échecs"
                width={36}
                height={36}
                className="w-full h-auto object-contain filter drop-shadow"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Marseille-Échecs
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  v1.2
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Boîte à outils & Gestion administrative
              </p>
            </div>
          </div>

          {/* Health Bar & Contrôles */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* État de synchronisation du club */}
            <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-marseille-500 dark:text-sky-400" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  {status ? `${status.totalMembers ?? (status as any).totalPlayers ?? 0} licenciés` : (loading ? "..." : "0 licencié")}
                </span>
              </div>

              <span className="w-px h-3.5 bg-slate-300 dark:bg-slate-700"></span>

              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    status?.lastSync?.status === "SUCCESS"
                      ? "bg-emerald-500 animate-pulse"
                      : status?.lastSync?.status === "FAILED"
                      ? "bg-rose-500"
                      : "bg-amber-400"
                  }`}
                />
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {status?.lastSync ? formatDate(status.lastSync.createdAt) : "Non synchronisé"}
                </span>
              </div>
            </div>

            {/* Bouton d'aide pédagogique sur la synchronisation */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-marseille-500 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all transform hover:scale-105"
              title="À quoi sert la synchronisation ?"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Bouton Synchroniser avec micro-animation (Réservé au Directeur et Superadmin) */}
            {hasPermission(session?.user?.role, "sync:execute") && (
              <button
                onClick={handleSyncClub}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-marseille-500 to-marseille-600 hover:from-marseille-600 hover:to-marseille-700 text-white shadow-sm shadow-marseille-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                title="Mettre à jour l'effectif complet du club depuis le serveur officiel FFE"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-sky-200" : ""}`} />
                <span>{syncing ? "Synchronisation..." : "Synchroniser"}</span>
              </button>
            )}

            {/* Utilisateur connecté & Rôle RBAC */}
            {session?.user && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm">
                  {session.user.role === "superadmin" && (
                    <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <Shield className="w-3.5 h-3.5 text-rose-500" />
                      Superadmin
                    </span>
                  )}
                  {session.user.role === "director" && (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                      Directeur
                    </span>
                  )}
                  {session.user.role === "coach" && (
                    <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                      <GraduationCap className="w-3.5 h-3.5 text-sky-500" />
                      Entraîneur
                    </span>
                  )}
                  {session.user.role === "secretary" && (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                      Secrétaire
                    </span>
                  )}
                  <span className="text-slate-400 font-normal hidden sm:inline">•</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium hidden sm:inline max-w-[120px] truncate">
                    {session.user.name || session.user.email}
                  </span>
                </div>

                {/* Bouton de déconnexion */}
                <button
                  onClick={async () => {
                    await signOut();
                    window.location.href = "/login";
                  }}
                  className="p-2 rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/60 transition-all transform hover:scale-105 active:scale-95"
                  title="Se déconnecter"
                  aria-label="Se déconnecter"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Switcher Day / Dark mode */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 transition-all transform hover:scale-105 active:scale-95"
              title={isDark ? "Passer en mode Jour" : "Passer en mode Nuit"}
              aria-label="Changer de thème"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
          </div>
        </div>

        {/* Toast ou Notification de feedback de synchronisation */}
        {feedback && (
          <div
            className={`w-full py-2 px-4 text-xs font-medium text-center transition-all ${
              feedback.type === "success"
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-t border-emerald-500/20"
                : feedback.type === "warning"
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-t border-amber-500/20"
                : "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-t border-rose-500/20"
            }`}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : feedback.type === "warning" ? (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              )}
              <span>{feedback.message}</span>
            </div>
          </div>
        )}
      </header>

      {/* Modale d'explication */}
      <SyncExplanationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

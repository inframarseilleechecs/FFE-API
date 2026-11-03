"use client";

import React, { useState, useEffect } from "react";
import {
  Terminal,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Database,
  Filter,
  Shield,
  Layers,
} from "lucide-react";

export interface SyncLogItem {
  id: number;
  clubCode: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  playersSynced: number;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

export function SystemLogsSection() {
  const [logs, setLogs] = useState<SyncLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "SUCCESS" | "PARTIAL" | "FAILED">("ALL");

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logs?limit=50");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de récupérer les journaux.");
      }
      setLogs(data.logs || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur de chargement des logs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const totalLogs = logs.length;
  const successCount = logs.filter((l) => l.status === "SUCCESS").length;
  const partialCount = logs.filter((l) => l.status === "PARTIAL").length;
  const failedCount = logs.filter((l) => l.status === "FAILED").length;

  const filteredLogs = logs.filter((log) => {
    if (filter === "ALL") return true;
    return log.status === filter;
  });

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête de la section */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              <span>Journal d&apos;Audit & Logs Système</span>
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <Shield className="w-3 h-3" />
              Superadmin
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Supervision en temps réel des synchronisations nocturnes et manuelles avec la FFE.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4 text-center space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Total Exécutions
          </span>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {totalLogs}
          </span>
        </div>

        <div className="glass-card rounded-xl p-4 text-center space-y-1 border-b-2 border-emerald-500">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Succès Complets
          </span>
          <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
            {successCount}
          </span>
        </div>

        <div className="glass-card rounded-xl p-4 text-center space-y-1 border-b-2 border-amber-500">
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block flex items-center justify-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Partiels (Fallback)
          </span>
          <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
            {partialCount}
          </span>
        </div>

        <div className="glass-card rounded-xl p-4 text-center space-y-1 border-b-2 border-rose-500">
          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Échecs Réseau
          </span>
          <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono">
            {failedCount}
          </span>
        </div>
      </div>

      {/* Tableau des logs */}
      <div className="glass-card rounded-2xl p-6 shadow-sm space-y-4">
        {/* Filtres par onglets */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filter === "ALL"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Tous ({totalLogs})
            </button>
            <button
              onClick={() => setFilter("SUCCESS")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filter === "SUCCESS"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              Succès ({successCount})
            </button>
            <button
              onClick={() => setFilter("PARTIAL")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filter === "PARTIAL"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              }`}
            >
              Partiels ({partialCount})
            </button>
            <button
              onClick={() => setFilter("FAILED")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filter === "FAILED"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              }`}
            >
              Échecs ({failedCount})
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date & Heure</th>
                <th className="py-3 px-3 text-center">Statut</th>
                <th className="py-3 px-3 font-mono">Club</th>
                <th className="py-3 px-3 text-right">Joueurs</th>
                <th className="py-3 px-3 text-right">Durée</th>
                <th className="py-3 px-4">Détails / Diagnostic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {loading ? "Chargement des journaux système..." : "Aucun log dans cette catégorie."}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {log.status === "SUCCESS" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> SUCCESS
                        </span>
                      )}
                      {log.status === "PARTIAL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                          <AlertCircle className="w-3 h-3" /> PARTIAL
                        </span>
                      )}
                      {log.status === "FAILED" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          <AlertTriangle className="w-3 h-3" /> FAILED
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {log.clubCode}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {log.playersSynced}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {(log.durationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      {log.errorMessage ? (
                        <span className="text-amber-700 dark:text-amber-300 font-mono text-[11px] block truncate max-w-md" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Synchronisation nominale complète</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

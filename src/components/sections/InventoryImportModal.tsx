"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  RefreshCw,
  Copy,
} from "lucide-react";
import { InventoryImportPreview } from "@/lib/parser/inventory_excel";
import {
  PreviewStatusFilter,
  filterPreviewRows,
  canConfirmImport,
} from "./inventory_ui_helpers";

interface InventoryImportModalProps {
  seasonYear: number;
  onClose: () => void;
  onImported: (result: { created: number; updated: number; skippedErrors: number }) => Promise<void>;
}

export function InventoryImportModal({
  seasonYear,
  onClose,
  onImported,
}: InventoryImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"upload" | "preview" | "done">("upload");
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [statusFilter, setStatusFilter] = useState<PreviewStatusFilter>("ALL");
  const [commitResult, setCommitResult] = useState<{
    created: number;
    updated: number;
    skippedErrors: number;
  } | null>(null);

  const handleFileSelected = async (file: File) => {
    setError(null);
    setLoading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "preview");
      formData.append("seasonYear", String(seasonYear));

      const res = await fetch("/api/inventory/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible d'analyser ce fichier.");
      }

      setPreview(data.preview);
      setStatusFilter("ALL");
      setPhase("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de lecture du fichier.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCommit = async () => {
    if (!preview || !canConfirmImport(preview)) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "commit",
          seasonYear,
          rows: preview.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'importation en base.");
      }
      const summary = {
        created: data.created,
        updated: data.updated,
        skippedErrors: data.skippedErrors,
      };
      setCommitResult(summary);
      setPhase("done");
      await onImported(summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur réseau pendant l'import.");
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = preview ? filterPreviewRows(preview.rows, statusFilter) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col glass-panel rounded-2xl shadow-2xl overflow-hidden">
        {/* Header Modale */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Importer une liste Excel / CSV — Année {seasonYear}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {phase === "upload" && "Étape 1/2 : Sélectionnez votre fichier (.xlsx, .xls ou .csv)"}
                {phase === "preview" &&
                  `Étape 2/2 : Prévisualisation obligatoire (${fileName}) — aucune écriture en base tant que vous ne confirmez pas`}
                {phase === "done" && "Importation terminée avec succès"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* PHASE 1 : UPLOAD */}
          {phase === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileSelected(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-2xl p-10 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/40"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <RefreshCw className="w-8 h-8 animate-spin" />
                    <span className="text-sm font-semibold">Analyse et prévisualisation en cours...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Upload className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Glissez-déposez votre fichier .xlsx ou .csv ici, ou cliquez pour parcourir
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg">
                      Colonnes détectées automatiquement : <strong>Prénom</strong>, <strong>Nom</strong> (ou <em>Nom &amp; Prénom</em>), <strong>Date de naissance</strong>, <strong>Paiement</strong>, <strong>Polo</strong>, <strong>Veste</strong>, <strong>Divers</strong>. Les équipements importés sont marqués <em>À remettre</em> par défaut.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PHASE 2 : PRE-VISUALIZER OBLIGATOIRE */}
          {phase === "preview" && preview && (
            <div className="space-y-4">
              {/* Colonnes détectées */}
              <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Colonnes détectées :
                </span>
                {Object.entries(preview.detectedColumns).length === 0 ? (
                  <span className="text-rose-500">Aucune colonne reconnue</span>
                ) : (
                  Object.entries(preview.detectedColumns).map(([role, header]) => (
                    <span
                      key={role}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                    >
                      {header} ✓
                    </span>
                  ))
                )}
              </div>

              {/* Synthèse chiffrée */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                    Valides
                  </div>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                    {preview.summary.validCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                    Avertissements
                  </div>
                  <div className="text-xl font-black text-amber-700 dark:text-amber-300">
                    {preview.summary.warningCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                    Erreurs (exclues)
                  </div>
                  <div className="text-xl font-black text-rose-700 dark:text-rose-300">
                    {preview.summary.errorCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                    Doublons fichier
                  </div>
                  <div className="text-xl font-black text-slate-800 dark:text-white">
                    {preview.summary.duplicateInFileCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                    Lignes vides ignorées
                  </div>
                  <div className="text-xl font-black text-slate-800 dark:text-white">
                    {preview.summary.ignoredEmptyRows}
                  </div>
                </div>
              </div>

              {/* Alerte Articles Inconnus */}
              {preview.unknownItems.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      Articles présents dans le fichier mais absents du catalogue ({preview.unknownItems.length}) :
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.unknownItems.map((u, i) => (
                      <span
                        key={`${u.category}-${u.rawValue}-${i}`}
                        className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-900 dark:text-amber-200 font-semibold text-[11px]"
                      >
                        {u.category} : &quot;{u.rawValue}&quot; ({u.count}×)
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                    Vous pouvez annuler pour créer ces articles dans <strong>Équipements</strong> avant d&apos;importer, ou confirmer l&apos;import (ces équipements resteront vides et pourront être sélectionnés ensuite).
                  </p>
                </div>
              )}

              {/* Filtres de prévisualisation */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: "ALL", label: `Toutes (${preview.summary.totalRows})` },
                    { key: "VALID", label: `Valides (${preview.summary.validCount})` },
                    { key: "WARNING", label: `Avertissements (${preview.summary.warningCount})` },
                    { key: "ERROR", label: `Erreurs (${preview.summary.errorCount})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      statusFilter === f.key
                        ? "bg-marseille-500 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Tableau de prévisualisation ligne par ligne */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                    <tr className="text-[11px] uppercase text-slate-600 dark:text-slate-300">
                      <th className="px-3 py-2 font-bold">Ligne</th>
                      <th className="px-3 py-2 font-bold">Statut</th>
                      <th className="px-3 py-2 font-bold">Membre</th>
                      <th className="px-3 py-2 font-bold">Naissance</th>
                      <th className="px-3 py-2 font-bold">Paiement</th>
                      <th className="px-3 py-2 font-bold">Polo / Veste / Divers</th>
                      <th className="px-3 py-2 font-bold">Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {visibleRows.map((r) => (
                      <tr key={r.rowNumber} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono text-slate-500">#{r.rowNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.status === "VALID" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> VALID
                            </span>
                          )}
                          {r.status === "WARNING" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="w-3 h-3" /> WARNING
                            </span>
                          )}
                          {r.status === "ERROR" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                              <XCircle className="w-3 h-3" /> ERROR
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {r.lastname || "—"} {r.firstname || "—"}
                          {r.isDuplicateInFile && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                              <Copy className="w-3 h-3" /> Doublon
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {r.birthDate || "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.paymentOk ? "OK" : "Non"}
                        </td>
                        <td className="px-3 py-2 text-[11px] space-y-0.5">
                          {r.poloLabel && (
                            <div>
                              <span className="font-semibold">P:</span> {r.poloLabel}{" "}
                              <span className="text-slate-400">
                                ({r.poloDistributed ? "Distribué" : "À remettre"})
                              </span>
                            </div>
                          )}
                          {r.vesteLabel && (
                            <div>
                              <span className="font-semibold">V:</span> {r.vesteLabel}{" "}
                              <span className="text-slate-400">
                                ({r.vesteDistributed ? "Distribuée" : "À remettre"})
                              </span>
                            </div>
                          )}
                          {r.diversLabel && (
                            <div>
                              <span className="font-semibold">D:</span> {r.diversLabel}{" "}
                              <span className="text-slate-400">
                                ({r.diversDistributed ? "Distribué" : "À remettre"})
                              </span>
                            </div>
                          )}
                          {!r.poloLabel && !r.vesteLabel && !r.diversLabel && (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] max-w-xs">
                          {r.errors.map((e, idx) => (
                            <div key={idx} className="text-rose-600 dark:text-rose-400 font-medium">
                              • {e}
                            </div>
                          ))}
                          {r.warnings.map((w, idx) => (
                            <div key={idx} className="text-amber-600 dark:text-amber-400">
                              • {w}
                            </div>
                          ))}
                          {r.errors.length === 0 && r.warnings.length === 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">Prêt</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PHASE 3 : BILAN */}
          {phase === "done" && commitResult && (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="text-base font-extrabold text-emerald-800 dark:text-emerald-300">
                Importation réussie pour l&apos;année {seasonYear} !
              </h4>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                <strong>{commitResult.created}</strong> nouveau(x) membre(s) créé(s) •{" "}
                <strong>{commitResult.updated}</strong> membre(s) mis à jour •{" "}
                <strong>{commitResult.skippedErrors}</strong> ligne(s) en erreur ignorée(s).
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {phase === "preview" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setPhase("upload");
                  setPreview(null);
                  setError(null);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Changer de fichier
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={loading || !canConfirmImport(preview)}
                  onClick={handleConfirmCommit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Confirmer et importer ({preview?.summary.importableCount ?? 0} joueur(s))
                </button>
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-marseille-500 hover:bg-marseille-600 text-white"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Lock,
  AlertTriangle,
  ArrowLeft,
  Shirt,
  Package,
} from "lucide-react";
import { EquipmentCategory, EquipmentItemRecord } from "@/lib/db/schema";
import { groupEquipmentByCategory } from "./inventory_ui_helpers";

interface EquipmentCatalogPanelProps {
  items: EquipmentItemRecord[];
  canManage: boolean;
  selectedYear: number;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onNotify: (type: "success" | "error", message: string) => void;
}

const CATEGORY_META: Record<
  EquipmentCategory,
  { title: string; subtitle: string; badgeClass: string }
> = {
  POLO: {
    title: "Polos",
    subtitle: "Tailles enfants & adultes",
    badgeClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  },
  VESTE: {
    title: "Vestes",
    subtitle: "Vestes & sweats club",
    badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  },
  DIVERS: {
    title: "Divers",
    subtitle: "Sacs, gourdes & accessoires",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
};

export function EquipmentCatalogPanel({
  items,
  canManage,
  selectedYear,
  onBack,
  onChanged,
  onNotify,
}: EquipmentCatalogPanelProps) {
  const grouped = groupEquipmentByCategory(items);

  // Formulaire ADD ITEM
  const [newCategory, setNewCategory] = useState<EquipmentCategory>("POLO");
  const [newType, setNewType] = useState("");
  const [newQuantity, setNewQuantity] = useState("10");
  const [newThreshold, setNewThreshold] = useState("5");
  const [submitting, setSubmitting] = useState(false);

  // Édition inline d'un article
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editThreshold, setEditThreshold] = useState("");

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !newType.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          type: newType.trim(),
          quantitySinceLastInventory: Number(newQuantity) || 0,
          threshold: Number(newThreshold) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify("error", data.error || "Impossible d'ajouter cet article.");
        return;
      }
      setNewType("");
      setNewQuantity("10");
      setNewThreshold("5");
      await onChanged();
      onNotify("success", `Article "${data.item.type}" ajouté dans ${newCategory}.`);
    } catch {
      onNotify("error", "Erreur réseau lors de l'ajout.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item: EquipmentItemRecord) => {
    setEditingId(item.id);
    setEditType(item.type);
    setEditQty(String(item.quantitySinceLastInventory));
    setEditThreshold(String(item.threshold));
  };

  const handleSaveEdit = async (id: number) => {
    if (!canManage) return;
    try {
      const res = await fetch(`/api/inventory/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editType.trim(),
          quantitySinceLastInventory: Number(editQty),
          threshold: Number(editThreshold),
          resetLastInventoryAt: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify("error", data.error || "Impossible de modifier cet article.");
        return;
      }
      setEditingId(null);
      await onChanged();
      onNotify("success", "Article mis à jour.");
    } catch {
      onNotify("error", "Erreur réseau lors de la modification.");
    }
  };

  const handleDelete = async (item: EquipmentItemRecord) => {
    if (!canManage || !item.canDelete) return;
    if (!window.confirm(`Supprimer définitivement l'article "${item.type}" ?`)) return;
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify("error", data.error || "Suppression refusée.");
        return;
      }
      await onChanged();
      onNotify("success", `Article "${item.type}" supprimé.`);
    } catch {
      onNotify("error", "Erreur réseau lors de la suppression.");
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête Catalogue + Retour */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Shirt className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Catalogue des Équipements (Polo, Veste, Divers)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gérez les 3 tables d&apos;articles, ajustez les stocks depuis le dernier inventaire et surveillez les seuils d&apos;alerte.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux membres ({selectedYear})
        </button>
      </div>

      {/* Formulaire rapide ADD ITEM (réservé inventory:manage) */}
      {canManage && (
        <form
          onSubmit={handleAddItem}
          className="glass-card rounded-2xl p-5 border border-marseille-500/20 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <Package className="w-4 h-4 text-marseille-500" />
            <span>Ajouter un nouvel équipement (ADD ITEM)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Catégorie
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as EquipmentCategory)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="POLO">POLO</option>
                <option value="VESTE">VESTE</option>
                <option value="DIVERS">DIVERS</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Type / Taille *
              </label>
              <input
                type="text"
                required
                placeholder="ex: Polo Adulte XL"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Stock inventaire
              </label>
              <input
                type="number"
                min={0}
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Seuil alerte
              </label>
              <input
                type="number"
                min={0}
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-marseille-500 hover:bg-marseille-600 text-white shadow-sm disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Les 3 Tables d'Équipements (POLO, VESTE, DIVERS) */}
      <div className="space-y-5">
        {(["POLO", "VESTE", "DIVERS"] as const).map((category) => {
          const catItems = grouped[category];
          const lowCount = catItems.filter((i) => i.isLowStock).length;
          const meta = CATEGORY_META[category];

          return (
            <div key={category} className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-xs font-extrabold px-2.5 py-1 rounded-lg border ${meta.badgeClass}`}
                  >
                    {category}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {meta.title} ({catItems.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {meta.subtitle}
                    </p>
                  </div>
                </div>
                {lowCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {lowCount} alerte(s) stock bas
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                      <th className="px-4 py-2.5 font-bold">Type</th>
                      <th className="px-3 py-2.5 font-bold text-center">Stock inventaire</th>
                      <th className="px-3 py-2.5 font-bold text-center">Distribués</th>
                      <th className="px-3 py-2.5 font-bold text-center">Restant</th>
                      <th className="px-3 py-2.5 font-bold text-center">Seuil alerte</th>
                      {canManage && <th className="px-3 py-2.5 font-bold text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {catItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={canManage ? 6 : 5}
                          className="px-4 py-6 text-center text-slate-400"
                        >
                          Aucun article dans la catégorie {category}.
                        </td>
                      </tr>
                    ) : (
                      catItems.map((item) => {
                        const isEditing = editingId === item.id;
                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editType}
                                  onChange={(e) => setEditType(e.target.value)}
                                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-marseille-500 w-full max-w-[220px]"
                                />
                              ) : (
                                item.type
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editQty}
                                  onChange={(e) => setEditQty(e.target.value)}
                                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-marseille-500 w-20 text-center"
                                />
                              ) : (
                                <span className="font-mono font-semibold">
                                  {item.quantitySinceLastInventory}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono text-sky-600 dark:text-sky-400 font-semibold">
                              {item.nbDistributed}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                                  item.isLowStock
                                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                }`}
                              >
                                {item.isLowStock && <AlertTriangle className="w-3 h-3" />}
                                {item.stockRemaining}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editThreshold}
                                  onChange={(e) => setEditThreshold(e.target.value)}
                                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-marseille-500 w-20 text-center"
                                />
                              ) : (
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  {item.threshold}
                                </span>
                              )}
                            </td>
                            {canManage && (
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {isEditing ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(item.id)}
                                      className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                                      title="Enregistrer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingId(null)}
                                      className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                                      title="Annuler"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(item)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-marseille-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                      title="Modifier le stock / seuil"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!item.canDelete}
                                      onClick={() => handleDelete(item)}
                                      className={`p-1.5 rounded-lg transition-colors ${
                                        item.canDelete
                                          ? "text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                          : "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                      }`}
                                      title={
                                        item.canDelete
                                          ? "Supprimer cet article (jamais utilisé)"
                                          : `Suppression bloquée : référencé par ${item.usageCount} fiche(s) membre`
                                      }
                                    >
                                      {item.canDelete ? (
                                        <Trash2 className="w-4 h-4" />
                                      ) : (
                                        <Lock className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

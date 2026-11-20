"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Package,
  Plus,
  Search,
  Upload,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Edit3,
  Trash2,
  X,
  RefreshCw,
  Shirt,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { hasPermission } from "@/lib/auth/permissions";
import {
  EquipmentItemRecord,
  EquipmentMemberRecord,
  InventorySeasonRecord,
} from "@/lib/db/schema";
import {
  MemberFilter,
  computeInventoryKpis,
  filterInventoryMembers,
  buildEquipmentChangePatch,
} from "./inventory_ui_helpers";
import { EquipmentCatalogPanel } from "./EquipmentCatalogPanel";
import { InventoryImportModal } from "./InventoryImportModal";

interface MemberFormState {
  id?: number;
  firstname: string;
  lastname: string;
  birthDate: string;
  poloItemId: string;
  poloDistributed: boolean;
  vesteItemId: string;
  vesteDistributed: boolean;
  diversItemId: string;
  diversDistributed: boolean;
  paymentOk: boolean;
}

const EMPTY_MEMBER_FORM: MemberFormState = {
  firstname: "",
  lastname: "",
  birthDate: "",
  poloItemId: "",
  poloDistributed: false,
  vesteItemId: "",
  vesteDistributed: false,
  diversItemId: "",
  diversDistributed: false,
  paymentOk: false,
};

export function InventorySection() {
  const { data: session } = useSession();
  const canManage = hasPermission(session?.user?.role, "inventory:manage");

  const [seasons, setSeasons] = useState<InventorySeasonRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2027);
  const [items, setItems] = useState<EquipmentItemRecord[]>([]);
  const [members, setMembers] = useState<EquipmentMemberRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingMemberId, setSavingMemberId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("ALL");

  // Modales locales (Nouvelle année, Ajout/Édition Membre, et slots Étape 5)
  const [showAddSeasonModal, setShowAddSeasonModal] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState<string>("");
  const [newSeasonLabel, setNewSeasonLabel] = useState<string>("");

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberFormState>(EMPTY_MEMBER_FORM);

  const [activeSubView, setActiveSubView] = useState<"members" | "equipment">("members");
  const [showImportModal, setShowImportModal] = useState(false);

  const notify = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const fetchSeasonsAndItems = useCallback(async () => {
    try {
      const [seasonsRes, itemsRes] = await Promise.all([
        fetch("/api/inventory/seasons"),
        fetch("/api/inventory/items"),
      ]);
      const seasonsData = await seasonsRes.json();
      const itemsData = await itemsRes.json();

      if (seasonsRes.ok && seasonsData.success) {
        const list: InventorySeasonRecord[] = seasonsData.seasons || [];
        setSeasons(list);
        if (list.length > 0) {
          setSelectedYear((prev) => (list.some((s) => s.year === prev) ? prev : list[0].year));
        }
      }
      if (itemsRes.ok && itemsData.success) {
        setItems(itemsData.items || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de chargement de l'inventaire.");
    }
  }, []);

  const fetchMembers = useCallback(async (year: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/members?year=${year}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de charger les membres.");
      }
      setMembers(data.members || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur chargement membres.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeasonsAndItems();
  }, [fetchSeasonsAndItems]);

  useEffect(() => {
    fetchMembers(selectedYear);
  }, [selectedYear, fetchMembers]);

  // Articles groupés par catégorie pour les 3 menus déroulants
  const poloItems = useMemo(() => items.filter((i) => i.category === "POLO"), [items]);
  const vesteItems = useMemo(() => items.filter((i) => i.category === "VESTE"), [items]);
  const diversItems = useMemo(() => items.filter((i) => i.category === "DIVERS"), [items]);

  // KPIs 100 % Inventaire
  const lowStockItems = useMemo(() => items.filter((i) => i.isLowStock), [items]);
  const kpis = useMemo(() => computeInventoryKpis(members, items), [members, items]);
  const paidCount = kpis.paidCount;
  const distributionStats = {
    distributed: kpis.distributedCount,
    pending: kpis.pendingCount,
  };

  // Filtrage des membres
  const filteredMembers = useMemo(
    () => filterInventoryMembers(members, searchQuery, filter),
    [members, searchQuery, filter]
  );

  // --- Actions API ---

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    const y = parseInt(newSeasonYear, 10);
    if (Number.isNaN(y) || y < 2000 || y > 2100) {
      notify("error", "Veuillez saisir une année valide (ex: 2028).");
      return;
    }

    try {
      const res = await fetch("/api/inventory/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: y,
          label: newSeasonLabel.trim() || `Saison ${y - 1}-${y}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Erreur lors de la création de l'année.");
        return;
      }
      await fetchSeasonsAndItems();
      setSelectedYear(y);
      setShowAddSeasonModal(false);
      setNewSeasonYear("");
      setNewSeasonLabel("");
      notify("success", `Année ${y} ajoutée avec succès.`);
    } catch {
      notify("error", "Erreur réseau lors de la création de l'année.");
    }
  };

  const handleInlineMemberPatch = async (
    memberId: number,
    patch: Partial<{
      poloItemId: number | null;
      poloDistributed: boolean;
      vesteItemId: number | null;
      vesteDistributed: boolean;
      diversItemId: number | null;
      diversDistributed: boolean;
      paymentOk: boolean;
    }>
  ) => {
    if (!canManage) return;
    setSavingMemberId(memberId);
    try {
      const res = await fetch(`/api/inventory/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Impossible de mettre à jour le membre.");
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === memberId ? data.member : m)));
      // Recalculer les stocks distribués dans le catalogue
      const itemsRes = await fetch("/api/inventory/items");
      const itemsData = await itemsRes.json();
      if (itemsRes.ok && itemsData.success) {
        setItems(itemsData.items || []);
      }
    } catch {
      notify("error", "Erreur réseau lors de la mise à jour.");
    } finally {
      setSavingMemberId(null);
    }
  };

  const openCreateMemberModal = () => {
    setMemberForm(EMPTY_MEMBER_FORM);
    setShowMemberModal(true);
  };

  const openEditMemberModal = (m: EquipmentMemberRecord) => {
    setMemberForm({
      id: m.id,
      firstname: m.firstname,
      lastname: m.lastname,
      birthDate: m.birthDate,
      poloItemId: m.poloItemId ? String(m.poloItemId) : "",
      poloDistributed: m.poloDistributed,
      vesteItemId: m.vesteItemId ? String(m.vesteItemId) : "",
      vesteDistributed: m.vesteDistributed,
      diversItemId: m.diversItemId ? String(m.diversItemId) : "",
      diversDistributed: m.diversDistributed,
      paymentOk: m.paymentOk,
    });
    setShowMemberModal(true);
  };

  const handleSaveMemberForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberForm.firstname.trim() || !memberForm.lastname.trim()) {
      notify("error", "Le prénom et le nom sont obligatoires.");
      return;
    }

    const payload = {
      seasonYear: selectedYear,
      firstname: memberForm.firstname.trim(),
      lastname: memberForm.lastname.trim(),
      birthDate: memberForm.birthDate.trim(),
      poloItemId: memberForm.poloItemId ? Number(memberForm.poloItemId) : null,
      poloDistributed: memberForm.poloItemId ? memberForm.poloDistributed : false,
      vesteItemId: memberForm.vesteItemId ? Number(memberForm.vesteItemId) : null,
      vesteDistributed: memberForm.vesteItemId ? memberForm.vesteDistributed : false,
      diversItemId: memberForm.diversItemId ? Number(memberForm.diversItemId) : null,
      diversDistributed: memberForm.diversItemId ? memberForm.diversDistributed : false,
      paymentOk: memberForm.paymentOk,
    };

    try {
      const isEdit = Boolean(memberForm.id);
      const url = isEdit
        ? `/api/inventory/members/${memberForm.id}`
        : "/api/inventory/members";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Erreur lors de l'enregistrement du membre.");
        return;
      }
      setShowMemberModal(false);
      await Promise.all([fetchMembers(selectedYear), fetchSeasonsAndItems()]);
      notify("success", isEdit ? "Membre mis à jour." : "Membre ajouté à l'inventaire.");
    } catch {
      notify("error", "Erreur réseau lors de l'enregistrement.");
    }
  };

  const handleDeleteMember = async (member: EquipmentMemberRecord) => {
    if (!canManage) return;
    if (!window.confirm(`Supprimer la fiche de ${member.firstname} ${member.lastname} (${selectedYear}) ?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/inventory/members/${member.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Erreur lors de la suppression.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      await fetchSeasonsAndItems();
      notify("success", "Membre supprimé.");
    } catch {
      notify("error", "Erreur réseau lors de la suppression.");
    }
  };

  const renderEquipmentCell = (
    member: EquipmentMemberRecord,
    categoryItems: EquipmentItemRecord[],
    itemId: number | null,
    distributed: boolean,
    fieldItem: "poloItemId" | "vesteItemId" | "diversItemId",
    fieldDist: "poloDistributed" | "vesteDistributed" | "diversDistributed"
  ) => {
    const isSaving = savingMemberId === member.id;
    return (
      <div className="flex flex-col gap-1.5 min-w-[155px]">
        <select
          value={itemId ?? ""}
          disabled={!canManage || isSaving}
          onChange={(e) => {
            const patch = buildEquipmentChangePatch(fieldItem, fieldDist, e.target.value);
            handleInlineMemberPatch(member.id, patch);
          }}
          className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-marseille-500/40 disabled:opacity-60"
        >
          <option value="">— Aucun —</option>
          {categoryItems.map((it) => (
            <option key={it.id} value={it.id}>
              {it.type} (reste: {it.stockRemaining})
            </option>
          ))}
        </select>

        {itemId !== null && (
          <button
            type="button"
            disabled={!canManage || isSaving}
            onClick={() =>
              handleInlineMemberPatch(member.id, { [fieldDist]: !distributed })
            }
            className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all disabled:cursor-not-allowed ${
              distributed
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
            }`}
            title={
              distributed
                ? "Équipement remis en main propre (cliquez pour annuler)"
                : "Équipement dû, non encore remis (cliquez pour marquer Distribué)"
            }
          >
            {distributed ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                Distribué
              </>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                À remettre
              </>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* En-tête du Module Inventaire & Équipements */}
      <div className="glass-card rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-marseille-500 to-sky-600 text-white shadow-md shadow-marseille-500/20">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                  Inventaire & Équipements du Club
                </h1>
                {!canManage ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                    <Eye className="w-3 h-3" />
                    Lecture seule
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    Gestion active
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Suivi par saison des équipements dus et distribués aux joueurs (Polo, Veste, Divers) et contrôle des stocks.
              </p>
            </div>
          </div>

          {/* Barre d'actions fidèle au schéma : ANNÉE (Combo) + [+] + ÉQUIPEMENTS + IMPORT + MEMBRE */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Combo Année + Bouton + */}
            <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <label htmlFor="inventory-year-select" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">
                Année :
              </label>
              <select
                id="inventory-year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none"
              >
                {seasons.map((s) => (
                  <option key={s.year} value={s.year}>
                    {s.year} ({s.label})
                  </option>
                ))}
              </select>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    const maxYear = seasons.length > 0 ? Math.max(...seasons.map((s) => s.year)) : 2027;
                    setNewSeasonYear(String(maxYear + 1));
                    setNewSeasonLabel(`Saison ${maxYear}-${maxYear + 1}`);
                    setShowAddSeasonModal(true);
                  }}
                  className="p-1.5 rounded-lg bg-marseille-500 hover:bg-marseille-600 text-white transition-colors"
                  title="Créer une nouvelle année d'inventaire"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Bouton Équipements (bascule catalogue Polo / Veste / Divers) */}
            <button
              type="button"
              onClick={() =>
                setActiveSubView((v) => (v === "equipment" ? "members" : "equipment"))
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                activeSubView === "equipment"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/70"
              }`}
            >
              <Shirt className="w-4 h-4" />
              <span>Équipements</span>
              {lowStockItems.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500 text-white font-bold">
                  {lowStockItems.length}
                </span>
              )}
            </button>

            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                >
                  <Upload className="w-4 h-4" />
                  <span>Importer Excel</span>
                </button>

                <button
                  type="button"
                  onClick={openCreateMemberModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-marseille-500 hover:bg-marseille-600 text-white shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Membre</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Toast Feedback */}
        {feedback && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between ${
              feedback.type === "success"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
            }`}
          >
            <span>{feedback.message}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3 Cartes KPI (100 % Inventaire — zéro finance) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Membres suivis ({selectedYear})</span>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {members.length}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {paidCount} paiement(s) validé(s) sur {members.length}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Équipements distribués</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {distributionStats.distributed}
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
            {distributionStats.pending} équipement(s) dû(s) en attente de remise
          </p>
        </div>

        <div
          className={`glass-card rounded-2xl p-5 border ${
            lowStockItems.length > 0
              ? "border-rose-500/40 bg-rose-500/5"
              : "border-slate-200/80 dark:border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <span>Alertes stock bas</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {lowStockItems.length}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {lowStockItems.length > 0
              ? lowStockItems.map((i) => i.type).slice(0, 2).join(", ")
              : "Tous les stocks sont au-dessus du seuil"}
          </p>
        </div>
      </div>

      {/* Sous-vue Catalogue Équipements (3 tables POLO, VESTE, DIVERS) */}
      {activeSubView === "equipment" ? (
        <EquipmentCatalogPanel
          items={items}
          canManage={canManage}
          selectedYear={selectedYear}
          onBack={() => setActiveSubView("members")}
          onChanged={fetchSeasonsAndItems}
          onNotify={notify}
        />
      ) : (
        /* Vue Principale : Tableau Interactif des Membres par Année */
        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
          {/* Barre de recherche & filtres */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un joueur (nom, prénom, date)..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-marseille-500/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: "ALL", label: `Tous (${members.length})` },
                  { key: "PENDING", label: "À remettre" },
                  { key: "PAID", label: "Paiement OK" },
                  { key: "UNPAID", label: "Non payé" },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setFilter(pill.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filter === pill.key
                      ? "bg-marseille-500 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  fetchSeasonsAndItems();
                  fetchMembers(selectedYear);
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                title="Actualiser"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          {/* Tableau des membres */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3 font-bold">Membre</th>
                  <th className="px-3 py-3 font-bold">Naissance</th>
                  <th className="px-3 py-3 font-bold text-center">Paiement</th>
                  <th className="px-3 py-3 font-bold">Polo</th>
                  <th className="px-3 py-3 font-bold">Veste</th>
                  <th className="px-3 py-3 font-bold">Divers</th>
                  {canManage && <th className="px-3 py-3 font-bold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-slate-400">
                      Chargement de l&apos;inventaire {selectedYear}...
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-slate-400">
                      Aucun membre trouvé pour l&apos;année {selectedYear}.{" "}
                      {canManage && "Ajoutez un membre ou importez un fichier Excel."}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {member.lastname} {member.firstname}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {member.birthDate || "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          disabled={!canManage || savingMemberId === member.id}
                          onClick={() =>
                            handleInlineMemberPatch(member.id, {
                              paymentOk: !member.paymentOk,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all disabled:cursor-not-allowed ${
                            member.paymentOk
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300/70 dark:border-slate-700"
                          }`}
                        >
                          {member.paymentOk ? "OK" : "En attente"}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {renderEquipmentCell(
                          member,
                          poloItems,
                          member.poloItemId,
                          member.poloDistributed,
                          "poloItemId",
                          "poloDistributed"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {renderEquipmentCell(
                          member,
                          vesteItems,
                          member.vesteItemId,
                          member.vesteDistributed,
                          "vesteItemId",
                          "vesteDistributed"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {renderEquipmentCell(
                          member,
                          diversItems,
                          member.diversItemId,
                          member.diversDistributed,
                          "diversItemId",
                          "diversDistributed"
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditMemberModal(member)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-marseille-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Éditer la fiche"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMember(member)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="Supprimer le membre"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modale Création Nouvelle Année (+) */}
      {showAddSeasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSeason}
            className="w-full max-w-md glass-panel rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Créer une nouvelle année d&apos;inventaire
              </h3>
              <button type="button" onClick={() => setShowAddSeasonModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Année (ex: 2028)
                </label>
                <input
                  type="number"
                  required
                  min={2000}
                  max={2100}
                  value={newSeasonYear}
                  onChange={(e) => setNewSeasonYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Libellé (ex: Saison 2027-2028)
                </label>
                <input
                  type="text"
                  value={newSeasonLabel}
                  onChange={(e) => setNewSeasonLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSeasonModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-marseille-500 hover:bg-marseille-600 text-white"
              >
                Créer l&apos;année
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modale Ajout / Édition Membre */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <form
            onSubmit={handleSaveMemberForm}
            className="w-full max-w-lg glass-panel rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {memberForm.id ? "Modifier le membre" : `Ajouter un membre (${selectedYear})`}
              </h3>
              <button type="button" onClick={() => setShowMemberModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Prénom *</label>
                <input
                  type="text"
                  required
                  value={memberForm.firstname}
                  onChange={(e) => setMemberForm({ ...memberForm, firstname: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={memberForm.lastname}
                  onChange={(e) => setMemberForm({ ...memberForm, lastname: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Date de naissance (DD-MM-YYYY)</label>
                <input
                  type="text"
                  placeholder="15-05-2014"
                  value={memberForm.birthDate}
                  onChange={(e) => setMemberForm({ ...memberForm, birthDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={memberForm.paymentOk}
                    onChange={(e) => setMemberForm({ ...memberForm, paymentOk: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Paiement OK
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div>
                <label className="block font-semibold mb-1">Polo</label>
                <select
                  value={memberForm.poloItemId}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      poloItemId: e.target.value,
                      poloDistributed: e.target.value ? memberForm.poloDistributed : false,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">— Aucun —</option>
                  {poloItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.type}
                    </option>
                  ))}
                </select>
                {memberForm.poloItemId && (
                  <label className="inline-flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberForm.poloDistributed}
                      onChange={(e) =>
                        setMemberForm({ ...memberForm, poloDistributed: e.target.checked })
                      }
                    />
                    Distribué
                  </label>
                )}
              </div>

              <div>
                <label className="block font-semibold mb-1">Veste</label>
                <select
                  value={memberForm.vesteItemId}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      vesteItemId: e.target.value,
                      vesteDistributed: e.target.value ? memberForm.vesteDistributed : false,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">— Aucune —</option>
                  {vesteItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.type}
                    </option>
                  ))}
                </select>
                {memberForm.vesteItemId && (
                  <label className="inline-flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberForm.vesteDistributed}
                      onChange={(e) =>
                        setMemberForm({ ...memberForm, vesteDistributed: e.target.checked })
                      }
                    />
                    Distribuée
                  </label>
                )}
              </div>

              <div>
                <label className="block font-semibold mb-1">Divers</label>
                <select
                  value={memberForm.diversItemId}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      diversItemId: e.target.value,
                      diversDistributed: e.target.value ? memberForm.diversDistributed : false,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">— Aucun —</option>
                  {diversItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.type}
                    </option>
                  ))}
                </select>
                {memberForm.diversItemId && (
                  <label className="inline-flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberForm.diversDistributed}
                      onChange={(e) =>
                        setMemberForm({ ...memberForm, diversDistributed: e.target.checked })
                      }
                    />
                    Distribué
                  </label>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMemberModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-marseille-500 hover:bg-marseille-600 text-white"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modale Pre-Visualizer d'Import Excel / CSV */}
      {showImportModal && (
        <InventoryImportModal
          seasonYear={selectedYear}
          onClose={() => setShowImportModal(false)}
          onImported={async (res) => {
            await Promise.all([fetchMembers(selectedYear), fetchSeasonsAndItems()]);
            notify(
              "success",
              `Import terminé : ${res.created} créé(s), ${res.updated} mis à jour.`
            );
          }}
        />
      )}
    </div>
  );
}

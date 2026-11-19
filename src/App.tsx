import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Download, Upload, Pencil, Trash2, Copy, X, FolderPlus, Check, BookMarked } from "lucide-react";
import type { Term } from "@/types";
import { loadStore, saveStore, uid } from "@/lib/store";
import { toCSV, termsFromCSV, termsFromJSON, downloadFile, todayStr } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "sonner";

const ALL = "__all__";

export default function App() {
  const [store, setStore] = useState(() => loadStore());
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const [deleting, setDeleting] = useState<Term | null>(null);
  const [managingCats, setManagingCats] = useState(false);
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [deletingCat, setDeletingCat] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveStore(store), [store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of store.terms) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [store.terms]);

  const allCategories = useMemo(() => {
    const set = new Set(store.categories);
    for (const t of store.terms) set.add(t.category);
    return [...set];
  }, [store]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = store.terms;
    if (activeCat !== ALL) list = list.filter((t) => t.category === activeCat);
    if (q) {
      list = list.filter((t) => [t.zh, t.ja, t.kana, t.category, t.note].some((f) => f.toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [store.terms, query, activeCat]);

  function upsertTerm(data: Omit<Term, "id" | "createdAt" | "updatedAt">, id?: string) {
    setStore((s) => {
      const now = Date.now();
      let categories = s.categories;
      if (data.category && !categories.includes(data.category)) categories = [...categories, data.category];
      if (id) return { categories, terms: s.terms.map((t) => (t.id === id ? { ...t, ...data, updatedAt: now } : t)) };
      return { categories, terms: [...s.terms, { ...data, id: uid(), createdAt: now, updatedAt: now }] };
    });
    toast.success(id ? "已更新" : "已收录新术语");
  }

  function removeTerm(id: string) {
    setStore((s) => ({ ...s, terms: s.terms.filter((t) => t.id !== id) }));
    toast.success("已删除");
    setDeleting(null);
  }

  function copyJa(t: Term) {
    navigator.clipboard.writeText(t.ja).then(() => toast.success(`已复制「${t.ja}」`), () => toast.error("复制失败"));
  }

  function addCategory(name: string) {
    const n = name.trim();
    if (!n) return;
    if (allCategories.includes(n)) { toast.error("分类已存在"); return; }
    setStore((s) => ({ ...s, categories: [...s.categories, n] }));
  }

  function renameCategory(oldName: string, newName: string) {
    const n = newName.trim();
    if (!n || n === oldName) return;
    if (allCategories.includes(n)) { toast.error("分类名已存在"); return; }
    setStore((s) => ({
      categories: s.categories.map((c) => (c === oldName ? n : c)),
      terms: s.terms.map((t) => (t.category === oldName ? { ...t, category: n } : t)),
    }));
    if (activeCat === oldName) setActiveCat(n);
  }

  function deleteCategory(name: string, force = false) {
    const n = counts.get(name) ?? 0;
    if (n > 0 && !force) { toast.error(`「${name}」下还有 ${n} 条术语，请先移走或删除`); return; }
    setStore((s) => ({
      categories: s.categories.filter((c) => c !== name),
      terms: s.terms.map((t) => (t.category === name ? { ...t, category: "未分类" } : t)),
    }));
    if (activeCat === name) setActiveCat(ALL);
    toast.success(`已删除分类「${name}」` + (n > 0 ? `，${n} 条术语已移至未分类` : ""));
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      let imported: Term[] = [];
      let cats: string[] = [];
      let skipped = 0;
      if (file.name.toLowerCase().endsWith(".json")) {
        const res = termsFromJSON(text);
        if (!res) { toast.error("JSON 文件无法解析"); return; }
        imported = res.terms;
        cats = res.categories;
      } else {
        const res = termsFromCSV(text);
        imported = res.terms;
        skipped = res.skipped;
      }
      if (imported.length === 0) { toast.error("没有识别到有效术语（至少需要 中文 或 日文）"); return; }
      setStore((s) => {
        const existing = new Set(s.terms.map((t) => t.zh + "||" + t.ja));
        const fresh = imported.filter((t) => !existing.has(t.zh + "||" + t.ja));
        const dup = imported.length - fresh.length;
        const catSet = new Set([...s.categories, ...cats]);
        for (const t of fresh) catSet.add(t.category);
        toast.success(`导入完成：新增 ${fresh.length} 条` + (dup ? `，跳过重复 ${dup} 条` : "") + (skipped ? `，跳过空行 ${skipped} 条` : ""));
        return { categories: [...catSet], terms: [...s.terms, ...fresh] };
      });
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="min-h-dvh bg-[#fafafa] text-[#0a0a0a] antialiased">
      <Toaster position="top-center" richColors />
      <header className="sticky top-0 z-20 border-b border-[#e5e5e5] bg-[#fafafa]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <div className="flex shrink-0 items-baseline gap-2">
            <BookMarked className="h-5 w-5 translate-y-0.5" strokeWidth={1.75} />
            <h1 className="text-lg font-semibold tracking-[-0.015em]">术语速查</h1>
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-[#0a0a0a]/40 sm:inline">日中 glossary</span>
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0a0a0a]/40" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入中文 / 日文 / 读音 / 备注…" className="h-11 w-full rounded-full border border-[#e5e5e5] bg-white pl-10 pr-16 text-base outline-none transition-colors placeholder:text-[#0a0a0a]/35 focus:border-[#0a0a0a]" aria-label="搜索术语" />
            {query ? (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#0a0a0a]/40 transition-colors hover:text-[#0a0a0a]" aria-label="清空搜索"><X className="h-4 w-4" /></button>
            ) : (
              <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-[#e5e5e5] px-1.5 py-0.5 text-[10px] text-[#0a0a0a]/40 sm:block">/</kbd>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden rounded-full border-[#e5e5e5] sm:inline-flex"><Upload className="mr-1.5 h-3.5 w-3.5" /> 导入</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>从 CSV / JSON 文件导入</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden rounded-full border-[#e5e5e5] sm:inline-flex"><Download className="mr-1.5 h-3.5 w-3.5" /> 导出</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => downloadFile(`术语表_${todayStr()}.csv`, toCSV(store.terms), "text/csv;charset=utf-8")}>导出 CSV（可用 Excel 打开）</DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(`术语备份_${todayStr()}.json`, JSON.stringify(store, null, 2), "application/json")}>导出 JSON 完整备份</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="rounded-full bg-[#0a0a0a] text-[#fafafa] hover:bg-[#0a0a0a]/85" onClick={() => setEditing("new")}><Plus className="mr-1 h-3.5 w-3.5" /> 新增</Button>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3 sm:hidden">
          <Button variant="outline" size="sm" className="flex-1 rounded-full border-[#e5e5e5]" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" /> 导入</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 rounded-full border-[#e5e5e5]"><Download className="mr-1.5 h-3.5 w-3.5" /> 导出</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadFile(`术语表_${todayStr()}.csv`, toCSV(store.terms), "text/csv;charset=utf-8")}>CSV（Excel）</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadFile(`术语备份_${todayStr()}.json`, JSON.stringify(store, null, 2), "application/json")}>JSON 备份</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5 sm:px-6">
        <aside className="hidden w-44 shrink-0 md:block">
          <CategoryList categories={allCategories} counts={counts} total={store.terms.length} active={activeCat} onSelect={setActiveCat} managing={managingCats} onToggleManage={() => setManagingCats((v) => !v)} onAdd={addCategory} onRename={renameCategory} onDelete={(name) => setDeletingCat(name)} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 md:hidden">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <CatChip label={`全部 ${store.terms.length}`} active={activeCat === ALL} onClick={() => setActiveCat(ALL)} />
              {allCategories.map((c) => (
                <CatChip key={c} label={`${c} ${counts.get(c) ?? 0}`} active={activeCat === c} onClick={() => setActiveCat(c)} managing={managingCats} onRename={() => setRenamingCat(c)} onDelete={() => setDeletingCat(c)} />
              ))}
              <button onClick={() => setManagingCats((v) => !v)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${managingCats ? "border-[#0a0a0a] text-[#0a0a0a]" : "border-[#e5e5e5] text-[#0a0a0a]/50"}`}>{managingCats ? "完成" : "管理"}</button>
            </div>
            {managingCats && (
              <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.elements.namedItem("newcat") as HTMLInputElement; addCategory(input.value); input.value = ""; }}>
                <input name="newcat" placeholder="新分类名，回车添加" className="h-9 w-full rounded-full border border-[#e5e5e5] bg-white px-3 text-sm outline-none focus:border-[#0a0a0a]" />
                <button type="submit" aria-label="添加分类" className="shrink-0 rounded-full bg-[#0a0a0a] p-2 text-[#fafafa]"><FolderPlus className="h-4 w-4" /></button>
              </form>
            )}
          </div>

          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm text-[#0a0a0a]/50">
              {query ? (<>“{query}” 命中 <span className="font-semibold text-[#0a0a0a]">{filtered.length}</span> 条</>) : (<>共 <span className="font-semibold text-[#0a0a0a]">{filtered.length}</span> 条术语</>)}
            </p>
            <p className="hidden text-xs text-[#0a0a0a]/35 sm:block">点击日文即可复制</p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState hasAny={store.terms.length > 0} onAdd={() => setEditing("new")} onClear={() => { setQuery(""); setActiveCat(ALL); }} />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-[#e5e5e5] bg-white md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e5e5] text-left text-xs uppercase tracking-[0.08em] text-[#0a0a0a]/40">
                      <th className="px-4 py-2.5 font-medium">中文</th>
                      <th className="px-4 py-2.5 font-medium">日文</th>
                      <th className="px-4 py-2.5 font-medium">读音</th>
                      <th className="px-4 py-2.5 font-medium">分类</th>
                      <th className="px-4 py-2.5 font-medium">备注</th>
                      <th className="w-20 px-4 py-2.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="group">
                    {filtered.map((t, i) => (
                      <tr key={t.id} className="border-b border-[#f0f0f0] transition-opacity duration-150 last:border-0 group-hover:opacity-40 hover:!opacity-100" style={{ animation: `rowIn .3s ${Math.min(i * 30, 600)}ms both` }}>
                        <td className="px-4 py-3 align-top font-medium">{t.zh}</td>
                        <td className="px-4 py-3 align-top">
                          <button onClick={() => copyJa(t)} className="group/ja inline-flex cursor-copy items-center gap-1.5 font-medium underline decoration-[#0a0a0a]/20 underline-offset-4 transition-colors hover:decoration-[#0a0a0a]" title="点击复制">
                            {t.ja}
                            <Copy className="h-3 w-3 text-[#0a0a0a]/0 transition-colors group-hover/ja:text-[#0a0a0a]/50" />
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top text-[#0a0a0a]/55">{t.kana || "—"}</td>
                        <td className="px-4 py-3 align-top"><span className="inline-block rounded-full border border-[#e5e5e5] px-2 py-0.5 text-xs text-[#0a0a0a]/60">{t.category}</span></td>
                        <td className="max-w-[220px] px-4 py-3 align-top text-[#0a0a0a]/55">{t.note || "—"}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-1 opacity-0 transition-opacity duration-150 [tr:hover_&]:opacity-100">
                            <IconBtn label="编辑" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                            <IconBtn label="删除" danger onClick={() => setDeleting(t)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 md:hidden">
                {filtered.map((t, i) => (
                  <li key={t.id} className="rounded-xl border border-[#e5e5e5] bg-white p-4" style={{ animation: `rowIn .3s ${Math.min(i * 30, 600)}ms both` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button onClick={() => copyJa(t)} className="text-base font-semibold underline decoration-[#0a0a0a]/20 underline-offset-4">{t.ja}</button>
                        {t.kana && <p className="mt-0.5 text-xs text-[#0a0a0a]/50">{t.kana}</p>}
                        <p className="mt-1 text-sm">{t.zh}</p>
                        {t.note && <p className="mt-1 text-xs text-[#0a0a0a]/55">{t.note}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconBtn label="编辑" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></IconBtn>
                        <IconBtn label="删除" danger onClick={() => setDeleting(t)}><Trash2 className="h-4 w-4" /></IconBtn>
                      </div>
                    </div>
                    <span className="mt-2 inline-block rounded-full border border-[#e5e5e5] px-2 py-0.5 text-xs text-[#0a0a0a]/60">{t.category}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-6 text-xs leading-relaxed text-[#0a0a0a]/35">数据仅保存在当前浏览器本地（localStorage），换设备或清理浏览器数据前请先导出备份。</p>
        </main>
      </div>

      {editing && (
        <TermDialog term={editing === "new" ? null : editing} defaultCategory={activeCat === ALL ? allCategories[0] ?? "" : activeCat} categories={allCategories} onClose={() => setEditing(null)} onSave={(data, id) => { upsertTerm(data, id); setEditing(null); }} />
      )}

      <Dialog open={!!renamingCat} onOpenChange={(o) => !o && setRenamingCat(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>重命名分类</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.elements.namedItem("rename") as HTMLInputElement; if (renamingCat) renameCategory(renamingCat, input.value); setRenamingCat(null); }} className="space-y-3">
            <input name="rename" autoFocus defaultValue={renamingCat ?? ""} className="h-10 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm outline-none focus:border-[#0a0a0a]" />
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setRenamingCat(null)}>取消</Button>
              <Button type="submit" className="rounded-full bg-[#0a0a0a] text-[#fafafa] hover:bg-[#0a0a0a]/85">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingCat} onOpenChange={(o) => !o && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分类「{deletingCat}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCat && (counts.get(deletingCat) ?? 0) > 0 ? `该分类下的 ${counts.get(deletingCat)} 条术语会保留，归入「未分类」。` : "该分类下没有术语，可以直接删除。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-600/90" onClick={() => { if (deletingCat) deleteCategory(deletingCat, true); setDeletingCat(null); }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条术语？</AlertDialogTitle>
            <AlertDialogDescription>{deleting && (<>「{deleting.zh} — {deleting.ja}」将被删除，此操作无法撤销。</>)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-600/90" onClick={() => deleting && removeTerm(deleting.id)}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`@keyframes rowIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`}</style>
    </div>
  );
}

function IconBtn({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`rounded-lg p-2 transition-colors ${danger ? "text-[#0a0a0a]/40 hover:bg-red-50 hover:text-red-600" : "text-[#0a0a0a]/40 hover:bg-[#f0f0f0] hover:text-[#0a0a0a]"}`}>{children}</button>
  );
}

function CatChip({ label, active, onClick, managing, onRename, onDelete }: { label: string; active: boolean; onClick: () => void; managing?: boolean; onRename?: () => void; onDelete?: () => void }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border transition-colors ${active ? "border-[#0a0a0a] bg-[#0a0a0a] text-[#fafafa]" : "border-[#e5e5e5] bg-white text-[#0a0a0a]/60"}`}>
      <button onClick={onClick} className="px-3 py-1.5 text-xs">{label}</button>
      {managing && onRename && onDelete && (
        <span className="flex items-center pr-1.5">
          <button onClick={onRename} aria-label="重命名" className={`p-1 ${active ? "text-[#fafafa]/70" : "text-[#0a0a0a]/40"}`}><Pencil className="h-3 w-3" /></button>
          <button onClick={onDelete} aria-label="删除分类" className={`p-1 ${active ? "text-[#fafafa]/70" : "text-red-500/70"}`}><Trash2 className="h-3 w-3" /></button>
        </span>
      )}
    </span>
  );
}

function CategoryList(props: { categories: string[]; counts: Map<string, number>; total: number; active: string; onSelect: (c: string) => void; managing: boolean; onToggleManage: () => void; onAdd: (name: string) => void; onRename: (o: string, n: string) => void; onDelete: (name: string) => void; }) {
  const [newCat, setNewCat] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const itemCls = (active: boolean) => `flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-[#0a0a0a] font-medium text-[#fafafa]" : "text-[#0a0a0a]/55 hover:bg-[#f0f0f0] hover:text-[#0a0a0a]"}`;
  return (
    <nav className="sticky top-[76px]" aria-label="分类">
      <div className="mb-2 flex items-center justify-between px-3">
        <span className="text-xs uppercase tracking-[0.12em] text-[#0a0a0a]/40">分类</span>
        <button onClick={props.onToggleManage} className="text-xs text-[#0a0a0a]/40 underline decoration-[#0a0a0a]/20 underline-offset-2 transition-colors hover:text-[#0a0a0a]">{props.managing ? "完成" : "管理"}</button>
      </div>
      <ul className="space-y-0.5">
        <li>
          <button className={itemCls(props.active === ALL)} onClick={() => props.onSelect(ALL)}>全部<span className={`text-xs ${props.active === ALL ? "text-[#fafafa]/60" : "text-[#0a0a0a]/35"}`}>{props.total}</span></button>
        </li>
        {props.categories.map((c) => (
          <li key={c}>
            {renaming === c ? (
              <form className="flex items-center gap-1 px-1 py-1" onSubmit={(e) => { e.preventDefault(); props.onRename(c, renameVal); setRenaming(null); }}>
                <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="h-8 w-full rounded-lg border border-[#0a0a0a] bg-white px-2 text-sm outline-none" onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                <IconBtn label="确认" onClick={() => { props.onRename(c, renameVal); setRenaming(null); }}><Check className="h-3.5 w-3.5" /></IconBtn>
              </form>
            ) : (
              <div className="group/cat relative">
                <button className={itemCls(props.active === c)} onClick={() => props.onSelect(c)}>
                  <span className="truncate">{c}</span>
                  <span className={`text-xs ${props.active === c ? "text-[#fafafa]/60" : "text-[#0a0a0a]/35"}`}>{props.counts.get(c) ?? 0}</span>
                </button>
                {props.managing && (
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 bg-[#fafafa] pl-1">
                    <IconBtn label="重命名" onClick={() => { setRenaming(c); setRenameVal(c); }}><Pencil className="h-3 w-3" /></IconBtn>
                    <IconBtn label="删除分类" danger onClick={() => props.onDelete(c)}><Trash2 className="h-3 w-3" /></IconBtn>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {props.managing && (
        <form className="mt-2 flex items-center gap-1 px-1" onSubmit={(e) => { e.preventDefault(); props.onAdd(newCat); setNewCat(""); }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新分类名" className="h-8 w-full rounded-lg border border-[#e5e5e5] bg-white px-2 text-sm outline-none focus:border-[#0a0a0a]" />
          <IconBtn label="添加分类" onClick={() => { props.onAdd(newCat); setNewCat(""); }}><FolderPlus className="h-3.5 w-3.5" /></IconBtn>
        </form>
      )}
    </nav>
  );
}

function EmptyState({ hasAny, onAdd, onClear }: { hasAny: boolean; onAdd: () => void; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d4d4d4] bg-white px-6 py-16 text-center">
      <BookMarked className="mx-auto h-8 w-8 text-[#0a0a0a]/25" strokeWidth={1.5} />
      {hasAny ? (
        <>
          <p className="mt-3 text-sm font-medium">没有匹配的术语</p>
          <p className="mt-1 text-xs text-[#0a0a0a]/50">换个关键词试试，或把它收录进来</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={onClear}>清除筛选</Button>
            <Button size="sm" className="rounded-full bg-[#0a0a0a] text-[#fafafa] hover:bg-[#0a0a0a]/85" onClick={onAdd}><Plus className="mr-1 h-3.5 w-3.5" /> 收录这条</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium">还没有术语</p>
          <p className="mt-1 text-xs text-[#0a0a0a]/50">新增第一条，或从 CSV / JSON 导入你的术语表</p>
          <Button size="sm" className="mt-5 rounded-full bg-[#0a0a0a] text-[#fafafa] hover:bg-[#0a0a0a]/85" onClick={onAdd}><Plus className="mr-1 h-3.5 w-3.5" /> 新增术语</Button>
        </>
      )}
    </div>
  );
}

function TermDialog({ term, defaultCategory, categories, onClose, onSave }: { term: Term | null; defaultCategory: string; categories: string[]; onClose: () => void; onSave: (data: Omit<Term, "id" | "createdAt" | "updatedAt">, id?: string) => void; }) {
  const [zh, setZh] = useState(term?.zh ?? "");
  const [ja, setJa] = useState(term?.ja ?? "");
  const [kana, setKana] = useState(term?.kana ?? "");
  const [category, setCategory] = useState(term?.category ?? defaultCategory);
  const [note, setNote] = useState(term?.note ?? "");
  const [err, setErr] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!zh.trim() && !ja.trim()) { setErr("中文和日文至少填一项"); return; }
    onSave({ zh: zh.trim(), ja: ja.trim(), kana: kana.trim(), category: category.trim() || "未分类", note: note.trim() }, term?.id);
  }
  const inputCls = "h-10 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm outline-none transition-colors focus:border-[#0a0a0a]";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="tracking-[-0.015em]">{term ? "编辑术语" : "新增术语"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs text-[#0a0a0a]/50">中文 *</span><input autoFocus value={zh} onChange={(e) => setZh(e.target.value)} className={inputCls} placeholder="交期" /></label>
            <label className="block"><span className="mb-1 block text-xs text-[#0a0a0a]/50">日文 *</span><input value={ja} onChange={(e) => setJa(e.target.value)} className={inputCls} placeholder="納期" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs text-[#0a0a0a]/50">读音 / 假名</span><input value={kana} onChange={(e) => setKana(e.target.value)} className={inputCls} placeholder="のうき" /></label>
            <label className="block"><span className="mb-1 block text-xs text-[#0a0a0a]/50">分类</span><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} list="cat-list" placeholder="商务" />
              <datalist id="cat-list">{categories.map((c) => (<option key={c} value={c} />))}</datalist>
            </label>
          </div>
          <label className="block"><span className="mb-1 block text-xs text-[#0a0a0a]/50">备注</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#0a0a0a]" placeholder="用法、近义词、注意事项…" /></label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="rounded-full">取消</Button>
            <Button type="submit" className="rounded-full bg-[#0a0a0a] text-[#fafafa] hover:bg-[#0a0a0a]/85">{term ? "保存修改" : "收录"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type TabKey = "fridge" | "shopping" | "recipe";

export default function Dashboard() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [activeTab, setActiveTab] = useState<TabKey>("recipe");

  // 献立生成後の買い物リスト候補（選択制）
  const [shoppingCandidates, setShoppingCandidates] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showShoppingSelector, setShowShoppingSelector] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: number; name: string } | null>(null);
  const [moveToFridgeConfirm, setMoveToFridgeConfirm] = useState<{ id: number; name: string } | null>(null);

  // 外部サイト警告の安心ポップアップ
  const STORAGE_KEY = "hide_line_warning_popup";
  const [showLineWarningPopup, setShowLineWarningPopup] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const hidden = localStorage.getItem(STORAGE_KEY);
    if (!hidden) {
      setShowLineWarningPopup(true);
    }
  }, []);

  const handleCloseLineWarningPopup = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setShowLineWarningPopup(false);
  };

  const { data: todayMenu, isLoading: menuLoading } = trpc.menu.getByDate.useQuery({ date: today });
  const { data: shoppingList, isLoading: shoppingLoading } = trpc.shopping.list.useQuery({ date: today });
  const { data: fridgeItems, isLoading: fridgeLoading } = trpc.fridge.list.useQuery();
  const { data: familyData } = trpc.family.getProfile.useQuery();

  const utils = trpc.useUtils();

  const generateMenu = trpc.menu.getOrGenerate.useMutation({
    onSuccess: (data) => {
      utils.menu.getByDate.invalidate({ date: today });
      if (data.shoppingList && data.shoppingList.length > 0) {
        setShoppingCandidates(data.shoppingList);
        setSelectedItems(new Set(data.shoppingList));
        setShowShoppingSelector(true);
        setActiveTab("shopping");
      }
      toast.success("献立を生成しました！");
    },
    onError: (err) => toast.error("エラー", { description: err.message }),
  });

  const addShoppingItem = trpc.shopping.add.useMutation();

  const handleAddSelectedToShoppingList = async () => {
    const itemsToAdd = Array.from(selectedItems);
    if (itemsToAdd.length === 0) { toast.info("追加する項目が選択されていません"); return; }
    try {
      for (const item of itemsToAdd) {
        await addShoppingItem.mutateAsync({ name: item, date: today });
      }
      await utils.shopping.list.invalidate({ date: today });
      setShowShoppingSelector(false);
      setShoppingCandidates([]);
      setSelectedItems(new Set());
      toast.success(`${itemsToAdd.length}品を買い物リストに追加しました！`);
    } catch { toast.error("追加に失敗しました"); }
  };

  const sendToLine = trpc.menu.sendToLine.useMutation({
    onSuccess: () => toast.success("LINEに送信しました！"),
    onError: (err) => toast.error("送信エラー", { description: err.message }),
  });

  const deleteChecked = trpc.shopping.deleteChecked.useMutation({
    onSuccess: (data) => {
      utils.shopping.list.invalidate({ date: today });
      toast.success(`購入済み ${data.deletedCount} 件を削除しました`);
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const moveCheckedToFridge = trpc.shopping.moveCheckedToFridge.useMutation({
    onSuccess: (data) => {
      utils.shopping.list.invalidate({ date: today });
      utils.fridge.list.invalidate();
      toast.success(`購入済み ${data.movedCount} 件を冷蔵庫に移行しました！`);
    },
    onError: (err) => toast.error("移行に失敗しました", { description: err.message }),
  });

  const moveToFridge = trpc.shopping.moveToFridge.useMutation({
    onSuccess: () => {
      utils.shopping.list.invalidate({ date: today });
      utils.fridge.list.invalidate();
      toast.success(`冷蔵庫に移行しました！`);
      setMoveToFridgeConfirm(null);
    },
    onError: (err) => toast.error("移行に失敗しました", { description: err.message }),
  });

  const toggleItem = trpc.shopping.toggle.useMutation({
    onSuccess: () => utils.shopping.list.invalidate({ date: today }),
  });

  const adjustFridgeQty = trpc.fridge.adjustQuantity.useMutation({
    onSuccess: () => utils.fridge.list.invalidate(),
    onError: (err) => toast.error("更新に失敗しました", { description: err.message }),
  });

  const deleteFridgeItem = trpc.fridge.delete.useMutation({
    onSuccess: () => {
      utils.fridge.list.invalidate();
      toast.success("食材を削除しました");
      setDeleteConfirmItem(null);
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const handleFridgeMinus = (item: { id: number; name: string; quantity?: string | null }) => {
    // 数量が1または数値が1以下になる場合は削除確認ダイアログを表示
    const qtyNum = item.quantity ? parseInt(item.quantity.replace(/[^0-9]/g, ''), 10) : 1;
    if (isNaN(qtyNum) || qtyNum <= 1) {
      setDeleteConfirmItem({ id: item.id, name: item.name });
    } else {
      adjustFridgeQty.mutate({ id: item.id, delta: -1 });
    }
  };

  const menuData = todayMenu?.menuData as {
    mealType?: string;
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    dinnerOptions?: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;
    dinnerRecipe?: string;
    tips?: string;
    estimatedCost?: number;
    shoppingList?: string[];
  } | null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const toggleCandidate = (item: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  };

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "fridge", label: "冷蔵庫", icon: "🥦" },
    { key: "shopping", label: "買い物リスト", icon: "🛒" },
    { key: "recipe", label: "レシピ・献立", icon: "🍽️" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="text-lg">🍽️</span>
              <span className="font-bold text-primary text-sm hidden sm:inline">献立日和～coto coto～</span>
              <span className="font-bold text-primary text-sm sm:hidden">coto coto</span>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/family">
              <button className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl hover:bg-orange-50 active:bg-orange-100 transition-colors min-w-[56px]">
                <span className="text-xl mb-0.5">👨‍👩‍👧</span>
                <span className="text-xs font-medium text-gray-700">家族</span>
              </button>
            </Link>
            <Link href="/history">
              <button className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl hover:bg-orange-50 active:bg-orange-100 transition-colors min-w-[56px]">
                <span className="text-xl mb-0.5">📋</span>
                <span className="text-xs font-medium text-gray-700">履歴</span>
              </button>
            </Link>
            <a href="/#how-to-use">
              <button className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl hover:bg-orange-50 active:bg-orange-100 transition-colors min-w-[56px]">
                <span className="text-xl mb-0.5">❓</span>
                <span className="text-xs font-medium text-gray-700">使い方</span>
              </button>
            </a>
          </div>
        </div>
      </header>

      {/* タブナビゲーション */}
      <div className="sticky top-14 z-40 bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors border-b-2 relative ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-2xl leading-none">{tab.icon}</span>
                <span className="text-xs font-medium">{tab.label}</span>
                {tab.key === "shopping" && shoppingList && shoppingList.filter(i => !i.isChecked).length > 0 && (
                  <span className="absolute top-1 right-3 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {shoppingList.filter(i => !i.isChecked).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4">

        {/* ウェルカム */}
        <div className="mb-4">
          <h1 className="text-lg font-bold">
            こんにちは、{user?.name ?? "ゲスト"}さん 👋
          </h1>
          <p className="text-sm text-muted-foreground">{formatDate(today)}の献立</p>
        </div>

        {/* ── 冷蔵庫タブ ── */}
        {activeTab === "fridge" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">🥦 冷蔵庫の食材</h2>
              <Link href="/fridge">
                <Button size="sm" className="bg-primary text-primary-foreground text-xs">+ 食材を追加</Button>
              </Link>
            </div>
            {fridgeLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
            ) : fridgeItems && fridgeItems.length > 0 ? (
              <div className="space-y-2">
                {fridgeItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <span className="text-sm font-medium">{item.name}</span>
                      {item.quantity && (
                        <span className="text-xs text-muted-foreground ml-2">{item.quantity}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.expiryDate && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.expiryDate) < new Date() ? "⚠️ 期限切れ" : `〜${new Date(item.expiryDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}`}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-base font-bold"
                          onClick={() => handleFridgeMinus(item)}
                          disabled={adjustFridgeQty.isPending || deleteFridgeItem.isPending}
                        >
                          −
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-base font-bold"
                          onClick={() => adjustFridgeQty.mutate({ id: item.id, delta: 1 })}
                          disabled={adjustFridgeQty.isPending}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🥦</div>
                <p className="text-muted-foreground mb-2">食材が登録されていません</p>
                <p className="text-sm text-muted-foreground mb-4">LINEで「冷蔵庫に〇〇を追加」と送るか、下のボタンから登録できます</p>
                <Link href="/fridge">
                  <Button className="bg-primary text-primary-foreground">食材を登録する</Button>
                </Link>
              </div>
            )}

            {/* 家族情報（未登録の場合のみ促進） */}
            {familyData && familyData.members.length === 0 && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">👨‍👩‍👧 家族構成を登録しましょう</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">家族情報を登録すると、人数・アレルギーを考慮した献立を提案できます</p>
                  <Link href="/family">
                    <Button size="sm" variant="outline" className="text-xs border-amber-400 text-amber-700">登録する</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── 買い物リストタブ ── */}
        {activeTab === "shopping" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">🛒 今日の買い物リスト</h2>
              <div className="flex items-center gap-2">
                {shoppingList && shoppingList.filter(i => i.isChecked).length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveCheckedToFridge.mutate()}
                      disabled={moveCheckedToFridge.isPending}
                      className="text-xs text-primary hover:text-primary hover:bg-primary/10 h-7 px-2"
                    >
                      {moveCheckedToFridge.isPending ? "移行中..." : "🧄 冷蔵庫へ"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteChecked.mutate()}
                      disabled={deleteChecked.isPending}
                      className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                    >
                      {deleteChecked.isPending ? "削除中..." : "削除"}
                    </Button>
                  </div>
                )}
                <Link href="/shopping">
                  <Button variant="ghost" size="sm" className="text-xs">すべて見る →</Button>
                </Link>
              </div>
            </div>

            {/* 献立生成後の買い物候補選択UI */}
            {showShoppingSelector && shoppingCandidates.length > 0 && (
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-primary">🛒 買い物リストに追加する</CardTitle>
                  <p className="text-xs text-muted-foreground">必要なものにチェックを入れて「追加する」を押してください</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setSelectedItems(new Set(shoppingCandidates))}>全て選択</Button>
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setSelectedItems(new Set())}>全て解除</Button>
                  </div>
                  <div className="space-y-2 mb-4">
                    {shoppingCandidates.map((item) => (
                      <div key={item} className="flex items-center gap-3 cursor-pointer py-1" onClick={() => toggleCandidate(item)}>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedItems.has(item) ? "bg-primary border-primary" : "border-border bg-background"}`}>
                          {selectedItems.has(item) && <span className="text-primary-foreground text-xs">✓</span>}
                        </div>
                        <span className={`text-sm ${!selectedItems.has(item) ? "text-muted-foreground line-through" : ""}`}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAddSelectedToShoppingList} disabled={addShoppingItem.isPending || selectedItems.size === 0} className="bg-primary text-primary-foreground" size="sm">
                      {addShoppingItem.isPending ? "追加中..." : `✓ ${selectedItems.size}品を追加`}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setShowShoppingSelector(false); setShoppingCandidates([]); setSelectedItems(new Set()); }}>
                      スキップ
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {shoppingLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
            ) : shoppingList && shoppingList.length > 0 ? (
              <div className="space-y-1">
                {shoppingList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 cursor-pointer py-2.5 border-b border-border last:border-0"
                    onClick={() => toggleItem.mutate({ id: item.id, isChecked: !item.isChecked })}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.isChecked ? "bg-primary border-primary" : "border-border"}`}>
                      {item.isChecked && <span className="text-primary-foreground text-xs">✓</span>}
                    </div>
                    <span className={`text-sm flex-1 ${item.isChecked ? "line-through text-muted-foreground" : ""}`}>{item.name}</span>
                    {item.quantity && <span className="text-xs text-muted-foreground">{item.quantity}</span>}
                  </div>
                ))}
                <div className="pt-2 text-xs text-muted-foreground">
                  {shoppingList.filter(i => i.isChecked).length}/{shoppingList.length} 完了
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🛒</div>
                <p className="text-muted-foreground mb-2">買い物リストが空です</p>
                <p className="text-sm text-muted-foreground mb-4">献立を生成すると買い物リスト候補が表示されます</p>
                <Button
                  onClick={() => { generateMenu.mutate({ date: today }); setActiveTab("recipe"); }}
                  disabled={generateMenu.isPending}
                  className="bg-primary text-primary-foreground"
                >
                  {generateMenu.isPending ? "生成中..." : "献立を生成する"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── レシピ・献立タブ ── */}
        {activeTab === "recipe" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">🍽️ 今日の献立</CardTitle>
                  <div className="flex gap-2">
                    {!todayMenu && (
                      <Button size="sm" onClick={() => generateMenu.mutate({ date: today })} disabled={generateMenu.isPending} className="bg-primary text-primary-foreground">
                        {generateMenu.isPending ? "生成中..." : "献立を生成"}
                      </Button>
                    )}
                    {todayMenu && (
                      <Button size="sm" variant="outline" onClick={() => sendToLine.mutate({ date: today })} disabled={sendToLine.isPending}>
                        {sendToLine.isPending ? "送信中..." : "📱 LINEに送信"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {menuLoading ? (
                  <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
                ) : todayMenu && menuData ? (
                  <div className="space-y-3">
                    {/* 夕食3案表示（新形式） */}
                    {menuData.dinnerOptions && menuData.dinnerOptions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">🌙 今夜の夕食候補</p>
                        {menuData.dinnerOptions.map((opt, i) => (
                          <div key={i} className="bg-muted/50 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{["1️⃣","2️⃣","3️⃣"][i]}</span>
                              <span className="text-sm font-medium">{opt.name}</span>
                            </div>
                            {opt.usedFridgeItems.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1 ml-7">冷蔵庫：{opt.usedFridgeItems.join("・")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "🌅 朝食", value: menuData.breakfast },
                          { label: "☀️ 昼食", value: menuData.lunch },
                          { label: "🌙 夕食", value: menuData.dinner },
                        ].filter(m => m.value).map((meal) => (
                          <div key={meal.label} className="bg-muted/50 rounded-lg p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">{meal.label}</p>
                            <p className="text-sm font-medium">{meal.value ?? "未定"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {menuData.dinnerRecipe && (
                      <div className="bg-primary/5 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1">📝 レシピ</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{menuData.dinnerRecipe}</p>
                      </div>
                    )}
                    {menuData.tips && (
                      <div className="flex items-start gap-2 text-sm">
                        <span>💡</span>
                        <p className="text-muted-foreground">{menuData.tips}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {menuData.estimatedCost && (
                        <Badge variant="secondary">💰 約{menuData.estimatedCost.toLocaleString()}円</Badge>
                      )}
                      {todayMenu.isDelivered && (
                        <Badge variant="outline" className="text-green-600 border-green-200">✓ LINE配信済み</Badge>
                      )}
                    </div>
                    {/* 買い物リスト候補 */}
                    {!showShoppingSelector && menuData.shoppingList && menuData.shoppingList.length > 0 && shoppingList && shoppingList.length === 0 && (
                      <div className="border border-dashed border-primary/40 rounded-lg p-3 bg-primary/5">
                        <p className="text-xs font-semibold text-primary mb-2">🛒 買い物リスト候補があります</p>
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                          setShoppingCandidates(menuData.shoppingList!);
                          setSelectedItems(new Set(menuData.shoppingList!));
                          setShowShoppingSelector(true);
                          setActiveTab("shopping");
                        }}>
                          買い物リストに追加する →
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">🍽️</div>
                    <p className="text-muted-foreground mb-4">今日の献立がまだ生成されていません</p>
                    <Button onClick={() => generateMenu.mutate({ date: today })} disabled={generateMenu.isPending} className="bg-primary text-primary-foreground">
                      {generateMenu.isPending ? "AIが献立を考えています..." : "献立を生成する"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 家族情報サマリー（スクロールで見える位置） */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">👨‍👩‍👧 家族構成</CardTitle>
                  <Link href="/family">
                    <Button variant="ghost" size="sm" className="text-xs">編集</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {familyData && familyData.members.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {familyData.members.map((m) => (
                      <Badge key={m.id} variant="secondary" className="text-xs">{m.name}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">家族情報を登録すると提案精度が上がります</p>
                    <Link href="/family">
                      <Button size="sm" variant="outline" className="text-xs ml-2">登録</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 冷蔵庫サマリー */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">🥦 冷蔵庫</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveTab("fridge")}>管理</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {fridgeItems && fridgeItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {fridgeItems.slice(0, 6).map((item) => (
                      <Badge key={item.id} variant="outline" className="text-xs">{item.name}</Badge>
                    ))}
                    {fridgeItems.length > 6 && <Badge variant="outline" className="text-xs">+{fridgeItems.length - 6}</Badge>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">食材を登録してください</p>
                    <Button size="sm" variant="outline" className="text-xs ml-2" onClick={() => setActiveTab("fridge")}>登録</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 機能設定ショートカット */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">⚙️ 機能設定</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/family">
                    <Button variant="outline" size="sm" className="w-full text-xs">👨‍👩‍👧 家族構成</Button>
                  </Link>
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setActiveTab("fridge")}>🥦 冷蔵庫管理</Button>
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setActiveTab("shopping")}>🛒 買い物リスト</Button>
                  <Link href="/history">
                    <Button variant="outline" size="sm" className="w-full text-xs">📋 献立履歴</Button>
                  </Link>
                </div>
                <div className="mt-2 pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2">📡 LINE自動配信</p>
                  <Link href="/family">
                    <Button variant="outline" size="sm" className="w-full text-xs text-primary border-primary/30">配信時間・プラン設定を変更 →</Button>
                  </Link>
                </div>
                <div className="mt-2 pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2">👑 プレミアム機能</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/menu-theme">
                      <Button variant="outline" size="sm" className="w-full text-xs text-amber-600 border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">🎯 献立テーマ設定</Button>
                    </Link>
                    <Link href="/bento-mode">
                      <Button variant="outline" size="sm" className="w-full text-xs text-amber-600 border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">🍱 お弁当モード</Button>
                    </Link>
                  </div>
                  <div className="mt-2">
                    <Link href="/plan">
                      <Button variant="outline" size="sm" className="w-full text-xs text-orange-600 border-orange-300/60 bg-orange-50/50">💳 プラン管理・アップグレード</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 過去の献立へのリンク */}
            <Link href="/history">
              <Button variant="outline" className="w-full text-sm">📋 過去の献立を見る</Button>
            </Link>
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="py-6 border-t border-border mt-4">
        <div className="max-w-2xl mx-auto px-4 text-center space-y-2">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <a href="/terms" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">利用規約</a>
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">プライバシーポリシー</a>
            <a href="/tokushoho" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">特定商取引法に基づく表示</a>
            <a href="/cancel-policy" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">キャンセルポリシー</a>
          </div>
          <p className="text-xs text-muted-foreground">© 2025 献立日和～coto coto～</p>
        </div>
      </footer>

      {/* LINE外部サイト警告の安心ポップアップ */}
      <Dialog open={showLineWarningPopup} onOpenChange={(open) => { if (!open) handleCloseLineWarningPopup(); }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🔒</span>
              <DialogTitle className="text-base font-bold text-primary">安心してご利用ください</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-foreground leading-relaxed">
              LINEから開く際に「外部サービスへの移動」という確認メッセージが表示されることがありますが、<strong className="text-primary">献立日和〜coto coto〜は安全なサービス</strong>です。
              <br /><br />
              個人情報は適切に保護されており、安心してご利用いただけます。
              <br /><br />
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">利用規約</a>
              {" "}・{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">プライバシーポリシー</a>
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2 mb-1">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <label htmlFor="dont-show-again" className="text-xs text-muted-foreground cursor-pointer select-none">
              次回から表示しない
            </label>
          </div>
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-1"
            onClick={handleCloseLineWarningPopup}
          >
            確認しました
          </Button>
        </DialogContent>
      </Dialog>

      {/* 買い物リスト→冷蔵庫移行確認ダイアログ */}
      <AlertDialog open={!!moveToFridgeConfirm} onOpenChange={(open) => !open && setMoveToFridgeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>冷蔵庫に移行しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{moveToFridgeConfirm?.name}」を冷蔵庫に移行して買い物リストから削除します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMoveToFridgeConfirm(null)}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => moveToFridgeConfirm && moveToFridge.mutate({ id: moveToFridgeConfirm.id })}
            >
              冷蔵庫へ移行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 冷蔵庫削除確認ダイアログ */}
      <AlertDialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>食材を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteConfirmItem?.name}」の数量が0になります。冷蔵庫から削除しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmItem(null)}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmItem && deleteFridgeItem.mutate({ id: deleteConfirmItem.id })}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
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

  // 冷蔵庫の選択モード
  const [fridgeSelectMode, setFridgeSelectMode] = useState(false);
  const [fridgeSelectedIds, setFridgeSelectedIds] = useState<Set<number>>(new Set());

  // 買い物リストの選択モード
  const [shoppingSelectMode, setShoppingSelectMode] = useState(false);
  const [shoppingSelectedIds, setShoppingSelectedIds] = useState<Set<number>>(new Set());

  // 外部サイト警告の安心ポップアップ（1日1回表示）
  const STORAGE_KEY_NEVER = "hide_line_warning_popup_never"; // 次回から表示しない
  const STORAGE_KEY_DATE = "line_warning_popup_last_shown";  // 最終表示日
  const [showLineWarningPopup, setShowLineWarningPopup] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // カード登録促進ポップアップ（トライアルユーザー向け・毎回表示）
  const [showTrialPopup, setShowTrialPopup] = useState(false);
  const { data: planData } = trpc.subscription.getMyPlan.useQuery();
  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (err) => {
      toast.error(err.message || "決済ページの作成に失敗しました");
    },
  });

  useEffect(() => {
    // 次回から表示しないフラグがあれば表示しない
    const neverShow = localStorage.getItem(STORAGE_KEY_NEVER);
    if (neverShow) return;

    // 今日すでに表示済みかチェック
    const today = new Date().toLocaleDateString("ja-JP"); // 例: "2026/4/9"
    const lastShown = localStorage.getItem(STORAGE_KEY_DATE);
    if (lastShown === today) return;

    setShowLineWarningPopup(true);
  }, []);

  // 「次回から表示しない」済みのトライアルユーザーは直接カード登録ポップを表示
  useEffect(() => {
    if (!planData) return;
    if (planData.status !== "trial") return;
    const neverShow = localStorage.getItem(STORAGE_KEY_NEVER);
    if (!neverShow) return; // セキュリティポップが出る場合はそちらに任せる
    setShowTrialPopup(true);
  }, [planData]);

  const handleCloseLineWarningPopup = () => {
    if (dontShowAgain) {
      // 「次回から表示しない」チェック時
      localStorage.setItem(STORAGE_KEY_NEVER, "1");
    } else {
      // チェックなしの場合は今日の日付を保存（1日1回制御）
      const today = new Date().toLocaleDateString("ja-JP");
      localStorage.setItem(STORAGE_KEY_DATE, today);
    }
    setShowLineWarningPopup(false);
    // トライアルユーザーにはカード登録促進ポップアップを続けて表示
    if (planData?.status === "trial") {
      setShowTrialPopup(true);
    }
  };

    // 献立ビュー切り替え（日・週）
  const [menuView, setMenuView] = useState<'day' | 'week'>('day');
  // 週ビューのポップアップ対象日
  const [weekPopupDate, setWeekPopupDate] = useState<string | null>(null);
  // 週ビュー：本日を起点として前後に表示する日数オフセット（0=本日が左端）
  const [weekOffset, setWeekOffset] = useState(0); // -7=1週前, 7=1週後
  // 週の開始日：本日 + weekOffset（T12:00:00でUTCズレ防止）
  const weekStart = (() => {
    const d = new Date(today + 'T12:00:00+09:00');
    d.setDate(d.getDate() + weekOffset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const weekEnd = (() => {
    const [y, mo, day0] = weekStart.split('-').map(Number);
    const d = new Date(y, mo - 1, day0 + 13); // 14日分表示
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  // 週ビュー用データ
  const { data: weekMenus, isLoading: weekMenuLoading, refetch: refetchWeek } = trpc.menu.getByDateRange.useQuery(
    { startDate: weekStart, endDate: weekEnd },
    { enabled: menuView === 'week' }
  );

  // 献立削除
  const deleteMenuPlanMutation = trpc.menu.deleteMenuPlan.useMutation({
    onSuccess: () => { refetchWeek(); setWeekPopupDate(null); toast.success('献立を削除しました'); },
    onError: (err) => toast.error('削除に失敗しました', { description: err.message }),
  });

  // プロテクト切り替え
  const toggleProtect = trpc.menu.toggleProtect.useMutation({
    onSuccess: () => { refetchWeek(); toast.success('プロテクト状態を変更しました'); },
    onError: (err) => toast.error('変更に失敗しました', { description: err.message }),
  });

  // 週間献立一括生成
  const generateWeekly = trpc.menu.generateWeekly.useMutation({
    onSuccess: (data) => {
      refetchWeek();
      toast.success(`${data.successCount}日分の献立を生成しました！`);
    },
    onError: (err) => toast.error('生成に失敗しました', { description: err.message }),
  });

  const { data: todayMenu, isLoading: menuLoading } = trpc.menu.getByDate.useQuery({ date: today });
  const { data: shoppingList, isLoading: shoppingLoading } = trpc.shopping.list.useQuery({ date: today });
  const { data: fridgeItems, isLoading: fridgeLoading } = trpc.fridge.list.useQuery();
  const { data: familyData } = trpc.family.getProfile.useQuery();

  const utils = trpc.useUtils();

  // 献立生成タイムアウト管理
  const GENERATE_TIMEOUT_MS = 25000; // 25秒
  const generateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [generateTimedOut, setGenerateTimedOut] = useState(false);

  const reportError = trpc.errorLog.report.useMutation();

  const generateMenu = trpc.menu.getOrGenerate.useMutation({
    onMutate: () => {
      // タイムアウトタイマー開始
      setGenerateTimedOut(false);
      if (generateTimeoutRef.current) clearTimeout(generateTimeoutRef.current);
      generateTimeoutRef.current = setTimeout(() => {
        setGenerateTimedOut(true);
        // タイムアウトをエラーログとして送信
        reportError.mutate({
          type: "menu_generate_timeout",
          message: `献立生成が${GENERATE_TIMEOUT_MS / 1000}秒でタイムアウトしました`,
          userAgent: navigator.userAgent,
          extra: {
            date: today,
            timestamp: new Date().toISOString(),
          },
        });
      }, GENERATE_TIMEOUT_MS);
    },
    onSuccess: (data) => {
      if (generateTimeoutRef.current) clearTimeout(generateTimeoutRef.current);
      setGenerateTimedOut(false);
      utils.menu.getByDate.invalidate({ date: today });
      if (data.shoppingList && data.shoppingList.length > 0) {
        setShoppingCandidates(data.shoppingList);
        setSelectedItems(new Set(data.shoppingList));
        setShowShoppingSelector(true);
        setActiveTab("shopping");
      }
      toast.success("献立を生成しました！");
    },
    onError: (err) => {
      if (generateTimeoutRef.current) clearTimeout(generateTimeoutRef.current);
      setGenerateTimedOut(false);
      toast.error("エラー", { description: err.message });
    },
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

  const bulkDeleteFridge = trpc.fridge.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.fridge.list.invalidate();
      toast.success(`${data.deletedCount}件の食材を削除しました`);
      setFridgeSelectMode(false);
      setFridgeSelectedIds(new Set());
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const bulkMoveFridgeToShopping = trpc.fridge.bulkMoveToShopping.useMutation({
    onSuccess: (data) => {
      utils.fridge.list.invalidate();
      utils.shopping.list.invalidate({ date: today });
      toast.success(`${data.movedCount}件を買い物リストに移動しました`);
      setFridgeSelectMode(false);
      setFridgeSelectedIds(new Set());
    },
    onError: (err) => toast.error("移動に失敗しました", { description: err.message }),
  });

  const bulkDeleteShopping = trpc.shopping.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.shopping.list.invalidate({ date: today });
      toast.success(`${data.deletedCount}件を削除しました`);
      setShoppingSelectMode(false);
      setShoppingSelectedIds(new Set());
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const bulkMoveShoppingToFridge = trpc.shopping.bulkMoveToFridge.useMutation({
    onSuccess: (data) => {
      utils.shopping.list.invalidate({ date: today });
      utils.fridge.list.invalidate();
      toast.success(`${data.movedCount}件を冷蔵庫に移動しました`);
      setShoppingSelectMode(false);
      setShoppingSelectedIds(new Set());
    },
    onError: (err) => toast.error("移動に失敗しました", { description: err.message }),
  });

  const toggleFridgeSelect = (id: number) => {
    setFridgeSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleShoppingSelect = (id: number) => {
    setShoppingSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  const MASCOT_STANDING = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";
  const MASCOT_THINKING = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_think-drvF2Dx6NgBmfM8SeMiN9M.png";
  const MASCOT_HAPPY = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
  const ICON_FRIDGE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_fridge-KQLswGt9s5EXbespkogmJC.png";
  const ICON_SHOPPING = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_shopping-Tck2PebbYtvQzyzVCbvmqh.png";
  const ICON_BREAKFAST = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/icon_breakfast_7bf50e19.png";
  const ICON_LUNCH = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/icon_lunch_c821e51f.png";
  const ICON_DINNER = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/icon_dinner_569d9e21.png";

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "fridge", label: "冷蔵庫", icon: "🥦" },
    { key: "shopping", label: "買い物リスト", icon: "🛒" },
    { key: "recipe", label: "レシピ・献立", icon: "🍽️" },
  ];

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Zen Maru Gothic', 'Noto Sans JP', sans-serif" }}>
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 backdrop-blur border-b" style={{ backgroundColor: 'rgba(255,248,242,0.97)', borderColor: '#f0d9c8' }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <img src={MASCOT_STANDING} alt="コトコくん" className="h-9 w-9 object-contain rounded-full" style={{ background: '#fff8f2' }} />
              <span className="font-bold text-sm hidden sm:inline" style={{ color: '#FF7F50' }}>献立日和～coto coto～</span>
              <span className="font-bold text-sm sm:hidden" style={{ color: '#FF7F50' }}>coto coto</span>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/family">
              <button className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-colors min-w-[52px]" style={{ color: '#6B5040' }}>
                <span className="text-xl mb-0.5">👨‍👩‍👧</span>
                <span className="text-xs font-medium">家族</span>
              </button>
            </Link>
            <Link href="/history">
              <button className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-colors min-w-[52px]" style={{ color: '#6B5040' }}>
                <span className="text-xl mb-0.5">📋</span>
                <span className="text-xs font-medium">履歴</span>
              </button>
            </Link>
            <a href="/#how-to-use">
              <button className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-colors min-w-[52px]" style={{ color: '#6B5040' }}>
                <span className="text-xl mb-0.5">❓</span>
                <span className="text-xs font-medium">使い方</span>
              </button>
            </a>
          </div>
        </div>
      </header>

      {/* タブナビゲーション */}
      <div className="sticky top-14 z-40 border-b" style={{ backgroundColor: '#FFF8F2', borderColor: '#f0d9c8' }}>
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors border-b-2 relative"
                style={{
                  borderBottomColor: activeTab === tab.key ? '#FF7F50' : 'transparent',
                  color: activeTab === tab.key ? '#FF7F50' : '#8a7060',
                  fontWeight: activeTab === tab.key ? '700' : '400',
                }}
              >
                <span className="text-2xl leading-none">{tab.icon}</span>
                <span className="text-xs font-medium">{tab.label}</span>
                {tab.key === "shopping" && shoppingList && shoppingList.filter(i => !i.isChecked).length > 0 && (
                  <span className="absolute top-1 right-3 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" style={{ backgroundColor: '#FF7F50' }}>
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
        <div className="mb-4 rounded-2xl p-4 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #FFF8F2 0%, #F5F9F0 100%)', border: '1px solid #F0D9C8' }}>
          <img src={MASCOT_HAPPY} alt="コトコくん" className="w-16 h-16 object-contain flex-shrink-0" />
          <div>
            <h1 className="text-base font-bold" style={{ color: '#3D2B1F' }}>
              こんにちは、{user?.name ?? "ゲスト"}さん！
            </h1>
            <p className="text-sm" style={{ color: '#8a7060' }}>{formatDate(today)}の献立を一緒に考えましょう 🍳</p>
          </div>
        </div>

        {/* ── 冷蔵庫タブ ── */}
        {activeTab === "fridge" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold flex-1">🥦 冷蔵庫の食材</h2>
              {!fridgeSelectMode ? (
                <>
                  <Link href="/fridge">
                    <Button size="sm" className="bg-primary text-primary-foreground text-xs">+ 食材を追加</Button>
                  </Link>
                  {fridgeItems && fridgeItems.length > 0 && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => { setFridgeSelectMode(true); setFridgeSelectedIds(new Set()); }}>
                      選択
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { setFridgeSelectMode(false); setFridgeSelectedIds(new Set()); }}>
                  キャンセル
                </Button>
              )}
            </div>

            {/* 選択モード時のアクションバー */}
            {fridgeSelectMode && fridgeSelectedIds.size > 0 && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <span className="text-xs text-muted-foreground flex-1">{fridgeSelectedIds.size}件選択中</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs text-primary border-primary/40"
                  onClick={() => bulkMoveFridgeToShopping.mutate({ ids: Array.from(fridgeSelectedIds) })}
                  disabled={bulkMoveFridgeToShopping.isPending}
                >
                  {bulkMoveFridgeToShopping.isPending ? "移動中..." : "🛒 買い物リストへ"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs text-destructive border-destructive/40"
                  onClick={() => bulkDeleteFridge.mutate({ ids: Array.from(fridgeSelectedIds) })}
                  disabled={bulkDeleteFridge.isPending}
                >
                  {bulkDeleteFridge.isPending ? "削除中..." : "削除"}
                </Button>
              </div>
            )}

            {fridgeLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
            ) : fridgeItems && fridgeItems.length > 0 ? (
              <div className="space-y-2">
                {fridgeItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center py-2 border-b border-border last:border-0 ${fridgeSelectMode ? "cursor-pointer" : ""}`}
                    onClick={fridgeSelectMode ? () => toggleFridgeSelect(item.id) : undefined}
                  >
                    {fridgeSelectMode && (
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mr-3 transition-colors ${
                        fridgeSelectedIds.has(item.id) ? "bg-primary border-primary" : "border-border bg-background"
                      }`}>
                        {fridgeSelectedIds.has(item.id) && <span className="text-primary-foreground text-xs">✓</span>}
                      </div>
                    )}
                    <div className="flex-1">
                      <span className="text-sm font-medium">{item.name}</span>
                      {item.quantity && (
                        <span className="text-xs text-muted-foreground ml-2">{item.quantity}</span>
                      )}
                    </div>
                    {!fridgeSelectMode && (
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
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <img src={ICON_FRIDGE} alt="冷蔵庫" className="w-20 h-20 object-contain mx-auto mb-3" />
                <p className="font-medium mb-1 text-sm" style={{ color: '#3D2B1F' }}>食材が登録されていません</p>
                <p className="text-xs mb-4" style={{ color: '#8a7060' }}>LINEで「冷蔵庫に「○○を追加」と送るか、下のボタンから登録できます</p>
                <Link href="/fridge">
                  <button className="text-white text-sm font-bold px-6 py-2.5 rounded-2xl" style={{ backgroundColor: '#FF7F50' }}>食材を登録する</button>
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
            <div className="flex items-center gap-2">
              <h2 className="font-semibold flex-1">🛒 今日の買い物リスト</h2>
              {!shoppingSelectMode ? (
                <>
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
                  {shoppingList && shoppingList.length > 0 && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => { setShoppingSelectMode(true); setShoppingSelectedIds(new Set()); }}>
                      選択
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { setShoppingSelectMode(false); setShoppingSelectedIds(new Set()); }}>
                  キャンセル
                </Button>
              )}
            </div>

            {/* 選択モード時のアクションバー */}
            {shoppingSelectMode && shoppingSelectedIds.size > 0 && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <span className="text-xs text-muted-foreground flex-1">{shoppingSelectedIds.size}件選択中</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs text-primary border-primary/40"
                  onClick={() => bulkMoveShoppingToFridge.mutate({ ids: Array.from(shoppingSelectedIds) })}
                  disabled={bulkMoveShoppingToFridge.isPending}
                >
                  {bulkMoveShoppingToFridge.isPending ? "移動中..." : "🧄 冷蔵庫へ"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs text-destructive border-destructive/40"
                  onClick={() => bulkDeleteShopping.mutate({ ids: Array.from(shoppingSelectedIds) })}
                  disabled={bulkDeleteShopping.isPending}
                >
                  {bulkDeleteShopping.isPending ? "削除中..." : "削除"}
                </Button>
              </div>
            )}

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
                    onClick={() => {
                      if (shoppingSelectMode) {
                        toggleShoppingSelect(item.id);
                      } else {
                        toggleItem.mutate({ id: item.id, isChecked: !item.isChecked });
                      }
                    }}
                  >
                    {shoppingSelectMode ? (
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        shoppingSelectedIds.has(item.id) ? "bg-primary border-primary" : "border-border bg-background"
                      }`}>
                        {shoppingSelectedIds.has(item.id) && <span className="text-primary-foreground text-xs">✓</span>}
                      </div>
                    ) : (
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.isChecked ? "bg-primary border-primary" : "border-border"}`}>
                        {item.isChecked && <span className="text-primary-foreground text-xs">✓</span>}
                      </div>
                    )}
                    <span className={`text-sm flex-1 ${!shoppingSelectMode && item.isChecked ? "line-through text-muted-foreground" : ""}`}>{item.name}</span>
                    {item.quantity && <span className="text-xs text-muted-foreground">{item.quantity}</span>}
                  </div>
                ))}
                <div className="pt-2 text-xs text-muted-foreground">
                  {shoppingList.filter(i => i.isChecked).length}/{shoppingList.length} 完了
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <img src={ICON_SHOPPING} alt="買い物リスト" className="w-20 h-20 object-contain mx-auto mb-3" />
                <p className="font-medium mb-1 text-sm" style={{ color: '#3D2B1F' }}>買い物リストが空です</p>
                <p className="text-xs mb-4" style={{ color: '#8a7060' }}>献立を生成すると買い物リスト候補が表示されます</p>
                {generateTimedOut ? (
                  <div className="space-y-2">
                    <p className="text-sm text-destructive">⏱ タイムアウトしました。ネットワーク接続を確認してください。</p>
                    <button
                      onClick={() => { setGenerateTimedOut(false); generateMenu.mutate({ date: today }); setActiveTab("recipe"); }}
                      className="text-white text-sm font-bold px-6 py-2.5 rounded-2xl" style={{ backgroundColor: '#FF7F50' }}
                    >
                      再試行する
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { generateMenu.mutate({ date: today }); setActiveTab("recipe"); }}
                    disabled={generateMenu.isPending}
                    className="text-white text-sm font-bold px-6 py-2.5 rounded-2xl" style={{ backgroundColor: '#FF7F50' }}
                  >
                    {generateMenu.isPending ? "生成中..." : "献立を生成する"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── レシピ・献立タブ ── */}
        {activeTab === "recipe" && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #F0D9C8' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#FFF0E8' }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🍽️</span>
                  <div>
                    <span className="font-bold text-sm" style={{ color: '#3D2B1F' }}>
                      {menuView === 'day' ? `${new Date(today + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}の献立` : `今週の献立`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* 日・週切り替えプルダウン */}
                  <select
                    value={menuView}
                    onChange={(e) => setMenuView(e.target.value as 'day' | 'week')}
                    className="text-xs rounded-xl px-2 py-1 font-medium"
                    style={{ backgroundColor: 'white', color: '#3D2B1F', border: '1px solid #F0D9C8', outline: 'none' }}
                  >
                    <option value="day">日</option>
                    <option value="week">{planData?.isPremium && planData?.status !== 'trial' ? '週' : '週 👑'}</option>
                  </select>
                  {menuView === 'day' && (
                    <>
                      {!todayMenu && (
                        generateTimedOut ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-destructive">⏱ タイムアウト</span>
                            <Button size="sm" onClick={() => { setGenerateTimedOut(false); generateMenu.mutate({ date: today }); }} className="text-white text-xs rounded-xl" style={{ backgroundColor: '#FF7F50' }}>
                              再試行
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" onClick={() => generateMenu.mutate({ date: today })} disabled={generateMenu.isPending} className="text-white text-xs rounded-xl" style={{ backgroundColor: '#FF7F50' }}>
                            {generateMenu.isPending ? "生成中..." : "献立を生成"}
                          </Button>
                        )
                      )}
                      {todayMenu && (
                        <Button size="sm" variant="outline" onClick={() => sendToLine.mutate({ date: today })} disabled={sendToLine.isPending} className="text-xs rounded-xl" style={{ borderColor: '#6B9E6B', color: '#6B9E6B' }}>
                          {sendToLine.isPending ? "送信中..." : "📱 LINEに送信"}
                        </Button>
                      )}
                    </>
                  )}
                  {menuView === 'week' && planData?.isPremium && planData?.status !== 'trial' && (
                    <Button
                      size="sm"
                      onClick={() => generateWeekly.mutate({ startDate: weekStart, days: 7 })}
                      disabled={generateWeekly.isPending}
                      className="text-white text-xs rounded-xl"
                      style={{ backgroundColor: '#B8860B' }}
                    >
                      {generateWeekly.isPending ? "生成中..." : "✨ 週間生成"}
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-4" style={{ backgroundColor: 'white' }}>
                {/* ── 週ビュー ── */}
                {menuView === 'week' ? (
                  (() => {
                    // ①トライアル（カード未登録）は週ビュー不可
                    if (planData?.status === 'trial') {
                      return (
                        <div className="text-center py-10 space-y-3">
                          <p className="text-2xl">🔒</p>
                          <p className="text-sm font-bold" style={{ color: '#3D2B1F' }}>週ビューはプレミアム機能です</p>
                          <p className="text-xs" style={{ color: '#8a7060' }}>カードを登録してプレミアムプランを開始すると、週単位の献立管理ができます。</p>
                          <Button size="sm" className="text-white rounded-xl" style={{ backgroundColor: '#FF7F50' }} onClick={() => window.location.href = '/plan'}>
                            プランを確認する
                          </Button>
                        </div>
                      );
                    }
                    // 週ビューのカレンダーグリッド
                    const weekDays: { date: string; label: string; dayOfWeek: string }[] = [];
                    for (let i = 0; i < 14; i++) {
                      // UTCズレ防止：T12:00:00+09:00で日付を固定し、ローカル時間ベースで文字列化
                      const [y, mo, day0] = weekStart.split('-').map(Number);
                      const d = new Date(y, mo - 1, day0 + i);
                      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      const dayNames = ['日','月','火','水','木','金','土'];
                      weekDays.push({
                        date: dateStr,
                        label: `${d.getMonth()+1}/${d.getDate()}`,
                        dayOfWeek: dayNames[d.getDay()],
                      });
                    }
                    type WeekMenuItem = NonNullable<typeof weekMenus>[number];
                    const menuByDate = new Map<string, WeekMenuItem>();
                    if (weekMenus) {
                      for (const m of weekMenus) menuByDate.set(m.planDate, m);
                    }
                    const popupMenu = weekPopupDate ? menuByDate.get(weekPopupDate) : null;
                    const popupMenuData = (popupMenu?.menuData as any) ?? null;
                    return (
                      <div className="space-y-3">
                        {weekMenuLoading ? (
                          <div className="text-center py-6" style={{ color: '#8a7060' }}>読み込み中...</div>
                        ) : (
                          <>
                            {/* 横スクロールカード列 */}
                            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                              {weekDays.map(({ date, label, dayOfWeek }) => {
                                const menu = menuByDate.get(date);
                                const md = menu?.menuData as any;
                                const isToday = date === today;
                                const isSelected = weekPopupDate === date;
                                const isProtectedDay = menu?.isProtected;
                                const dayColor = dayOfWeek === '日' ? '#E53E3E' : dayOfWeek === '土' ? '#3182CE' : '#3D2B1F';
                                const hasBreakfast = !!(md?.breakfast);
                                const hasLunch = !!(md?.lunch);
                                const hasDinner = !!(md?.dinner || (md?.dinnerOptions && md?.dinnerOptions[0]));
                                return (
                                  <div
                                    key={date}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setWeekPopupDate(isSelected ? null : date)}
                                    onKeyDown={(e) => e.key === 'Enter' && setWeekPopupDate(isSelected ? null : date)}
                                    className="rounded-xl p-2 text-center cursor-pointer select-none flex-shrink-0"
                                    style={{
                                      backgroundColor: isSelected ? '#FFF0E8' : isToday ? '#FFF8F2' : 'white',
                                      border: isSelected ? '2px solid #FF7F50' : isToday ? '2px solid #FFB899' : '1px solid #F0D9C8',
                                      minHeight: '96px',
                                      width: '72px',
                                    }}
                                  >
                                    <div className="text-xs font-bold" style={{ color: dayColor }}>{dayOfWeek}</div>
                                    <div className="text-xs font-medium" style={{ color: isToday ? '#FF7F50' : '#3D2B1F' }}>{label}</div>
                                    {isProtectedDay && <div style={{ fontSize: '10px' }}>🔒</div>}
                                    {md ? (
                                      <div className="mt-1 space-y-0.5">
                                        <div className="flex items-center gap-0.5 justify-start px-0.5">
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: hasBreakfast ? '#F6AD55' : '#E2D9D0', display: 'inline-block', flexShrink: 0 }} />
                                          <span className="truncate" style={{ fontSize: '9px', color: hasBreakfast ? '#6B5040' : '#C0A898', lineHeight: '1.2' }}>{hasBreakfast ? md.breakfast : '—'}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5 justify-start px-0.5">
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: hasLunch ? '#68D391' : '#E2D9D0', display: 'inline-block', flexShrink: 0 }} />
                                          <span className="truncate" style={{ fontSize: '9px', color: hasLunch ? '#6B5040' : '#C0A898', lineHeight: '1.2' }}>{hasLunch ? md.lunch : '—'}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5 justify-start px-0.5">
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: hasDinner ? '#76E4F7' : '#E2D9D0', display: 'inline-block', flexShrink: 0 }} />
                                          <span className="truncate" style={{ fontSize: '9px', color: hasDinner ? '#6B5040' : '#C0A898', lineHeight: '1.2' }}>{hasDinner ? (md.dinner ?? md.dinnerOptions?.[0]?.name) : '—'}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="mt-1" style={{ color: '#C0A898', fontSize: '9px' }}>未生成</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* モーダルオーバーレイ */}
                            {weekPopupDate && (
                              <div
                                className="fixed inset-0 z-50 flex items-end justify-center"
                                style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
                                onClick={() => setWeekPopupDate(null)}
                              >
                                <div
                                  className="w-full max-w-md rounded-t-2xl p-4 space-y-3"
                                  style={{ backgroundColor: 'white', maxHeight: '80vh', overflowY: 'auto' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* モーダルヘッダー */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-base font-bold" style={{ color: '#3D2B1F' }}>
                                      {(() => {
                                        const [y, mo, d] = weekPopupDate.split('-').map(Number);
                                        const dt = new Date(y, mo - 1, d);
                                        return dt.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
                                      })()}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {popupMenu && (
                                        <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: '#8a7060' }}>
                                          <input
                                            type="checkbox"
                                            checked={!!popupMenu.isProtected}
                                            onChange={(e) => toggleProtect.mutate({ menuPlanId: popupMenu.id, isProtected: e.target.checked })}
                                            className="rounded"
                                          />
                                          🔒 確定
                                        </label>
                                      )}
                                      <button onClick={() => setWeekPopupDate(null)} className="text-sm font-bold" style={{ color: '#8a7060' }}>✕</button>
                                    </div>
                                  </div>
                                  {/* 献立内容 */}
                                  {popupMenuData ? (
                                    <div className="space-y-2">
                                      {popupMenuData.dinnerOptions && popupMenuData.dinnerOptions.length > 0 ? (
                                        <div className="space-y-2">
                                          <p className="text-xs font-medium" style={{ color: '#8a7060' }}>🌙 夕食候補</p>
                                          {popupMenuData.dinnerOptions.map((opt: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 rounded-xl p-2" style={{ backgroundColor: '#FFF8F2', border: '1px solid #F0D9C8' }}>
                                              <span className="text-sm">{['1️⃣','2️⃣','3️⃣'][i]}</span>
                                              <span className="text-sm font-medium" style={{ color: '#3D2B1F' }}>{opt.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          {[
                                            { label: '🌅 朝食', value: popupMenuData.breakfast },
                                            { label: '☀️ 昼食', value: popupMenuData.lunch },
                                            { label: '🌙 夕食', value: popupMenuData.dinner },
                                          ].filter(m => m.value).map(({ label, value }) => (
                                            <div key={label} className="flex items-center gap-2 rounded-xl p-2" style={{ backgroundColor: '#FFF8F2', border: '1px solid #F0D9C8' }}>
                                              <span className="text-sm">{label}</span>
                                              <span className="text-sm font-medium" style={{ color: '#3D2B1F' }}>{value}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {popupMenuData.tips && (
                                        <p className="text-xs" style={{ color: '#6B5040' }}>💡 {popupMenuData.tips}</p>
                                      )}
                                      {popupMenuData.estimatedCost && (
                                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }}>💰 約{popupMenuData.estimatedCost.toLocaleString()}円</span>
                                      )}
                                      {/* 献立削除ボタン */}
                                      <button
                                        className="w-full mt-2 py-2 rounded-xl text-sm font-medium"
                                        style={{ backgroundColor: '#FFF0F0', color: '#E53E3E', border: '1px solid #FEB2B2' }}
                                        onClick={() => {
                                          if (window.confirm('この日の献立を削除しますか？（外食・作らない日用）')) {
                                            deleteMenuPlanMutation.mutate({ menuPlanId: popupMenu!.id });
                                          }
                                        }}
                                        disabled={deleteMenuPlanMutation.isPending}
                                      >
                                        {deleteMenuPlanMutation.isPending ? '削除中...' : '🗑️ この日の献立を削除（外食・作らない日）'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="text-center py-4">
                                      <p className="text-sm mb-2" style={{ color: '#8a7060' }}>この日の献立はまだ生成されていません</p>
                                      {planData?.isPremium && (
                                        <p className="text-xs" style={{ color: '#8a7060' }}>「✨ 週間生成」ボタンで一括生成できます</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : (
                /* ── 日ビュー ── */
                <>
                {menuLoading ? (
                  <div className="text-center py-8" style={{ color: '#8a7060' }}>読み込み中...</div>
                ) : todayMenu && menuData ? (
                  <div className="space-y-3">
                    {/* 夕食3案表示（新形式） */}
                    {menuData.dinnerOptions && menuData.dinnerOptions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium" style={{ color: '#8a7060' }}>🌙 今夜の夕食候補</p>
                        {menuData.dinnerOptions.map((opt, i) => (
                          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: '#FFF8F2', border: '1px solid #F0D9C8' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-base">{["1️⃣","2️⃣","3️⃣"][i]}</span>
                              <span className="text-sm font-medium" style={{ color: '#3D2B1F' }}>{opt.name}</span>
                            </div>
                            {opt.usedFridgeItems.length > 0 && (
                              <p className="text-xs mt-1 ml-7" style={{ color: '#8a7060' }}>冷蔵庫：{opt.usedFridgeItems.join("・")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "🌅 朝食", value: menuData.breakfast, icon: ICON_BREAKFAST },
                          { label: "☀️ 昼食", value: menuData.lunch, icon: ICON_LUNCH },
                          { label: "🌙 夕食", value: menuData.dinner, icon: ICON_DINNER },
                        ].filter(m => m.value).map((meal) => (
                          <div key={meal.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#FFF8F2', border: '1px solid #F0D9C8' }}>
                            <img src={meal.icon} alt="" className="w-8 h-8 object-contain mx-auto mb-1" />
                            <p className="text-xs mb-1" style={{ color: '#8a7060' }}>{meal.label}</p>
                            <p className="text-xs font-medium" style={{ color: '#3D2B1F' }}>{meal.value ?? "未定"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {menuData.dinnerRecipe && (
                      <div className="rounded-xl p-3" style={{ backgroundColor: '#F5F9F0', border: '1px solid #D4E8D4' }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: '#6B9E6B' }}>📝 レシピ</p>
                        <p className="text-sm whitespace-pre-line" style={{ color: '#6B5040' }}>{menuData.dinnerRecipe}</p>
                      </div>
                    )}
                    {menuData.tips && (
                      <div className="flex items-start gap-2 text-sm rounded-xl p-3" style={{ backgroundColor: '#FFF8F2' }}>
                        <span>💡</span>
                        <p style={{ color: '#6B5040' }}>{menuData.tips}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {menuData.estimatedCost && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }}>💰 約{menuData.estimatedCost.toLocaleString()}円</span>
                      )}
                      {todayMenu.isDelivered && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: '#F5F9F0', color: '#6B9E6B', border: '1px solid #B8D8B8' }}>✓ LINE配信済み</span>
                      )}
                    </div>
                    {/* 買い物リスト候補 */}
                    {!showShoppingSelector && menuData.shoppingList && menuData.shoppingList.length > 0 && shoppingList && shoppingList.length === 0 && (
                      <div className="rounded-xl p-3" style={{ border: '1px dashed #FFB899', backgroundColor: '#FFF8F2' }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#FF7F50' }}>🛒 買い物リスト候補があります</p>
                        <Button size="sm" variant="outline" className="text-xs rounded-xl" style={{ borderColor: '#FF7F50', color: '#FF7F50' }} onClick={() => {
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
                    <img src={MASCOT_THINKING} alt="コトコくん" className="w-24 h-24 object-contain mx-auto mb-3" />
                    <p className="mb-4 text-sm" style={{ color: '#8a7060' }}>今日の献立がまだ生成されていません</p>
                    {generateTimedOut ? (
                      <div className="space-y-2">
                        <p className="text-sm text-destructive">⏱ タイムアウトしました（25秒）。ネットワーク接続を確認してください。</p>
                        <Button
                          onClick={() => { setGenerateTimedOut(false); generateMenu.mutate({ date: today }); }}
                          className="text-white font-bold rounded-xl" style={{ backgroundColor: '#FF7F50' }}
                        >
                          再試行する
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={() => generateMenu.mutate({ date: today })} disabled={generateMenu.isPending} className="text-white font-bold rounded-xl" style={{ backgroundColor: '#FF7F50' }}>
                        {generateMenu.isPending ? "AIが献立を考えています..." : "献立を生成する"}
                      </Button>
                    )}
                  </div>
                )}
                </>
                )
                }
              </div>
            </div>

            {/* 家族情報サマリー */}
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #F0D9C8' }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: '#F5F9F0' }}>
                <span className="text-sm font-bold" style={{ color: '#3D2B1F' }}>👨‍👩‍👧 家族構成</span>
                <Link href="/family"><button className="text-xs font-medium" style={{ color: '#6B9E6B' }}>編集</button></Link>
              </div>
              <div className="px-4 py-3" style={{ backgroundColor: 'white' }}>
                {familyData && familyData.members.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {familyData.members.map((m) => (
                      <span key={m.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#F5F9F0', color: '#6B9E6B', border: '1px solid #D4E8D4' }}>{m.name}</span>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: '#8a7060' }}>家族情報を登録すると提案精度が上がります</p>
                    <Link href="/family"><button className="text-xs px-3 py-1 rounded-xl ml-2 font-medium" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }}>登録</button></Link>
                  </div>
                )}
              </div>
            </div>

            {/* 冷蔵庫サマリー */}
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #F0D9C8' }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: '#FFF0E8' }}>
                <div className="flex items-center gap-2">
                  <img src={ICON_FRIDGE} alt="" className="w-5 h-5 object-contain" />
                  <span className="text-sm font-bold" style={{ color: '#3D2B1F' }}>冷蔵庫</span>
                </div>
                <button className="text-xs font-medium" style={{ color: '#FF7F50' }} onClick={() => setActiveTab("fridge")}>管理</button>
              </div>
              <div className="px-4 py-3" style={{ backgroundColor: 'white' }}>
                {fridgeItems && fridgeItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {fridgeItems.slice(0, 6).map((item) => (
                      <span key={item.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#FFF8F2', color: '#6B5040', border: '1px solid #F0D9C8' }}>{item.name}</span>
                    ))}
                    {fridgeItems.length > 6 && <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#FFF8F2', color: '#8a7060', border: '1px solid #F0D9C8' }}>+{fridgeItems.length - 6}</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: '#8a7060' }}>食材を登録してください</p>
                    <button className="text-xs px-3 py-1 rounded-xl ml-2 font-medium" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }} onClick={() => setActiveTab("fridge")}>登録</button>
                  </div>
                )}
              </div>
            </div>

            {/* 機能設定ショートカット */}
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #F0D9C8' }}>
              <div className="px-4 py-2.5" style={{ backgroundColor: '#FFF8F2' }}>
                <span className="text-sm font-bold" style={{ color: '#3D2B1F' }}>⚙️ 機能設定</span>
              </div>
              <div className="px-4 py-3 space-y-3" style={{ backgroundColor: 'white' }}>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/family"><button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#F5F9F0', color: '#6B5040', border: '1px solid #D4E8D4' }}>👨‍👩‍👧 家族構成</button></Link>
                  <button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#F5F9F0', color: '#6B5040', border: '1px solid #D4E8D4' }} onClick={() => setActiveTab("fridge")}>🥦 冷蔵庫管理</button>
                  <button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#F5F9F0', color: '#6B5040', border: '1px solid #D4E8D4' }} onClick={() => setActiveTab("shopping")}>🛒 買い物リスト</button>
                  <Link href="/history"><button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#F5F9F0', color: '#6B5040', border: '1px solid #D4E8D4' }}>📋 献立履歴</button></Link>
                </div>
                <div className="pt-2" style={{ borderTop: '1px solid #F0D9C8' }}>
                  <p className="text-xs mb-2" style={{ color: '#8a7060' }}>📡 LINE自動配信</p>
                  <Link href="/family"><button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }}>配信時間・プラン設定を変更 →</button></Link>
                </div>
                <div className="pt-2" style={{ borderTop: '1px solid #F0D9C8' }}>
                  <p className="text-xs mb-2" style={{ color: '#8a7060' }}>👑 プレミアム機能</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/menu-theme"><button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#FFFBF0', color: '#B8860B', border: '1px solid #F0D878' }}>🎯 献立テーマ設定</button></Link>
                    <Link href="/bento-mode"><button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#FFFBF0', color: '#B8860B', border: '1px solid #F0D878' }}>🍱 お弁当モード</button></Link>
                  </div>
                  <div className="mt-2">
                    <Link href="/plan"><button className="w-full text-xs py-2 px-3 rounded-xl font-medium" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }}>💳 プラン管理・アップグレード</button></Link>
                  </div>
                </div>
              </div>
            </div>

            {/* 過去の献立へのリンク */}
            <Link href="/history">
              <button className="w-full text-sm py-3 rounded-2xl font-medium" style={{ backgroundColor: 'white', color: '#8a7060', border: '1px solid #F0D9C8' }}>📋 過去の献立を見る</button>
            </Link>
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="py-6 mt-4" style={{ borderTop: '1px solid #F0D9C8', backgroundColor: '#FDFAF7' }}>
        <div className="max-w-2xl mx-auto px-4 text-center space-y-2">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <a href="/terms" className="text-xs hover:underline" style={{ color: '#8a7060' }}>利用規約</a>
            <a href="/privacy" className="text-xs hover:underline" style={{ color: '#8a7060' }}>プライバシーポリシー</a>
            <a href="/tokushoho" className="text-xs hover:underline" style={{ color: '#8a7060' }}>特定商取引法に基づく表示</a>
            <a href="/cancel-policy" className="text-xs hover:underline" style={{ color: '#8a7060' }}>キャンセルポリシー</a>
            <a href="/contact" className="text-xs hover:underline" style={{ color: '#8a7060' }}>お問い合わせ</a>
          </div>
          <p className="text-xs" style={{ color: '#b0a090' }}>© 2025 献立日和～coto coto～</p>
        </div>
      </footer>

      {/* カード登録促進ポップアップ（トライアルユーザー向け） */}
      <Dialog open={showTrialPopup} onOpenChange={(open) => { if (!open) setShowTrialPopup(false); }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <img src={MASCOT_HAPPY} alt="" className="w-10 h-10 object-contain" />
              <DialogTitle className="text-base font-bold" style={{ color: '#FF7F50' }}>20日間 全機能無料体験</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-foreground leading-relaxed">
              カード登録するだけで、プレミアム機能が<strong className="text-primary">20日間タダ</strong>で使えます！
              <br /><br />
              <span className="text-xs text-muted-foreground">✓ AI高精度献立（天気・栄養考慮）</span><br />
              <span className="text-xs text-muted-foreground">✓ 買い物リスト自動生成</span><br />
              <span className="text-xs text-muted-foreground">✓ チラシ・レシート解析</span><br />
              <span className="text-xs text-muted-foreground">✓ 献立テーマ・お弁当モード</span>
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground text-center mt-1">20日後は月額480円 ／ いつでも解約OK</p>
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
            onClick={() => {
              setShowTrialPopup(false);
              createCheckout.mutate({ origin: window.location.origin });
            }}
            disabled={createCheckout.isPending}
          >
            {createCheckout.isPending ? "処理中..." : "✨ 今すぐカード登録して始める"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground mt-0"
            onClick={() => setShowTrialPopup(false)}
          >
            あとで
          </Button>
        </DialogContent>
      </Dialog>

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

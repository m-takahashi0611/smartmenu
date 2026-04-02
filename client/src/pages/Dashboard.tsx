import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Dashboard() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  // 献立生成後の買い物リスト候補（選択制）
  const [shoppingCandidates, setShoppingCandidates] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showShoppingSelector, setShowShoppingSelector] = useState(false);

  const { data: todayMenu, isLoading: menuLoading } = trpc.menu.getByDate.useQuery({ date: today });
  const { data: shoppingList, isLoading: shoppingLoading } = trpc.shopping.list.useQuery({ date: today });
  const { data: fridgeItems } = trpc.fridge.list.useQuery();
  const { data: familyData } = trpc.family.getProfile.useQuery();

  const utils = trpc.useUtils();

  const generateMenu = trpc.menu.getOrGenerate.useMutation({
    onSuccess: (data) => {
      utils.menu.getByDate.invalidate({ date: today });
      // 買い物リスト候補をセット（自動追加はしない）
      if (data.shoppingList && data.shoppingList.length > 0) {
        setShoppingCandidates(data.shoppingList);
        setSelectedItems(new Set(data.shoppingList)); // デフォルト全選択
        setShowShoppingSelector(true);
      }
      toast.success("献立を生成しました！", {
        description: "下の買い物リストから必要なものを選んで追加してください。",
      });
    },
    onError: (err) => {
      toast.error("エラー", { description: err.message });
    },
  });

  const addShoppingItem = trpc.shopping.add.useMutation();

  const handleAddSelectedToShoppingList = async () => {
    const itemsToAdd = Array.from(selectedItems);
    if (itemsToAdd.length === 0) {
      toast.info("追加する項目が選択されていません");
      return;
    }
    try {
      for (const item of itemsToAdd) {
        await addShoppingItem.mutateAsync({ name: item, date: today });
      }
      await utils.shopping.list.invalidate({ date: today });
      setShowShoppingSelector(false);
      setShoppingCandidates([]);
      setSelectedItems(new Set());
      toast.success(`${itemsToAdd.length}品を買い物リストに追加しました！`);
    } catch {
      toast.error("追加に失敗しました");
    }
  };

  const sendToLine = trpc.menu.sendToLine.useMutation({
    onSuccess: () => {
      toast.success("LINEに送信しました！", { description: "献立をLINEに送信しました。" });
    },
    onError: (err) => {
      toast.error("送信エラー", { description: err.message });
    },
  });

  const toggleItem = trpc.shopping.toggle.useMutation({
    onSuccess: () => {
      utils.shopping.list.invalidate({ date: today });
    },
  });

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
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="text-xl">🍽️</span>
              <span className="font-bold text-primary">献立日和〜coto coto〜</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/fridge">
              <Button variant="ghost" size="sm">🥦 冷蔵庫</Button>
            </Link>
            <Link href="/family">
              <Button variant="ghost" size="sm">👨‍👩‍👧 家族</Button>
            </Link>
            <Link href="/stores">
              <Button variant="ghost" size="sm">🏪 店舗</Button>
            </Link>
            <Link href="/history">
              <Button variant="ghost" size="sm">📋 履歴</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* ウェルカムメッセージ */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">
            こんにちは、{user?.name ?? "ゲスト"}さん 👋
          </h1>
          <p className="text-muted-foreground">{formatDate(today)}の献立</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* 今日の献立カード */}
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">🍽️ 今日の献立</CardTitle>
                  <div className="flex gap-2">
                    {!todayMenu && (
                      <Button
                        size="sm"
                        onClick={() => generateMenu.mutate({ date: today })}
                        disabled={generateMenu.isPending}
                        className="bg-primary text-primary-foreground"
                      >
                        {generateMenu.isPending ? "生成中..." : "献立を生成"}
                      </Button>
                    )}
                    {todayMenu && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendToLine.mutate({ date: today })}
                          disabled={sendToLine.isPending}
                        >
                          {sendToLine.isPending ? "送信中..." : "📱 LINEに送信"}
                        </Button>
                      </>
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
                      /* 旧形式・朝食/昼食の単品表示 */
                      <div className="grid grid-cols-3 gap-3">
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
                        <p className="text-xs font-semibold text-primary mb-1">📝 夕食レシピ</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{menuData.dinnerRecipe}</p>
                      </div>
                    )}
                    {menuData.tips && (
                      <div className="flex items-start gap-2 text-sm">
                        <span>💡</span>
                        <p className="text-muted-foreground">{menuData.tips}</p>
                      </div>
                    )}
                    {menuData.estimatedCost && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">💰 目安費用：約{menuData.estimatedCost.toLocaleString()}円</Badge>
                        {todayMenu.isDelivered && <Badge variant="outline" className="text-green-600 border-green-200">✓ LINE配信済み</Badge>}
                      </div>
                    )}
                    {!menuData.estimatedCost && todayMenu.isDelivered && (
                      <Badge variant="outline" className="text-green-600 border-green-200">✓ LINE配信済み</Badge>
                    )}
                    {/* 買い物リスト候補（既存献立から表示） */}
                    {!showShoppingSelector && menuData.shoppingList && menuData.shoppingList.length > 0 && shoppingList && shoppingList.length === 0 && (
                      <div className="border border-dashed border-primary/40 rounded-lg p-3 bg-primary/5">
                        <p className="text-xs font-semibold text-primary mb-2">🛒 買い物リスト候補</p>
                        <p className="text-xs text-muted-foreground mb-2">必要なものを選んで買い物リストに追加できます</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            setShoppingCandidates(menuData.shoppingList!);
                            setSelectedItems(new Set(menuData.shoppingList!));
                            setShowShoppingSelector(true);
                          }}
                        >
                          🛒 買い物リストを選択して追加
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">🍽️</div>
                    <p className="text-muted-foreground mb-4">今日の献立がまだ生成されていません</p>
                    <Button
                      onClick={() => generateMenu.mutate({ date: today })}
                      disabled={generateMenu.isPending}
                      className="bg-primary text-primary-foreground"
                    >
                      {generateMenu.isPending ? "AI が献立を考えています..." : "献立を生成する"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 買い物リスト選択UI（献立生成直後に表示） */}
            {showShoppingSelector && shoppingCandidates.length > 0 && (
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-primary">🛒 買い物リストに追加する</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    必要なものにチェックを入れて「追加する」を押してください
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="flex gap-2 mb-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setSelectedItems(new Set(shoppingCandidates))}
                      >
                        全て選択
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setSelectedItems(new Set())}
                      >
                        全て解除
                      </Button>
                    </div>
                    {shoppingCandidates.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-3 cursor-pointer py-1"
                        onClick={() => toggleCandidate(item)}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedItems.has(item) ? "bg-primary border-primary" : "border-border bg-background"}`}>
                          {selectedItems.has(item) && <span className="text-primary-foreground text-xs">✓</span>}
                        </div>
                        <span className={`text-sm ${!selectedItems.has(item) ? "text-muted-foreground line-through" : ""}`}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddSelectedToShoppingList}
                      disabled={addShoppingItem.isPending || selectedItems.size === 0}
                      className="bg-primary text-primary-foreground"
                      size="sm"
                    >
                      {addShoppingItem.isPending ? "追加中..." : `✓ ${selectedItems.size}品を買い物リストに追加`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => {
                        setShowShoppingSelector(false);
                        setShoppingCandidates([]);
                        setSelectedItems(new Set());
                      }}
                    >
                      スキップ
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 買い物リスト */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">🛒 今日の買い物リスト</CardTitle>
                  <Link href="/shopping">
                    <Button variant="ghost" size="sm" className="text-xs">すべて見る →</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {shoppingLoading ? (
                  <div className="text-muted-foreground text-sm">読み込み中...</div>
                ) : shoppingList && shoppingList.length > 0 ? (
                  <div className="space-y-2">
                    {shoppingList.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => toggleItem.mutate({ id: item.id, isChecked: !item.isChecked })}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.isChecked ? "bg-primary border-primary" : "border-border"}`}>
                          {item.isChecked && <span className="text-primary-foreground text-xs">✓</span>}
                        </div>
                        <span className={`text-sm ${item.isChecked ? "line-through text-muted-foreground" : ""}`}>
                          {item.name}
                        </span>
                      </div>
                    ))}
                    {shoppingList.length > 6 && (
                      <p className="text-xs text-muted-foreground">他 {shoppingList.length - 6} 品...</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {todayMenu ? "献立の買い物リスト候補から必要なものを選んで追加してください" : "献立を生成すると買い物リストが作成できます"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* サイドバー */}
          <div className="space-y-4">
            {/* 家族情報 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">👨‍👩‍👧 家族</CardTitle>
                  <Link href="/family">
                    <Button variant="ghost" size="sm" className="text-xs">編集</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {familyData ? (
                  <div>
                    <p className="text-sm font-medium mb-2">{familyData.profile.familyName ?? "家族"}</p>
                    <p className="text-sm text-muted-foreground">{familyData.members.length}人</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {familyData.members.map((m) => (
                        <Badge key={m.id} variant="secondary" className="text-xs">{m.name}</Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground mb-2">家族情報を登録してください</p>
                    <Link href="/family">
                      <Button size="sm" variant="outline" className="text-xs">登録する</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 冷蔵庫在庫 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">🥦 冷蔵庫</CardTitle>
                  <Link href="/fridge">
                    <Button variant="ghost" size="sm" className="text-xs">管理</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {fridgeItems && fridgeItems.length > 0 ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{fridgeItems.length}品登録中</p>
                    <div className="flex flex-wrap gap-1">
                      {fridgeItems.slice(0, 5).map((item) => (
                        <Badge key={item.id} variant="outline" className="text-xs">{item.name}</Badge>
                      ))}
                      {fridgeItems.length > 5 && (
                        <Badge variant="outline" className="text-xs">+{fridgeItems.length - 5}</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground mb-2">食材を登録してください</p>
                    <Link href="/fridge">
                      <Button size="sm" variant="outline" className="text-xs">登録する</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* クイックリンク */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">⚡ クイックアクション</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/fridge">
                  <Button variant="outline" size="sm" className="w-full justify-start text-sm">
                    🥦 食材を追加
                  </Button>
                </Link>
                <Link href="/stores">
                  <Button variant="outline" size="sm" className="w-full justify-start text-sm">
                    🏪 特売情報を更新
                  </Button>
                </Link>
                <Link href="/history">
                  <Button variant="outline" size="sm" className="w-full justify-start text-sm">
                    📋 過去の献立を見る
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

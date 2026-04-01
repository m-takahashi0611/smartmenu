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

  const { data: todayMenu, isLoading: menuLoading } = trpc.menu.getByDate.useQuery({ date: today });
  const { data: shoppingList, isLoading: shoppingLoading } = trpc.shopping.list.useQuery({ date: today });
  const { data: fridgeItems } = trpc.fridge.list.useQuery();
  const { data: familyData } = trpc.family.getProfile.useQuery();

  const generateMenu = trpc.menu.getOrGenerate.useMutation({
    onSuccess: () => {
      utils.menu.getByDate.invalidate({ date: today });
      utils.shopping.list.invalidate({ date: today });
      toast.success("献立を生成しました！", { description: "今日の献立が準備できました。" });
    },
    onError: (err) => {
      toast.error("エラー", { description: err.message });
    },
  });

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

  const utils = trpc.useUtils();

  const menuData = todayMenu?.menuData as {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    dinnerRecipe?: string;
    tips?: string;
    estimatedCost?: number;
  } | null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendToLine.mutate({ date: today })}
                        disabled={sendToLine.isPending}
                      >
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
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "🌅 朝食", value: menuData.breakfast },
                        { label: "☀️ 昼食", value: menuData.lunch },
                        { label: "🌙 夕食", value: menuData.dinner },
                      ].map((meal) => (
                        <div key={meal.label} className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">{meal.label}</p>
                          <p className="text-sm font-medium">{meal.value ?? "未定"}</p>
                        </div>
                      ))}
                    </div>
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
                  <p className="text-sm text-muted-foreground">買い物リストはありません</p>
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

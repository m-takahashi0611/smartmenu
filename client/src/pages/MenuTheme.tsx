import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Lock, Crown, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── テーマデータ定義 ───────────────────────────────────────────────────
const THEME_CATEGORIES = [
  {
    id: "health",
    label: "健康・体型管理",
    emoji: "💪",
    items: [
      { id: "diet", label: "ダイエット", desc: "カロリー控えめ・低糖質・満腹感重視" },
      { id: "muscle", label: "筋トレ・増量", desc: "高タンパク・低脂質・ボリューム重視" },
      { id: "low_salt", label: "塩分控えめ", desc: "高血圧・むくみ対策向け" },
      { id: "low_sugar", label: "糖質制限", desc: "糖尿病・血糖値管理向け" },
      { id: "gut", label: "腸活・発酵食品", desc: "腸内環境改善・食物繊維重視" },
    ],
  },
  {
    id: "lifestage",
    label: "ライフステージ・家族構成",
    emoji: "👨‍👩‍👧",
    items: [
      { id: "baby_food", label: "離乳食対応", desc: "月齢別の柔らかさ・味付けに配慮" },
      { id: "toddler", label: "幼児食対応", desc: "1～6歳向け、食べやすい・好き嫌い対策" },
      { id: "teen", label: "ティーン（中高生）", desc: "成長期の高カロリー・高タンパク質・部活対応" },
      { id: "exam", label: "受験生応援", desc: "脳に良い食材・集中力UP・夜食対応" },
      { id: "senior", label: "シニア向け", desc: "柔らかめ・消化に良い・栄養密度高め" },
    ],
  },
  {
    id: "economy",
    label: "経済・節約",
    emoji: "💰",
    items: [
      { id: "budget", label: "家計節約", desc: "食費を抑えた食材選び・コスパ重視" },
      { id: "month_end", label: "月末節約モード", desc: "冷蔵庫の残り食材を使い切る" },
      { id: "batch_cook", label: "作り置き・大量調理", desc: "週末まとめ調理で平日を楽に" },
    ],
  },
  {
    id: "style",
    label: "調理スタイル",
    emoji: "🍳",
    items: [
      { id: "quick", label: "時短・簡単", desc: "15分以内・工程少なめ" },
      { id: "elaborate", label: "本格・こだわり", desc: "手間をかけた丁寧な料理" },
    ],
  },
  {
    id: "dishCount",
    label: "食卓イメージ（品数）",
    emoji: "🍽️",
    items: [
      { id: "ichiju_issai", label: "一汁一菜（シンプル）", desc: "汁物＋主菜のシンプル構成" },
      { id: "ichiju_nisai", label: "一汁二菜（標準）", desc: "汁物＋主菜＋副菜1品の標準的構成" },
      { id: "ichiju_sansai", label: "一汁三菜（充実）", desc: "汁物＋主菜＋副菜2品の充実した構成" },
      { id: "ichiju_yonsai", label: "一汁四菜（豪華）", desc: "汁物＋主菜＋副菜3品以上の豪華な構成" },
    ],
  },
];
// カテゴリIDからテーマキーを取得するヘルパー
function getCategoryForItem(itemId: string): string | null {
  for (const cat of THEME_CATEGORIES) {
    if (cat.items.some((i) => i.id === itemId)) return cat.id;
  }
  return null;
}

export default function MenuTheme() {
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  // カテゴリ別に1つだけ選択（同カテゴリ排他）
  // health・lifestageは複数選択可（string[]）、economy・styleは1択（string|null）
  const [selectedHealth, setSelectedHealth] = useState<string[]>([]);
  const [selectedLifestage, setSelectedLifestage] = useState<string[]>([]);
  const [selectedEconomy, setSelectedEconomy] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedDishCount, setSelectedDishCount] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: planData } = trpc.subscription.getMyPlan.useQuery();
  const IS_PREMIUM = planData?.isPremium ?? false;
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, navigate] = useLocation();

  // DBからベーステーマを取得して初期化
  const { data: savedTheme } = trpc.menuTheme.get.useQuery(undefined, {
    enabled: IS_PREMIUM,
  });
  // savedThemeが取得できたら初期値にセット（一度だけ）
  const [initialized, setInitialized] = useState(false);
  if (savedTheme && !initialized) {
    setSelectedHealth(savedTheme.healthThemes ?? []);
    setSelectedLifestage(savedTheme.lifestageThemes ?? []);
    setSelectedEconomy(savedTheme.economyTheme ?? null);
    setSelectedStyle(savedTheme.styleTheme ?? null);
    setSelectedDishCount((savedTheme as any).dishCountTheme ?? null);
    setInitialized(true);
  }

  // 家族構成データを取得してライフステージテーマを自動推薦
  const { data: familyData } = trpc.family.getProfile.useQuery(undefined, {
    enabled: IS_PREMIUM,
  });
  // 家族構成からライフステージテーマを推薦
  const recommendedLifestage = (() => {
    if (!familyData?.members?.length) return null;
    const ageGroups = familyData.members.map((m: { ageGroup: string }) => m.ageGroup);
    if (ageGroups.includes("baby")) return "baby_food";
    if (ageGroups.includes("child")) return "toddler";
    if (ageGroups.includes("teen")) return "exam";
    if (ageGroups.includes("senior")) return "senior";
    return null;
  })();
  const recommendedLabel = (() => {
    if (!recommendedLifestage) return null;
    const cat = THEME_CATEGORIES.find((c) => c.id === "lifestage");
    return cat?.items.find((i) => i.id === recommendedLifestage)?.label ?? null;
  })();

  const saveMutation = trpc.menuTheme.save.useMutation({
    onSuccess: () => {
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleItem = (itemId: string) => {
    if (!IS_PREMIUM) {
      setShowUpgradeDialog(true);
      return;
    }
    const catId = getCategoryForItem(itemId);
    if (!catId) return;
    if (catId === "health") {
      setSelectedHealth((prev) =>
        prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]
      );
    } else if (catId === "lifestage") {
      setSelectedLifestage((prev) =>
        prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]
      );
    } else if (catId === "economy") {
      setSelectedEconomy((prev) => (prev === itemId ? null : itemId));
    } else if (catId === "style") {
      setSelectedStyle((prev) => (prev === itemId ? null : itemId));
    } else if (catId === "dishCount") {
      setSelectedDishCount((prev) => (prev === itemId ? null : itemId));
    }
    setSaved(false);
  };

  // 選択中アイテムの配列（表示用・バッジカウント用）
  const selectedItems = [
    ...selectedHealth,
    ...selectedLifestage,
    ...(selectedEconomy ? [selectedEconomy] : []),
    ...(selectedStyle ? [selectedStyle] : []),
    ...(selectedDishCount ? [selectedDishCount] : []),
  ];

  const handleSave = () => {
    saveMutation.mutate({
      healthThemes: selectedHealth,
      lifestageThemes: selectedLifestage,
      economyTheme: selectedEconomy,
      styleTheme: selectedStyle,
      dishCountTheme: selectedDishCount,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-background border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            ← 戻る
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">献立テーマ設定</h1>
          <p className="text-xs text-muted-foreground">家族の目標に合わせた献立を提案します</p>
        </div>
        {!IS_PREMIUM && (
          <Badge className="bg-amber-500 text-white text-xs gap-1">
            <Crown className="w-3 h-3" />
            プレミアム
          </Badge>
        )}
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">

        {/* プレミアム案内バナー（無料ユーザーのみ） */}
        {!IS_PREMIUM && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Crown className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    プレミアム機能です
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    献立テーマ設定は月額480円のプレミアムプランでご利用いただけます。
                    テーマを設定すると、AIが家族の目標に合わせた献立を毎回提案します。
                  </p>
                  <Button size="sm" className="mt-2 bg-amber-500 hover:bg-amber-600 text-white text-xs">
                    45日間無料で試す →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 説明バナー（プレミアムユーザー向け） */}
        {IS_PREMIUM && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
            <span className="text-sm mt-0.5">💡</span>
            <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">
              <span className="font-semibold">一度設定すれば毎回自動で反映されます。</span>
              テーマを保存するだけで、AIが毎日の献立提案に自動で反映します。
            </p>
          </div>
        )}

        {/* テーマカテゴリ一覧 */}
        {THEME_CATEGORIES.map((category) => {
          const isOpen = openCategories.includes(category.id);
          const selectedInCategory = category.items.filter((i) =>
            selectedItems.includes(i.id)
          ).length;
          // ライフステージカテゴリの場合、家族構成からの推薦を表示
          const showRecommendation =
            IS_PREMIUM &&
            category.id === "lifestage" &&
            recommendedLifestage !== null &&
            !selectedLifestage.includes(recommendedLifestage);

          return (
            <Card
              key={category.id}
              className={!IS_PREMIUM ? "opacity-75" : ""}
            >
              {/* 家族構成からの推薦バナー */}
              {showRecommendation && (
                <div className="mx-4 mt-3 mb-0 p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">👨‍👩‍👧</span>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      家族構成から「{recommendedLabel}」を推薦
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLifestage((prev) =>
                        prev.includes(recommendedLifestage) ? prev : [...prev, recommendedLifestage]
                      );
                      setSaved(false);
                    }}
                  >
                    適用する
                  </Button>
                </div>
              )}
              {/* 中項目ヘッダー（タップで展開） */}
              <button
                className="w-full text-left"
                onClick={() => toggleCategory(category.id)}
              >
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{category.emoji}</span>
                      <CardTitle className="text-sm font-semibold">
                        {category.label}
                      </CardTitle>
                      {selectedInCategory > 0 && (
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                          {selectedInCategory}件選択中
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!IS_PREMIUM && (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </button>

              {/* 詳細項目（展開時） */}
              {isOpen && (
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="space-y-2 border-t border-border/30 pt-3">
                    {category.items.map((item) => {
                      const isSelected =
                        category.id === "health"
                          ? selectedHealth.includes(item.id)
                          : category.id === "lifestage"
                          ? selectedLifestage.includes(item.id)
                          : category.id === "economy"
                          ? selectedEconomy === item.id
                          : selectedStyle === item.id;
                      return (
                        <button
                          key={item.id}
                          className={`w-full text-left flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                            IS_PREMIUM
                              ? isSelected
                                ? "bg-primary/10 border border-primary/30"
                                : "bg-muted/40 hover:bg-muted/70 border border-transparent"
                              : "bg-muted/20 cursor-not-allowed"
                          }`}
                          onClick={() => toggleItem(item.id)}
                          disabled={!IS_PREMIUM}
                        >
                          {/* health/lifestageはチェックボックス風、economy/styleはラジオボタン風 */}
                          <div
                            className={`w-5 h-5 ${category.id === "health" || category.id === "lifestage" ? "rounded-md" : "rounded-full"} border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              isSelected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {isSelected && (
                              category.id === "health" || category.id === "lifestage"
                                ? <Check className="w-3 h-3 text-white" />
                                : <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${!IS_PREMIUM ? "text-muted-foreground" : ""}`}>
                              {item.label}
                              {!IS_PREMIUM && (
                                <Lock className="w-3 h-3 inline ml-1 text-muted-foreground/60" />
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* 保存ボタン（プレミアムユーザーのみ） */}
        {IS_PREMIUM && (
          <>
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saved || saveMutation.isPending}
            >
              {saved ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" /> 保存しました
                </span>
              ) : saveMutation.isPending ? (
                "保存中..."
              ) : (
                "テーマ設定を保存する"
              )}
            </Button>
            {saveError && (
              <p className="text-xs text-destructive text-center">{saveError}</p>
            )}
          </>
        )}

        {/* 選択中テーマのサマリー（プレミアムユーザー） */}
        {IS_PREMIUM && selectedItems.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3">
              <p className="text-xs font-medium text-primary mb-2">✅ 選択中のテーマ（AIに反映されます）</p>
              <div className="flex flex-wrap gap-1.5">
                {THEME_CATEGORIES.flatMap((c) =>
                  c.items
                    .filter((i) => selectedItems.includes(i.id))
                    .map((i) => (
                      <Badge key={i.id} variant="secondary" className="text-xs bg-primary/10 text-primary">
                        {i.label}
                      </Badge>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="h-8" />
      </div>

      {/* 課金確認ダイアログ */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              プレミアムプランの追加
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              設定を変更するには、月額480円のプレミアムプランへの登録が必要です。
              課金対象プランへの追加になりますが、よろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                setShowUpgradeDialog(false);
                navigate("/premium"); // アップグレードページ（後で実装）
              }}
            >
              プレミアムにアップグレードする
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowUpgradeDialog(false)}
            >
              キャンセル
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

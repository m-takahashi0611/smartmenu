import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";

type ActualStatus = "cooked" | "ordered" | "ate_out" | "skipped" | "other" | null | undefined;

function ActualStatusBadge({ status, meal }: { status: ActualStatus; meal?: string | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; color: string }> = {
    cooked: { label: "✅ 作った", color: "text-green-700 bg-green-50 border-green-200" },
    ordered: { label: "🛵 出前", color: "text-blue-700 bg-blue-50 border-blue-200" },
    ate_out: { label: "🏢 外食", color: "text-orange-700 bg-orange-50 border-orange-200" },
    skipped: { label: "🚫 食べてない", color: "text-gray-600 bg-gray-50 border-gray-200" },
    other: { label: "🍽️ 別の料理", color: "text-purple-700 bg-purple-50 border-purple-200" },
  };
  const info = map[status] ?? { label: status, color: "text-gray-600 bg-gray-50 border-gray-200" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`}>
      {info.label}
      {meal && status === "other" && <span className="ml-1 text-xs opacity-80">（{meal}）</span>}
    </span>
  );
}

export default function History() {
  const { data: plans, isLoading, error } = trpc.menu.list.useQuery({ limit: 14 });
  const isForbidden = error instanceof TRPCClientError && error.data?.code === "FORBIDDEN";

  const formatDate = (dateVal: any) => {
    const d = new Date(dateVal);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${["日","月","火","水","木","金","土"][d.getDay()]}）`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">← 戻る</Button>
            </Link>
            <h1 className="font-bold text-lg">📋 献立履歴</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : isForbidden ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔒</div>
            <p className="font-semibold mb-2">献立履歴はカード登録後にご利用いただけます</p>
            <p className="text-sm text-muted-foreground mb-6">トライアル期間中はご利用いただけません</p>
            <Link href="/plan">
              <Button>👑 プレミアムにアップグレード</Button>
            </Link>
          </div>
        ) : !plans || plans.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-muted-foreground mb-2">献立履歴がありません</p>
            <p className="text-sm text-muted-foreground">ダッシュボードから献立を生成してください</p>
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map((plan) => {
              const menuData = plan.menuData as {
                breakfast?: string;
                lunch?: string;
                dinner?: string;
                estimatedCost?: number;
                options?: Array<{ name: string }>;
              } | null;

              const meals = [
                {
                  label: "🌅 朝食",
                  value: menuData?.breakfast,
                  status: (plan as any).actualStatusBreakfast as ActualStatus,
                  actualMeal: (plan as any).actualMealBreakfast as string | null,
                },
                {
                  label: "☀️ 昼食",
                  value: menuData?.lunch,
                  status: (plan as any).actualStatusLunch as ActualStatus,
                  actualMeal: (plan as any).actualMealLunch as string | null,
                },
                {
                  label: "🌙 夕食",
                  value: menuData?.dinner ?? menuData?.options?.[0]?.name,
                  status: (plan as any).actualStatusDinner as ActualStatus,
                  actualMeal: (plan as any).actualMealDinner as string | null,
                },
              ];
              const hasAnyActual = meals.some((m) => m.status);

              return (
                <Card key={plan.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base">{formatDate(plan.planDate)}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        {hasAnyActual && (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                            📝 実食記録あり
                          </Badge>
                        )}
                        {plan.isDelivered && (
                          <Badge variant="outline" className="text-green-600 border-green-200 text-xs">
                            ✓ LINE配信済み
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {menuData ? (
                      <div className="space-y-2">
                        {meals.map((meal) => (
                          <div key={meal.label} className="flex items-start gap-3 bg-muted/40 rounded-lg px-3 py-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5">{meal.label}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{meal.value ?? "未定"}</p>
                              {meal.status && (
                                <div className="mt-1">
                                  <ActualStatusBadge status={meal.status} meal={meal.actualMeal} />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">献立データなし</p>
                    )}
                    {menuData?.estimatedCost && (
                      <p className="text-xs text-muted-foreground mt-2">
                        💰 目安費用：約{menuData.estimatedCost.toLocaleString()}円
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

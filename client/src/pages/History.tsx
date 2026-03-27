import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function History() {
  const { data: plans, isLoading } = trpc.menu.list.useQuery({ limit: 14 });

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
              } | null;

              return (
                <Card key={plan.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{formatDate(plan.planDate)}</CardTitle>
                      {plan.isDelivered && (
                        <Badge variant="outline" className="text-green-600 border-green-200 text-xs">
                          ✓ LINE配信済み
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {menuData ? (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "🌅 朝食", value: menuData.breakfast },
                          { label: "☀️ 昼食", value: menuData.lunch },
                          { label: "🌙 夕食", value: menuData.dinner },
                        ].map((meal) => (
                          <div key={meal.label} className="bg-muted/50 rounded-lg p-2 text-center">
                            <p className="text-xs text-muted-foreground mb-1">{meal.label}</p>
                            <p className="text-xs font-medium">{meal.value ?? "未定"}</p>
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

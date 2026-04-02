import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "vegetable", label: "🥦 野菜" },
  { value: "meat", label: "🥩 肉類" },
  { value: "fish", label: "🐟 魚介" },
  { value: "dairy", label: "🥛 乳製品" },
  { value: "egg", label: "🥚 卵" },
  { value: "seasoning", label: "🧂 調味料" },
  { value: "frozen", label: "🧊 冷凍食品" },
  { value: "other", label: "📦 その他" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export default function Fridge() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [category, setCategory] = useState<Category>("other");

  const { data: items, isLoading } = trpc.fridge.list.useQuery();
  const utils = trpc.useUtils();

  const addItem = trpc.fridge.add.useMutation({
    onSuccess: () => {
      utils.fridge.list.invalidate();
      setOpen(false);
      setName("");
      setQuantity("");
      setExpiryDate("");
      setCategory("other");
      toast.success("食材を追加しました");
    },
    onError: (err) => toast.error("追加に失敗しました", { description: err.message }),
  });

  const deleteItem = trpc.fridge.delete.useMutation({
    onSuccess: () => {
      utils.fridge.list.invalidate();
      toast.success("食材を削除しました");
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const adjustQty = trpc.fridge.adjustQuantity.useMutation({
    onSuccess: (data) => {
      utils.fridge.list.invalidate();
      if (data.deleted) toast.success("食材を削除しました");
    },
    onError: (err) => toast.error("更新に失敗しました", { description: err.message }),
  });

  const handleAdd = () => {
    if (!name.trim()) return;
    addItem.mutate({
      name: name.trim(),
      quantity: quantity || undefined,
      expiryDate: expiryDate || undefined,
      category,
    });
  };

  const isExpiringSoon = (dateStr: string | null) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 3;
  };

  const getCategoryLabel = (cat: string | null) => {
    return CATEGORIES.find((c) => c.value === cat)?.label ?? "📦 その他";
  };

  const groupedItems = CATEGORIES.map((cat) => ({
    ...cat,
    items: (items ?? []).filter((item) => item.category === cat.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">← 戻る</Button>
            </Link>
            <h1 className="font-bold text-lg">🥦 冷蔵庫管理</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground">+ 食材を追加</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>食材を追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="name">食材名 *</Label>
                  <Input
                    id="name"
                    placeholder="例：キャベツ、鶏もも肉"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="quantity">量</Label>
                  <Input
                    id="quantity"
                    placeholder="例：1個、300g"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="expiry">消費期限</Label>
                  <Input
                    id="expiry"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>カテゴリ</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={!name.trim() || addItem.isPending}
                  className="w-full bg-primary text-primary-foreground"
                >
                  {addItem.isPending ? "追加中..." : "追加する"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : !items || items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🥦</div>
            <p className="text-muted-foreground mb-4">冷蔵庫に食材が登録されていません</p>
            <p className="text-sm text-muted-foreground">食材を登録すると、AIが在庫を考慮した献立を提案します</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 期限切れ間近の食材 */}
            {items.some((item) => isExpiringSoon(item.expiryDate ? String(item.expiryDate) : null)) && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-orange-700">⚠️ 期限切れ間近</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {items
                      .filter((item) => isExpiringSoon(item.expiryDate ? String(item.expiryDate) : null))
                      .map((item) => (
                        <Badge key={item.id} className="bg-orange-100 text-orange-700 border-orange-200">
                          {item.name}（{item.expiryDate ? String(item.expiryDate) : ""}）
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* カテゴリ別一覧 */}
            {groupedItems.map((group) => (
              <Card key={group.value}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{group.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.quantity && (
                                <span className="text-xs text-muted-foreground">{item.quantity}</span>
                              )}
                              {item.expiryDate && (
                                <span className={`text-xs ${isExpiringSoon(String(item.expiryDate)) ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                                  期限: {String(item.expiryDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-base font-bold"
                            onClick={() => adjustQty.mutate({ id: item.id, delta: -1 })}
                            disabled={adjustQty.isPending}
                          >
                            −
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-base font-bold"
                            onClick={() => adjustQty.mutate({ id: item.id, delta: 1 })}
                            disabled={adjustQty.isPending}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            <p className="text-center text-sm text-muted-foreground">
              合計 {items.length} 品登録中
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

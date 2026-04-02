import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Shopping() {
  const [newItem, setNewItem] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const { data: items, isLoading } = trpc.shopping.list.useQuery({ date: today });
  const utils = trpc.useUtils();

  const addItem = trpc.shopping.add.useMutation({
    onSuccess: () => {
      utils.shopping.list.invalidate({ date: today });
      setNewItem("");
    },
    onError: (err) => toast.error("追加に失敗しました", { description: err.message }),
  });

  const toggleItem = trpc.shopping.toggle.useMutation({
    onMutate: async ({ id, isChecked }) => {
      await utils.shopping.list.cancel({ date: today });
      const prev = utils.shopping.list.getData({ date: today });
      utils.shopping.list.setData({ date: today }, (old) =>
        old?.map((item) => item.id === id ? { ...item, isChecked } : item)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      utils.shopping.list.setData({ date: today }, ctx?.prev);
    },
    onSettled: () => utils.shopping.list.invalidate({ date: today }),
  });

  const deleteItem = trpc.shopping.delete.useMutation({
    onSuccess: () => utils.shopping.list.invalidate({ date: today }),
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const deleteChecked = trpc.shopping.deleteChecked.useMutation({
    onSuccess: (data) => {
      utils.shopping.list.invalidate({ date: today });
      toast.success(`購入済み ${data.deletedCount} 件を削除しました`);
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const checkedCount = items?.filter((i) => i.isChecked).length ?? 0;
  const totalCount = items?.length ?? 0;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">← 戻る</Button>
            </Link>
            <h1 className="font-bold text-lg">🛒 買い物リスト</h1>
          </div>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {checkedCount}/{totalCount} 完了
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-muted-foreground mb-4">{formatDate(today)}</p>

        {/* アイテム追加 */}
        <div className="flex gap-2 mb-6">
          <Input
            placeholder="食材を追加..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newItem.trim()) {
                addItem.mutate({ name: newItem.trim(), date: today });
              }
            }}
          />
          <Button
            onClick={() => newItem.trim() && addItem.mutate({ name: newItem.trim(), date: today })}
            disabled={!newItem.trim() || addItem.isPending}
            className="bg-primary text-primary-foreground"
          >
            追加
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : !items || items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-muted-foreground mb-2">買い物リストはありません</p>
            <p className="text-sm text-muted-foreground">献立を生成すると自動的にリストが作成されます</p>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">今日の買い物リスト</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {/* 未チェック */}
                {items.filter((i) => !i.isChecked).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer group"
                    onClick={() => toggleItem.mutate({ id: item.id, isChecked: true })}
                  >
                    <div className="w-5 h-5 rounded border-2 border-border flex items-center justify-center flex-shrink-0" />
                    <span className="flex-1 text-sm">{item.name}</span>
                    {item.quantity && (
                      <span className="text-xs text-muted-foreground">{item.quantity}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteItem.mutate({ id: item.id });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
                    >
                      ×
                    </Button>
                  </div>
                ))}

                {/* チェック済み */}
                {items.filter((i) => i.isChecked).length > 0 && (
                  <>
                    <div className="border-t border-border my-2" />
                    <div className="flex items-center justify-between px-2 mb-1">
                      <p className="text-xs text-muted-foreground">購入済み</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteChecked.mutate()}
                        disabled={deleteChecked.isPending}
                        className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-6 px-2"
                      >
                        {deleteChecked.isPending ? "削除中..." : "一覧を削除"}
                      </Button>
                    </div>
                    {items.filter((i) => i.isChecked).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer group"
                        onClick={() => toggleItem.mutate({ id: item.id, isChecked: false })}
                      >
                        <div className="w-5 h-5 rounded border-2 bg-primary border-primary flex items-center justify-center flex-shrink-0">
                          <span className="text-primary-foreground text-xs">✓</span>
                        </div>
                        <span className="flex-1 text-sm line-through text-muted-foreground">{item.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteItem.mutate({ id: item.id });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

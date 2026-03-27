import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Stores() {
  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<{ id: number; name: string; area: string; saleInfo: string; isMain: boolean } | null>(null);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [saleInfo, setSaleInfo] = useState("");
  const [isMain, setIsMain] = useState(false);

  const { data: stores, isLoading } = trpc.store.list.useQuery();
  const utils = trpc.useUtils();

  const addStore = trpc.store.add.useMutation({
    onSuccess: () => {
      utils.store.list.invalidate();
      setAddOpen(false);
      resetForm();
      toast.success("店舗を追加しました");
    },
    onError: (err) => toast.error("追加に失敗しました", { description: err.message }),
  });

  const updateStore = trpc.store.update.useMutation({
    onSuccess: () => {
      utils.store.list.invalidate();
      setEditStore(null);
      toast.success("店舗情報を更新しました");
    },
    onError: (err) => toast.error("更新に失敗しました", { description: err.message }),
  });

  const deleteStore = trpc.store.delete.useMutation({
    onSuccess: () => {
      utils.store.list.invalidate();
      toast.success("店舗を削除しました");
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const resetForm = () => {
    setName("");
    setArea("");
    setSaleInfo("");
    setIsMain(false);
  };

  const openEdit = (store: NonNullable<typeof stores>[number]) => {
    setEditStore({
      id: store.id,
      name: store.name,
      area: store.area ?? "",
      saleInfo: store.saleInfo ?? "",
      isMain: store.isMain,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">← 戻る</Button>
            </Link>
            <h1 className="font-bold text-lg">🏪 マイ店舗管理</h1>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground">+ 店舗を追加</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>店舗を追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="store-name">店舗名 *</Label>
                  <Input
                    id="store-name"
                    placeholder="例：イオン〇〇店、西友〇〇店"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="area">エリア</Label>
                  <Input
                    id="area"
                    placeholder="例：渋谷区、新宿駅周辺"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="sale-info">今週の特売情報</Label>
                  <Textarea
                    id="sale-info"
                    placeholder="例：鶏もも肉 100g 88円、キャベツ 1玉 98円"
                    value={saleInfo}
                    onChange={(e) => setSaleInfo(e.target.value)}
                    className="mt-1"
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={isMain} onCheckedChange={setIsMain} />
                  <Label>メインのスーパーとして設定</Label>
                </div>
                <Button
                  onClick={() => addStore.mutate({ name, area: area || undefined, saleInfo: saleInfo || undefined, isMain })}
                  disabled={!name.trim() || addStore.isPending}
                  className="w-full bg-primary text-primary-foreground"
                >
                  {addStore.isPending ? "追加中..." : "追加する"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-muted-foreground mb-6">
          よく利用するスーパーを登録して特売情報を入力すると、AIがコストを抑えた献立を提案します。
        </p>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : !stores || stores.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏪</div>
            <p className="text-muted-foreground mb-2">店舗が登録されていません</p>
            <p className="text-sm text-muted-foreground">よく利用するスーパーを登録してください</p>
          </div>
        ) : (
          <div className="space-y-4">
            {stores.map((store) => (
              <Card key={store.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{store.name}</h3>
                        {store.isMain && (
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">メイン</Badge>
                        )}
                      </div>
                      {store.area && (
                        <p className="text-sm text-muted-foreground mt-0.5">📍 {store.area}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(store)}
                        className="text-xs"
                      >
                        編集
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteStore.mutate({ id: store.id })}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                  {store.saleInfo ? (
                    <div className="bg-muted/50 rounded-lg p-3 mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">🏷️ 特売情報</p>
                      <p className="text-sm whitespace-pre-line">{store.saleInfo}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">特売情報なし（編集から追加できます）</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* 編集ダイアログ */}
      {editStore && (
        <Dialog open={!!editStore} onOpenChange={() => setEditStore(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>店舗情報を編集</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>店舗名</Label>
                <Input
                  value={editStore.name}
                  onChange={(e) => setEditStore({ ...editStore, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>エリア</Label>
                <Input
                  value={editStore.area}
                  onChange={(e) => setEditStore({ ...editStore, area: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>今週の特売情報</Label>
                <Textarea
                  value={editStore.saleInfo}
                  onChange={(e) => setEditStore({ ...editStore, saleInfo: e.target.value })}
                  className="mt-1"
                  rows={4}
                  placeholder="例：鶏もも肉 100g 88円、キャベツ 1玉 98円"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editStore.isMain}
                  onCheckedChange={(v) => setEditStore({ ...editStore, isMain: v })}
                />
                <Label>メインのスーパーとして設定</Label>
              </div>
              <Button
                onClick={() => updateStore.mutate({
                  id: editStore.id,
                  name: editStore.name,
                  area: editStore.area || null,
                  saleInfo: editStore.saleInfo || null,
                  isMain: editStore.isMain,
                })}
                disabled={updateStore.isPending}
                className="w-full bg-primary text-primary-foreground"
              >
                {updateStore.isPending ? "更新中..." : "更新する"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

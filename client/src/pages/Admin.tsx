import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"users" | "logs" | "broadcast" | "richmenu">("users");
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: passwordStatus } = trpc.adminAuth.checkPasswordSet.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const setPasswordMutation = trpc.adminAuth.setAdminPassword.useMutation({
    onSuccess: () => {
      toast.success("パスワードを設定しました");
      setShowPasswordSetup(false);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error("パスワード設定に失敗しました", { description: err.message }),
  });

  const { data: users, isLoading: usersLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const { data: lineUsers } = trpc.admin.listLineUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const { data: logs, isLoading: logsLoading } = trpc.admin.listDeliveryLogs.useQuery(
    { limit: 50 },
    { enabled: user?.role === "admin" && activeTab === "logs" }
  );

  const { data: richMenuData, isLoading: richMenuLoading, refetch: refetchRichMenu } = trpc.richMenu.list.useQuery(undefined, {
    enabled: user?.role === "admin" && activeTab === "richmenu",
  });

  const createRichMenu = trpc.richMenu.create.useMutation({
    onSuccess: (result) => {
      toast.success("リッチメニューを作成しました", { description: result.message });
      refetchRichMenu();
    },
    onError: (err) => toast.error("作成に失敗しました", { description: err.message }),
  });

  const deleteRichMenu = trpc.richMenu.delete.useMutation({
    onSuccess: () => {
      toast.success("リッチメニューを削除しました");
      refetchRichMenu();
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const broadcast = trpc.admin.broadcastMenus.useMutation({
    onSuccess: (result) => {
      toast.success(`配信完了`, {
        description: `成功: ${result.success}件、失敗: ${result.failed}件、スキップ: ${result.skipped}件`,
      });
    },
    onError: (err) => toast.error("配信に失敗しました", { description: err.message }),
  });

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-muted-foreground mb-4">管理者権限が必要です</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setLocation("/admin-login")}>管理者ログイン</Button>
            <Link href="/dashboard">
              <Button variant="outline">ダッシュボードに戻る</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateVal: any) => {
    if (!dateVal) return "-";
    return new Date(dateVal).toLocaleString("ja-JP");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">← 戻る</Button>
            </Link>
            <h1 className="font-bold text-lg">⚙️ 管理画面</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary border-primary/20">管理者</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordSetup(!showPasswordSetup)}
              className="text-xs"
            >
              🔑 {passwordStatus?.passwordSet ? "パスワード変更" : "パスワード設定"}
            </Button>
          </div>
        </div>
      </header>

      {/* パスワード設定パネル */}
      {showPasswordSetup && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-4">
          <div className="max-w-md mx-auto">
            <h3 className="font-semibold text-amber-900 mb-3">🔑 管理者パスワード設定</h3>
            <p className="text-sm text-amber-700 mb-3">
              このパスワードは /admin-login からのログインに使用します。
              LINEへの2段階認証コードと組み合わせて管理画面を保護します。
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-amber-800">新しいパスワード（8文字以上）</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8文字以上のパスワード"
                  className="mt-1 border-amber-200"
                />
              </div>
              <div>
                <Label className="text-amber-800">パスワード確認</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="同じパスワードを再入力"
                  className="mt-1 border-amber-200"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (newPassword.length < 8) {
                      toast.error("パスワードは8文字以上にしてください");
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      toast.error("パスワードが一致しません");
                      return;
                    }
                    setPasswordMutation.mutate({ password: newPassword });
                  }}
                  disabled={setPasswordMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {setPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "設定する"}
                </Button>
                <Button variant="ghost" onClick={() => setShowPasswordSetup(false)}>キャンセル</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* タブ */}
        <div className="flex gap-2 mb-6 border-b border-border">
          {[
            { id: "users", label: "👥 ユーザー" },
            { id: "logs", label: "📊 配信ログ" },
            { id: "broadcast", label: "📣 一括配信" },
            { id: "richmenu", label: "📱 リッチメニュー" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ユーザー一覧 */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-primary">{users?.length ?? 0}</p>
                  <p className="text-sm text-muted-foreground">総ユーザー数</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-primary">{lineUsers?.length ?? 0}</p>
                  <p className="text-sm text-muted-foreground">LINEアクティブ</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-primary">
                    {users?.filter((u) => u.role === "admin").length ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">管理者数</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ユーザー一覧</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <p className="text-muted-foreground text-sm">読み込み中...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名前</TableHead>
                        <TableHead>メール</TableHead>
                        <TableHead>ロール</TableHead>
                        <TableHead>最終ログイン</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name ?? "-"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.email ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(u.lastSignedIn)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 配信ログ */}
        {activeTab === "logs" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">配信ログ（直近50件）</CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <p className="text-muted-foreground text-sm">読み込み中...</p>
              ) : !logs || logs.length === 0 ? (
                <p className="text-muted-foreground text-sm">配信ログがありません</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>配信日時</TableHead>
                      <TableHead>LINE ID</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>エラー</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{formatDate(log.deliveredAt)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {log.lineUserId ? `${log.lineUserId.slice(0, 8)}...` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={log.status === "success" ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.errorMessage ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* リッチメニュー管理 */}
        {activeTab === "richmenu" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📱 LINEリッチメニュー管理</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/richmenu-i7XRyxkG5Zb8UsUr2NcL3p.png"
                    alt="リッチメニュープレビュー"
                    className="w-full max-w-md rounded-lg border border-border mb-4"
                  />
                  <p className="text-sm text-muted-foreground mb-4">
                    上記の画像をLINEリッチメニューとして設定します。4つのボタン（今日の献立・冷蔵庫管理・家族設定・買い物リスト）が含まれています。
                  </p>
                  <Button
                    onClick={() => createRichMenu.mutate({})}
                    disabled={createRichMenu.isPending}
                    className="bg-primary text-primary-foreground"
                  >
                    {createRichMenu.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />作成中...</>
                    ) : (
                      "リッチメニューを作成・設定する"
                    )}
                  </Button>
                </div>

                {richMenuLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>読み込み中...</span>
                  </div>
                ) : richMenuData?.menus && richMenuData.menus.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium mb-3">登録済みリッチメニュー</p>
                    <div className="space-y-2">
                      {richMenuData.menus.map((menu: any) => (
                        <div key={menu.richMenuId} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{menu.name}</p>
                            <p className="text-xs text-muted-foreground">ID: {menu.richMenuId}</p>
                            {richMenuData.defaultId === menu.richMenuId && (
                              <Badge className="text-xs mt-1 bg-green-100 text-green-700">デフォルト設定中</Badge>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteRichMenu.mutate({ richMenuId: menu.richMenuId })}
                            disabled={deleteRichMenu.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            削除
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">リッチメニューはまだ設定されていません</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 一括配信 */}
        {activeTab === "broadcast" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📣 全ユーザーへ一括配信</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                アクティブな全LINEユーザーに今日の献立を一括送信します。
                現在 <strong>{lineUsers?.length ?? 0}人</strong> のアクティブユーザーがいます。
              </p>
              <div className="bg-muted/50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium mb-2">⚠️ 注意事項</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 全ユーザーにLINEメッセージが送信されます</li>
                  <li>• 既に今日の献立が生成済みのユーザーは再生成されません</li>
                  <li>• 処理に時間がかかる場合があります</li>
                </ul>
              </div>
              <Button
                onClick={() => broadcast.mutate({})}
                disabled={broadcast.isPending || (lineUsers?.length ?? 0) === 0}
                className="bg-primary text-primary-foreground"
              >
                {broadcast.isPending ? "配信中..." : `${lineUsers?.length ?? 0}人に一括配信する`}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

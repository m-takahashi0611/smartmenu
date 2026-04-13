import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, LogOut, MessageSquare, X, Ban, CheckCircle, Send } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── トーク履歴モーダル ────────────────────────────────────────────────────────
function ConversationModal({
  lineUserId,
  displayName,
  onClose,
}: {
  lineUserId: string;
  displayName: string;
  onClose: () => void;
}) {
  const { data: history, isLoading } = trpc.admin.getUserConversationHistory.useQuery(
    { lineUserId, limit: 200 },
    { enabled: true }
  );

  const formatTime = (dateVal: any) => {
    if (!dateVal) return "";
    return new Date(dateVal).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div>
              <p className="font-bold text-sm">{displayName} のトーク履歴</p>
              <p className="text-xs text-muted-foreground">{lineUserId.slice(0, 12)}...</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">トーク履歴がありません</p>
            </div>
          ) : (
            history.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      msg.role === "user" ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
                    }`}
                  >
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {history ? `${history.length}件のメッセージ` : ""}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>閉じる</Button>
        </div>
      </div>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("ログアウトしました");
      setLocation("/");
    },
    onError: () => {
      setLocation("/");
    },
  });

  const [activeTab, setActiveTab] = useState<"users" | "logs" | "broadcast" | "richmenu" | "cleanup">("users");
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // トーク履歴モーダル用 state
  const [conversationModal, setConversationModal] = useState<{
    lineUserId: string;
    displayName: string;
  } | null>(null);

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

  const createNumberMenu = trpc.richMenu.createNumberMenu.useMutation({
    onSuccess: (result) => {
      toast.success("数字選択メニューを登録しました", { description: result.message });
      refetchRichMenu();
    },
    onError: (err) => toast.error("数字メニュー登録に失敗しました", { description: err.message }),
  });

  const deleteRichMenu = trpc.richMenu.delete.useMutation({
    onSuccess: () => {
      toast.success("リッチメニューを削除しました");
      refetchRichMenu();
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const utils = trpc.useUtils();

  const broadcast = trpc.admin.broadcastMenus.useMutation({
    onSuccess: (result) => {
      toast.success(`配信完了`, {
        description: `成功: ${result.success}件、失敗: ${result.failed}件、スキップ: ${result.skipped}件`,
      });
    },
    onError: (err) => toast.error("配信に失敗しました", { description: err.message }),
  });

  const blockUser = trpc.admin.blockUser.useMutation({
    onSuccess: () => {
      toast.success("ユーザーをブロックしました");
      utils.admin.listLineUsers.invalidate();
    },
    onError: (err) => toast.error("ブロックに失敗しました", { description: err.message }),
  });

  const unblockUser = trpc.admin.unblockUser.useMutation({
    onSuccess: () => {
      toast.success("ブロックを解除しました");
      utils.admin.listLineUsers.invalidate();
    },
    onError: (err) => toast.error("ブロック解除に失敗しました", { description: err.message }),
  });

  const clearConversationHistory = trpc.admin.clearConversationHistory.useMutation({
    onSuccess: (result) => toast.success(result.message),
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const clearFridgeItems = trpc.admin.clearFridgeItems.useMutation({
    onSuccess: (result) => toast.success(result.message),
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const clearAllTestData = trpc.admin.clearAllTestData.useMutation({
    onSuccess: (result) => toast.success(result.message),
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
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

  // lineUsersからlineUserIdでdisplayNameを取得するヘルパー
  const getLineUserForUser = (userId: number) => {
    return lineUsers?.find((lu) => lu.userId === userId);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* トーク履歴モーダル */}
      {conversationModal && (
        <ConversationModal
          lineUserId={conversationModal.lineUserId}
          displayName={conversationModal.displayName}
          onClose={() => setConversationModal(null)}
        />
      )}

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <><LogOut className="h-3 w-3 mr-1" />ログアウト</>
              )}
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
            { id: "cleanup", label: "🗑️ データクリア" },
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
            {/* 集計カード */}
            <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
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
              <Card className="border-green-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">
                    {lineUsers?.filter((lu) => lu.subscriptionStatus === "active").length ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">課金中</p>
                </CardContent>
              </Card>
              <Card className="border-gray-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-gray-500">
                    {lineUsers?.filter((lu) => lu.subscriptionStatus !== "active").length ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">無課金</p>
                </CardContent>
              </Card>
            </div>

            {/* 配信実行ボタン */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Send className="h-4 w-4 text-green-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">今日の献立を一括配信</p>
                <p className="text-xs text-green-600">アクティブな全LINEユーザー（{lineUsers?.filter(lu => !lu.isBlocked).length ?? 0}名）に送信</p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  if (confirm(`${lineUsers?.filter(lu => !lu.isBlocked).length ?? 0}名に今日の献立を配信しますか？`)) {
                    broadcast.mutate({});
                  }
                }}
                disabled={broadcast.isPending || (lineUsers?.length ?? 0) === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {broadcast.isPending ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" />配信中...</>
                ) : (
                  "配信実行"
                )}
              </Button>
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
                        <TableHead>トーク履歴</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((u) => {
                        const lineUser = getLineUserForUser(u.id);
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {lineUser?.pictureUrl && (
                                  <img
                                    src={lineUser.pictureUrl}
                                    alt=""
                                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                  />
                                )}
                                <div>
                                  <p>{u.name ?? "-"}</p>
                                  {lineUser?.displayName && lineUser.displayName !== u.name && (
                                    <p className="text-xs text-muted-foreground">LINE: {lineUser.displayName}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{u.email ?? "-"}</TableCell>
                            <TableCell>
                              <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                                {u.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(u.lastSignedIn)}
                            </TableCell>
                            <TableCell>
                              {lineUser ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs gap-1"
                                  onClick={() =>
                                    setConversationModal({
                                      lineUserId: lineUser.lineUserId,
                                      displayName: lineUser.displayName ?? u.name ?? "ユーザー",
                                    })
                                  }
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  履歴を見る
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">LINE未連携</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* LINEユーザー一覧（LINE連携済みのみ） */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">LINEアクティブユーザー一覧</CardTitle>
              </CardHeader>
              <CardContent>
                {!lineUsers || lineUsers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">LINEアクティブユーザーがいません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>LINE名</TableHead>
                        <TableHead>プラン</TableHead>
                        <TableHead>配信時間</TableHead>
                        <TableHead>地域</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineUsers.map((lu) => (
                        <TableRow key={lu.id} className={lu.isBlocked ? "opacity-50 bg-red-50" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {lu.pictureUrl && (
                                <img
                                  src={lu.pictureUrl}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                />
                              )}
                              <div>
                                <span>{lu.displayName ?? "-"}</span>
                                {lu.isBlocked && (
                                  <span className="ml-1 text-xs text-red-500 font-medium">🚫 ブロック中</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {lu.subscriptionStatus === "active" ? (
                              <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">💳 課金中</Badge>
                            ) : lu.subscriptionStatus === "cancelled" ? (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">解約済</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">無課金</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {String(lu.deliveryHour).padStart(2, "0")}:{String(lu.deliveryMinute).padStart(2, "0")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {lu.region ?? "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs gap-1"
                                onClick={() =>
                                  setConversationModal({
                                    lineUserId: lu.lineUserId,
                                    displayName: lu.displayName ?? "ユーザー",
                                  })
                                }
                              >
                                <MessageSquare className="h-3 w-3" />
                                履歴
                              </Button>
                              {lu.isBlocked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs gap-1 text-green-600 border-green-300 hover:bg-green-50"
                                  onClick={() => {
                                    if (confirm(`${lu.displayName ?? lu.lineUserId} のブロックを解除しますか？`)) {
                                      unblockUser.mutate({ lineUserId: lu.lineUserId });
                                    }
                                  }}
                                  disabled={unblockUser.isPending}
                                >
                                  <CheckCircle className="h-3 w-3" />
                                  解除
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs gap-1 text-red-500 border-red-300 hover:bg-red-50"
                                  onClick={() => {
                                    if (confirm(`${lu.displayName ?? lu.lineUserId} をブロックしますか？\nブロック中はLINEメッセージが送信されなくなります。`)) {
                                      blockUser.mutate({ lineUserId: lu.lineUserId });
                                    }
                                  }}
                                  disabled={blockUser.isPending}
                                >
                                  <Ban className="h-3 w-3" />
                                  ブロック
                                </Button>
                              )}
                            </div>
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
                      <TableHead>日時</TableHead>
                      <TableHead>LINE User ID</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>メッセージ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(log.deliveredAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {log.lineUserId ? `${log.lineUserId.slice(0, 8)}...` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.status === "success"
                                ? "default"
                                : log.status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {log.errorMessage ?? log.message ?? "-"}
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📱 リッチメニュー管理</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {richMenuLoading ? (
                <p className="text-muted-foreground text-sm">読み込み中...</p>
              ) : (
                <>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-1">現在のリッチメニュー</p>
                    {richMenuData?.defaultId ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">デフォルトID: {richMenuData.defaultId}</p>
                        <p className="text-xs text-muted-foreground">✅ デフォルト設定済み</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">リッチメニューが設定されていません</p>
                    )}
                  </div>
                  {/* 数字選択メニューの状態 */}
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                    <p className="text-sm font-medium mb-1">🔢 数字選択メニュー（1・2・3・その他）</p>
                    {richMenuData?.cachedNumberMenuId ? (
                      <p className="text-xs text-green-600">✅ 登録済み（ID: {richMenuData.cachedNumberMenuId}）</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">⚠️ 未登録—下のボタンで登録してください</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        if (confirm("通常リッチメニューを新規作成・設定しますか？\n既存のリッチメニューは削除されます。")) {
                          createRichMenu.mutate({});
                        }
                      }}
                      disabled={createRichMenu.isPending}
                      className="bg-primary text-primary-foreground"
                    >
                      {createRichMenu.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />作成中...</>
                      ) : (
                        "通常メニューを作成・設定"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("数字選択メニュー（1・2・3・その他）をLINEに登録しますか？\nサーバー再起動後は再登録が必要です。")) {
                          createNumberMenu.mutate();
                        }
                      }}
                      disabled={createNumberMenu.isPending}
                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      {createNumberMenu.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />登録中...</>
                      ) : (
                        "🔢 数字メニューを登録"
                      )}
                    </Button>
                    {richMenuData?.defaultId && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (confirm("通常リッチメニューを削除しますか？")) {
                            deleteRichMenu.mutate({ richMenuId: richMenuData.defaultId! });
                          }
                        }}
                        disabled={deleteRichMenu.isPending}
                        className="text-destructive hover:text-destructive border-destructive/30"
                      >
                        {deleteRichMenu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
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

        {/* データクリア */}
        {activeTab === "cleanup" && (
          <div className="space-y-4">
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base text-destructive">🗑️ テストデータクリア</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-destructive mb-1">⚠️ 注意</p>
                  <p className="text-sm text-muted-foreground">削除したデータは復元できません。本番環境での操作は慎重に行ってください。</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">💬 会話履歴のクリア</p>
                      <p className="text-xs text-muted-foreground">全ユーザーのLINE会話履歴を削除します（AIが古いデータを参照しなくなります）</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("全ユーザーの会話履歴を削除しますか？")) {
                          clearConversationHistory.mutate({});
                        }
                      }}
                      disabled={clearConversationHistory.isPending}
                      className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {clearConversationHistory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">❄️ 冷蔵庫データのクリア</p>
                      <p className="text-xs text-muted-foreground">全ユーザーの冷蔵庫登録データを削除します</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("全ユーザーの冷蔵庫データを削除しますか？")) {
                          clearFridgeItems.mutate({});
                        }
                      }}
                      disabled={clearFridgeItems.isPending}
                      className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {clearFridgeItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5">
                    <div>
                      <p className="font-medium text-sm text-destructive">🔥 全テストデータを一括クリア</p>
                      <p className="text-xs text-muted-foreground">会話履歴・冷蔵庫・買い物リスト・献立をすべて削除します</p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("全テストデータ（会話履歴・冷蔵庫・買い物リスト・献立）を削除しますか？\nこの操作は元に戻せません。")) {
                          clearAllTestData.mutate();
                        }
                      }}
                      disabled={clearAllTestData.isPending}
                    >
                      {clearAllTestData.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "全データ削除"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, LogOut, MessageSquare, X, Ban, CheckCircle, Send, Clock, Calendar, Plus, Pencil, Trash2, MailCheck, ChevronDown, ChevronUp, Users, UploadCloud, Link2, Video, Image } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";


// ─── キャンペーンコード行コンポーネント ────────────────────────────────────────────
function CampaignCodeRow({
  c,
  lineUrlData,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
  isPendingUpdate,
  isPendingDelete,
}: {
  c: {
    id: number;
    code: string;
    label: string | null;
    discountPercent: string | number;
    feePercent: string | number;
    isActive: boolean;
    expiresAt: Date | null;
    usageCount: number;
  };
  lineUrlData: { lineAddFriendUrl: string } | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  isPendingUpdate: boolean;
  isPendingDelete: boolean;
}) {
  const discountPct = parseFloat(String(c.discountPercent)) || 0;
  const feePct = parseFloat(String(c.feePercent)) || 0;

  const { data: stats, isLoading: statsLoading } = trpc.campaign.getCampaignCodeStats.useQuery(
    { code: c.code },
    { enabled: isExpanded }
  );

  const formatDate = (d: Date | string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "active": return { text: "有料期間中", color: "bg-green-100 text-green-700" };
      case "trial": return { text: "トライアル", color: "bg-blue-100 text-blue-700" };
      case "cancelled": return { text: "解約済", color: "bg-gray-100 text-gray-600" };
      case "expired": return { text: "期限切れ", color: "bg-red-100 text-red-700" };
      default: return { text: s, color: "bg-gray-100 text-gray-600" };
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* コードヘッダー */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">{c.code}</span>
              <Badge variant={c.isActive ? "default" : "secondary"}>
                {c.isActive ? "有効" : "無効"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.label && <span>{c.label} ・ </span>}
              割引: <span className="font-bold text-orange-500">{discountPct}%OFF</span>
              <span className="ml-2">フィー: <span className="font-bold text-green-600">{feePct}%</span></span>
              {c.expiresAt && <span> ・ 期限: {formatDate(c.expiresAt)}</span>}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-xs"
            >
              <Users className="h-3 w-3" />
              課金実績
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleActive}
              disabled={isPendingUpdate}
            >
              {c.isActive ? "無効化" : "有効化"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={isPendingDelete}
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              削除
            </Button>
          </div>
        </div>
        {lineUrlData && (
          <div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
            <span className="text-xs font-mono text-muted-foreground flex-1 break-all">
              {lineUrlData.lineAddFriendUrl}?ref={c.code}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs"
              onClick={() => {
                const url = `${lineUrlData.lineAddFriendUrl}?ref=${c.code}`;
                navigator.clipboard.writeText(url)
                  .then(() => alert("URLをコピーしました"))
                  .catch(() => alert("コピーに失敗しました"));
              }}
            >
              コピー
            </Button>
          </div>
        )}
      </div>

      {/* 展開: 課金実績パネル */}
      {isExpanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {statsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : !stats ? (
            <p className="text-sm text-muted-foreground text-center py-2">データ取得に失敗しました</p>
          ) : (
            <>
              {/* サマリー */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-background rounded-lg p-3 text-center border">
                  <p className="text-xs text-muted-foreground">課金ユーザー数</p>
                  <p className="text-xl font-bold text-primary">{stats.summary.totalUsers}名</p>
                </div>
                <div className="bg-background rounded-lg p-3 text-center border">
                  <p className="text-xs text-muted-foreground">累計課金額</p>
                  <p className="text-xl font-bold">¥{stats.summary.totalCharged.toLocaleString()}</p>
                </div>
                <div className="bg-background rounded-lg p-3 text-center border">
                  <p className="text-xs text-muted-foreground">フィー率</p>
                  <p className="text-xl font-bold text-green-600">{stats.summary.feePercent}%</p>
                </div>
                <div className="bg-background rounded-lg p-3 text-center border">
                  <p className="text-xs text-muted-foreground">フィー合計</p>
                  <p className="text-xl font-bold text-amber-600">¥{stats.summary.totalFee.toLocaleString()}</p>
                </div>
              </div>

              {/* 課金ユーザー一覧 */}
              {stats.users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">課金ユーザーはまだいません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-3 font-medium text-muted-foreground">ユーザー名</th>
                        <th className="text-left py-2 pr-3 font-medium text-muted-foreground">課金日</th>
                        <th className="text-left py-2 pr-3 font-medium text-muted-foreground">次回課金予定日</th>
                        <th className="text-right py-2 pr-3 font-medium text-muted-foreground">課金額</th>
                        <th className="text-right py-2 pr-3 font-medium text-muted-foreground">割引%</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.users.map((u: any) => {
                        const sl = statusLabel(u.status);
                        return (
                          <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 pr-3">
                              <p className="font-medium">{u.userName}</p>
                              {u.email && <p className="text-muted-foreground">{u.email}</p>}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{formatDate(u.chargedAt)}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{formatDate(u.nextChargeAt)}</td>
                            <td className="py-2 pr-3 text-right font-medium">¥{u.chargeAmount.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right text-orange-500 font-medium">{u.discountPercent}%OFF</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sl.color}`}>
                                {sl.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

// ─── エラーログタブ ─────────────────────────────────────────────────────────
function ErrorLogsTab() {
  const { data: logs, isLoading, refetch } = trpc.errorLog.list.useQuery(
    { limit: 100, offset: 0 },
    { refetchOnWindowFocus: false }
  );

  const formatDate = (dateVal: any) => {
    if (!dateVal) return "-";
    return new Date(dateVal).toLocaleString("ja-JP");
  };

  const typeLabel: Record<string, string> = {
    liff_init_timeout: "タイムアウト",
    liff_login_failed: "LIFFログイン失敗",
    login_session_failed: "セッション作成失敗",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">⚠️ エラーログ（直近100件）</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            更新
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">エラーログはありません ✅</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">発生日時</TableHead>
                    <TableHead className="whitespace-nowrap">種別</TableHead>
                    <TableHead>メッセージ</TableHead>
                    <TableHead className="whitespace-nowrap">ユーザーID</TableHead>
                    <TableHead className="whitespace-nowrap">通知</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs whitespace-nowrap">
                          {typeLabel[log.type] ?? log.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs">
                        <p className="truncate" title={log.message}>{log.message}</p>
                        {log.extra != null && (
                          <p className="text-muted-foreground text-[10px] mt-0.5 truncate">
                            {JSON.stringify(log.extra as Record<string, unknown>)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {log.userId ? `uid:${log.userId}` : log.lineUserId ? `line:${log.lineUserId.slice(0, 8)}...` : "-"}
                      </TableCell>
                      <TableCell>
                        {log.notifiedOwner ? (
                          <Badge variant="secondary" className="text-xs">通知済</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">未通知</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 配信メッセージタブ ───────────────────────────────────────────────────────
function BroadcastMessageTab({ lineUsers }: { lineUsers: any[] | undefined }) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formMediaType, setFormMediaType] = useState<"none" | "image" | "video" | "youtube">("none");
  const [formMediaUrl, setFormMediaUrl] = useState<string | null>(null);
  const [formMediaThumbnailUrl, setFormMediaThumbnailUrl] = useState<string | null>(null);
  const [formYoutubeUrl, setFormYoutubeUrl] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sendModalMsgId, setSendModalMsgId] = useState<number | null>(null);
  const [selectedSendIds, setSelectedSendIds] = useState<string[]>([]);

  const { data: messages, isLoading } = trpc.admin.listBroadcastMessages.useQuery();

  const createMsg = trpc.admin.createBroadcastMessage.useMutation({
    onSuccess: () => {
      toast.success("メッセージを作成しました");
      utils.admin.listBroadcastMessages.invalidate();
      setShowForm(false);
      setFormTitle("");
      setFormContent("");
      setFormMediaType("none");
      setFormMediaUrl(null);
      setFormMediaThumbnailUrl(null);
      setFormYoutubeUrl("");
    },
    onError: (err) => toast.error("作成に失敗しました", { description: err.message }),
  });

  const updateMsg = trpc.admin.updateBroadcastMessage.useMutation({
    onSuccess: () => {
      toast.success("メッセージを更新しました");
      utils.admin.listBroadcastMessages.invalidate();
      setEditingId(null);
      setFormTitle("");
      setFormContent("");
      setFormMediaType("none");
      setFormMediaUrl(null);
      setFormMediaThumbnailUrl(null);
      setFormYoutubeUrl("");
    },
    onError: (err) => toast.error("更新に失敗しました", { description: err.message }),
  });

  const deleteMsg = trpc.admin.deleteBroadcastMessage.useMutation({
    onSuccess: () => {
      toast.success("メッセージを削除しました");
      utils.admin.listBroadcastMessages.invalidate();
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const uploadMedia = trpc.admin.uploadBroadcastMedia.useMutation();
  const sendMsg = trpc.admin.sendBroadcastMessage.useMutation({
    onSuccess: (result) => {
      toast.success(`配信完了`, {
        description: `成功: ${result.success}件、失敗: ${result.failed}件`,
      });
      utils.admin.listBroadcastMessages.invalidate();
      setSendModalMsgId(null);
      setSelectedSendIds([]);
    },
    onError: (err) => toast.error("配信に失敗しました", { description: err.message }),
  });

  const handleEdit = (msg: any) => {
    setEditingId(msg.id);
    setFormTitle(msg.title);
    setFormContent(msg.content);
    setFormMediaType(msg.mediaType ?? "none");
    setFormMediaUrl(msg.mediaUrl ?? null);
    setFormMediaThumbnailUrl(msg.mediaThumbnailUrl ?? null);
    setFormYoutubeUrl(msg.mediaType === "youtube" ? (msg.mediaUrl ?? "") : "");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error("タイトルと本文を入力してください");
      return;
    }
    const mediaUrl = formMediaType === "youtube" ? (formYoutubeUrl.trim() || null) : formMediaUrl;
    const mediaPayload = {
      mediaType: formMediaType,
      mediaUrl: mediaUrl,
      mediaThumbnailUrl: formMediaType === "image" ? null : formMediaThumbnailUrl,
    };
    if (editingId) {
      updateMsg.mutate({ id: editingId, title: formTitle, content: formContent, ...mediaPayload });
    } else {
      createMsg.mutate({ title: formTitle, content: formContent, ...mediaPayload });
    }
  };
  const handleUploadMedia = async (file: File, isThumb = false) => {
    setUploadingMedia(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadMedia.mutateAsync({
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type,
      });
      if (isThumb) {
        setFormMediaThumbnailUrl(result.url);
      } else {
        setFormMediaUrl(result.url);
        if (formMediaType === "image") setFormMediaThumbnailUrl(result.url);
      }
      toast.success("アップロード完了");
    } catch (e: any) {
      toast.error("アップロードに失敗しました", { description: e.message });
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormMediaType("none");
    setFormMediaUrl(null);
    setFormMediaThumbnailUrl(null);
    setFormYoutubeUrl("");
  };

  const sendingMsg = messages?.find(m => m.id === sendModalMsgId);

  return (
    <div className="space-y-4">
      {/* メッセージ作成フォーム */}
      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "✏️ メッセージを編集" : "➕ 新規メッセージ作成"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">タイトル</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="配信メッセージのタイトル"
                className="mt-1"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">本文</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="LINEで送信するメッセージを入力してください"
                rows={8}
                className="mt-1 font-mono text-sm"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{formContent.length}文字</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">プレースホルダー:</span>
                  <button
                    type="button"
                    className="text-xs bg-muted hover:bg-muted/80 border border-border rounded px-2 py-0.5 font-mono cursor-pointer"
                    onClick={() => setFormContent(prev => prev + "{{name}}")}
                    title="カーソル位置に{{name}}を挿入"
                  >
                    {"{{name}}"}
                  </button>
                  <span className="text-xs text-muted-foreground">→ LINE表示名に自動置換</span>
                </div>
              </div>
            </div>
            {/* メディアセクション */}
            <div>
              <Label className="text-sm font-medium">メディア（任意）</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["none", "image", "video", "youtube"] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setFormMediaType(type); setFormMediaUrl(null); setFormMediaThumbnailUrl(null); setFormYoutubeUrl(""); }}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${formMediaType === type ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                  >
                    {type === "none" ? "なし" : type === "image" ? "🖼️ 画像" : type === "video" ? "🎥 動画" : "▶️ YouTube"}
                  </button>
                ))}
              </div>
              {formMediaType === "image" && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed rounded-lg hover:bg-muted/50 text-sm">
                      <UploadCloud className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{uploadingMedia ? "アップロード中..." : "画像をアップロード"}</span>
                      <input type="file" accept="image/*" className="hidden" disabled={uploadingMedia} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadMedia(f); }} />
                    </label>
                    {formMediaUrl && <span className="text-xs text-green-600 truncate max-w-xs">✅ アップロード済み</span>}
                  </div>
                  {formMediaUrl && (
                    <div className="relative inline-block">
                      <img src={formMediaUrl} alt="preview" className="h-24 rounded-lg object-contain border" />
                      <button type="button" onClick={() => { setFormMediaUrl(null); setFormMediaThumbnailUrl(null); }} className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">x</button>
                    </div>
                  )}
                </div>
              )}
              {formMediaType === "video" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">動画ファイル（mp4推奨）</p>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed rounded-lg hover:bg-muted/50 text-sm">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{uploadingMedia ? "アップロード中..." : "動画をアップロード"}</span>
                        <input type="file" accept="video/*" className="hidden" disabled={uploadingMedia} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadMedia(f); }} />
                      </label>
                      {formMediaUrl && <span className="text-xs text-green-600">✅ アップロード済み</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">サムネイル画像（必須）</p>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed rounded-lg hover:bg-muted/50 text-sm">
                        <Image className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{uploadingMedia ? "アップロード中..." : "サムネイルをアップロード"}</span>
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingMedia} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadMedia(f, true); }} />
                      </label>
                      {formMediaThumbnailUrl && <span className="text-xs text-green-600">✅ アップロード済み</span>}
                    </div>
                    {formMediaThumbnailUrl && (
                      <div className="relative inline-block mt-1">
                        <img src={formMediaThumbnailUrl} alt="thumb" className="h-16 rounded-lg object-contain border" />
                        <button type="button" onClick={() => setFormMediaThumbnailUrl(null)} className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">x</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {formMediaType === "youtube" && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Input value={formYoutubeUrl} onChange={(e) => setFormYoutubeUrl(e.target.value)} placeholder="https://youtu.be/xxxxx または https://www.youtube.com/watch?v=xxxxx" className="text-sm" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">URLはテキストメッセージに追記されて配信されます</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={createMsg.isPending || updateMsg.isPending || uploadingMedia}
                className="bg-primary text-primary-foreground"
              >
                {createMsg.isPending || updateMsg.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" />保存中...</>
                ) : (
                  "保存"
                )}
              </Button>
              <Button variant="outline" onClick={handleCancelForm}>キャンセル</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            LINEユーザーへ配信するメッセージを作成・管理できます。
          </p>
          <Button
            size="sm"
            onClick={() => { setShowForm(true); setEditingId(null); setFormTitle(""); setFormContent(""); }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            新規作成
          </Button>
        </div>
      )}

      {/* メッセージ一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📨 作成済みメッセージ</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !messages || messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MailCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">メッセージがまだありません</p>
              <p className="text-xs mt-1">「新規作成」から配信用メッセージを作成してください</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`border rounded-lg p-4 ${
                    msg.status === "sent" ? "border-green-200 bg-green-50/30" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={msg.status === "sent" ? "default" : "secondary"}
                          className={`text-xs ${
                            msg.status === "sent" ? "bg-green-100 text-green-800 border-green-300" : ""
                          }`}
                        >
                          {msg.status === "sent" ? `✅ 送信済み (${msg.sentCount}件)` : "📝 下書き"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleDateString("ja-JP")}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{msg.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
                        {msg.content}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {msg.status !== "sent" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          onClick={() => handleEdit(msg)}
                        >
                          <Pencil className="h-3 w-3" />
                          編集
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          setSendModalMsgId(msg.id);
                          setSelectedSendIds([]);
                        }}
                      >
                        <Send className="h-3 w-3" />
                        配信
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(`「${msg.title}」を削除しますか？`)) {
                            deleteMsg.mutate({ id: msg.id });
                          }
                        }}
                        disabled={deleteMsg.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 配信先選択モーダル */}
      <Dialog open={sendModalMsgId !== null} onOpenChange={(open) => { if (!open) { setSendModalMsgId(null); setSelectedSendIds([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>📤 配信先を選択</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {sendingMsg && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">配信メッセージ</p>
                <p className="font-medium text-sm">{sendingMsg.title}</p>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">配信対象</Label>
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => {
                    const nonBlocked = lineUsers?.filter(lu => !lu.isBlocked).map(lu => lu.lineUserId) ?? [];
                    setSelectedSendIds(selectedSendIds.length === nonBlocked.length ? [] : nonBlocked);
                  }}
                >
                  {selectedSendIds.length === (lineUsers?.filter(lu => !lu.isBlocked).length ?? 0) ? "全選択解除" : "全員選択"}
                </button>
              </div>
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {lineUsers?.filter(lu => !lu.isBlocked).map(lu => (
                  <label
                    key={lu.lineUserId}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b last:border-b-0 ${
                      selectedSendIds.includes(lu.lineUserId) ? "bg-green-50" : ""
                    }`}
                  >
                    <Checkbox
                      checked={selectedSendIds.includes(lu.lineUserId)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSendIds(prev => [...prev, lu.lineUserId]);
                        } else {
                          setSelectedSendIds(prev => prev.filter(id => id !== lu.lineUserId));
                        }
                      }}
                    />
                    {lu.pictureUrl && (
                      <img src={lu.pictureUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                    )}
                    <span className="text-sm flex-1 min-w-0 truncate">{lu.displayName ?? lu.lineUserId}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSendIds.length === 0
                  ? <span className="text-amber-600">⚠️ 1名以上選択してください</span>
                  : `${selectedSendIds.length}名選択中`}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSendModalMsgId(null); setSelectedSendIds([]); }}>
              キャンセル
            </Button>
            <Button
              onClick={() => {
                if (sendModalMsgId && selectedSendIds.length > 0) {
                  sendMsg.mutate({ id: sendModalMsgId, lineUserIds: selectedSendIds });
                }
              }}
              disabled={sendMsg.isPending || selectedSendIds.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {sendMsg.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />配信中...</>
              ) : (
                `${selectedSendIds.length}名に配信`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const [activeTab, setActiveTab] = useState<"users" | "logs" | "broadcast" | "richmenu" | "cleanup" | "errorlogs" | "campaign">("users");

  // キャンペーンコード管理
  const { data: campaignCodes, refetch: refetchCampaignCodes } = trpc.campaign.listCampaignCodes.useQuery(undefined, {
    enabled: user?.role === "admin" && activeTab === "campaign",
  });
  const { data: lineUrlData } = trpc.campaign.getLineAddFriendBaseUrl.useQuery(undefined, {
    enabled: user?.role === "admin" && activeTab === "campaign",
  });
  const [newCampaignCode, setNewCampaignCode] = useState("");
  const [newCampaignLabel, setNewCampaignLabel] = useState("");
  const [newCampaignDiscount, setNewCampaignDiscount] = useState(30);
  const [newCampaignFee, setNewCampaignFee] = useState(0);
  const [newCampaignExpiry, setNewCampaignExpiry] = useState("");
  // 展開中のキャンペーンコード
  const [expandedCampaignCode, setExpandedCampaignCode] = useState<string | null>(null);

  const createCampaignCode = trpc.campaign.createCampaignCode.useMutation({
    onSuccess: () => {
      toast.success("キャンペーンコードを作成しました");
      setNewCampaignCode("");
      setNewCampaignLabel("");
      setNewCampaignDiscount(30);
      setNewCampaignFee(0);
      setNewCampaignExpiry("");
      refetchCampaignCodes();
    },
    onError: (err) => toast.error("作成に失敗しました", { description: err.message }),
  });

  const updateCampaignCode = trpc.campaign.updateCampaignCode.useMutation({
    onSuccess: () => { toast.success("更新しました"); refetchCampaignCodes(); },
    onError: (err) => toast.error("更新に失敗しました", { description: err.message }),
  });

  const deleteCampaignCode = trpc.campaign.deleteCampaignCode.useMutation({
    onSuccess: () => { toast.success("削除しました"); refetchCampaignCodes(); },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);

  // 配信設定モーダル
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [selectedLineUserIds, setSelectedLineUserIds] = useState<string[]>([]);
  // 日時指定・継続配信は未実装のため削除（TODOに登録済み）
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

  const createPremiumMenu = trpc.richMenu.createPremiumMenu.useMutation({
    onSuccess: (result) => {
      toast.success("プレミアムメニューを作成しました", { description: `ID: ${result.richMenuId}` });
      refetchRichMenu();
    },
    onError: (err) => toast.error("プレミアムメニュー作成に失敗しました", { description: err.message }),
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

  const broadcastToSelected = trpc.admin.broadcastToSelected.useMutation({
    onSuccess: (result) => {
      toast.success(`配信完了`, {
        description: `成功: ${result.success}件、失敗: ${result.failed}件、スキップ: ${result.skipped}件`,
      });
      setShowDeliveryModal(false);
      setSelectedLineUserIds([]);
    },
    onError: (err) => toast.error("配信に失敗しました", { description: err.message }),
  });

  const updateDeliveryTime = trpc.admin.updateDeliveryTime.useMutation({
    onSuccess: () => {
      toast.success("配信時間を更新しました");
      utils.admin.listLineUsers.invalidate();
    },
    onError: (err) => toast.error("更新に失敗しました", { description: err.message }),
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
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>← 戻る</Button>
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
            { id: "broadcast", label: "📨 配信メッセージ" },
            { id: "richmenu", label: "📱 リッチメニュー" },
            { id: "cleanup", label: "🗑️ データクリア" },
            { id: "errorlogs", label: "⚠️ エラーログ" },
            { id: "campaign", label: "🎟️ キャンペーン" },
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

            {/* 配信実行バナー */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Send className="h-4 w-4 text-green-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">献立を配信</p>
                <p className="text-xs text-green-600">
                  {selectedLineUserIds.length > 0
                    ? `${selectedLineUserIds.length}名を選択中`
                    : `全LINEユーザー（${lineUsers?.filter(lu => !lu.isBlocked).length ?? 0}名）`}
                </p>
              </div>
              {selectedLineUserIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedLineUserIds([])}
                  className="text-xs"
                >
                  選択解除
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setShowDeliveryModal(true)}
                disabled={(lineUsers?.length ?? 0) === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Calendar className="h-3 w-3 mr-1" />
                配信設定
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">LINEアクティブユーザー一覧</CardTitle>
                  {selectedLineUserIds.length > 0 && (
                    <span className="text-xs text-green-700 font-medium bg-green-100 px-2 py-1 rounded">
                      {selectedLineUserIds.length}名選択中
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!lineUsers || lineUsers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">LINEアクティブユーザーがいません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <Checkbox
                            checked={selectedLineUserIds.length === lineUsers.filter(lu => !lu.isBlocked).length && lineUsers.filter(lu => !lu.isBlocked).length > 0}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedLineUserIds(lineUsers.filter(lu => !lu.isBlocked).map(lu => lu.lineUserId));
                              } else {
                                setSelectedLineUserIds([]);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>LINE名</TableHead>
                        <TableHead>プラン</TableHead>
                        <TableHead>配信時間</TableHead>
                        <TableHead>地域</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineUsers.map((lu) => (
                        <TableRow
                          key={lu.id}
                          className={`${lu.isBlocked ? "opacity-50 bg-red-50" : ""} ${selectedLineUserIds.includes(lu.lineUserId) ? "bg-green-50" : ""}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedLineUserIds.includes(lu.lineUserId)}
                              disabled={lu.isBlocked ?? false}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedLineUserIds(prev => [...prev, lu.lineUserId]);
                                } else {
                                  setSelectedLineUserIds(prev => prev.filter(id => id !== lu.lineUserId));
                                }
                              }}
                            />
                          </TableCell>
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
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono">{String(lu.deliveryHour).padStart(2, "0")}:{String(lu.deliveryMinute).padStart(2, "0")}</span>
                            </div>
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
                  {/* プレミアムメニューの状態 */}
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4">
                    <p className="text-sm font-medium mb-1">⭐ プレミアムメニュー（週間献立・今日だけ特別等）</p>
                    {richMenuData?.cachedPremiumMenuId ? (
                      <p className="text-xs text-green-600">✅ 登録済み（ID: {richMenuData.cachedPremiumMenuId}）</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">⚠️ 未登録—下のボタンで作成してください</p>
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("プレミアムリッチメニューを新規作成しますか？\n「週間献立」ボタンが反映されます。")) {
                          createPremiumMenu.mutate({});
                        }
                      }}
                      disabled={createPremiumMenu.isPending}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      {createPremiumMenu.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />作成中...</>
                      ) : (
                        "⭐ プレミアムメニューを作成"
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

        {/* 配信メッセージ管理 */}
        {activeTab === "broadcast" && (
          <BroadcastMessageTab lineUsers={lineUsers} />
        )}

        {/* エラーログ */}
        {activeTab === "errorlogs" && (
          <ErrorLogsTab />
        )}

        {/* キャンペーンコード管理 */}
        {activeTab === "campaign" && (
          <div className="space-y-6">
            {/* 新規作成 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">🎟️ キャンペーンコード作成</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">コード（英数字・_・-）</Label>
                    <Input
                      placeholder="例: tanaka_youtube"
                      value={newCampaignCode}
                      onChange={(e) => setNewCampaignCode(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">ラベル（内部管理用）</Label>
                    <Input
                      placeholder="例: 田中YouTuber動線"
                      value={newCampaignLabel}
                      onChange={(e) => setNewCampaignLabel(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">割引率（%）— ユーザーへの初回割引</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newCampaignDiscount}
                      onChange={(e) => setNewCampaignDiscount(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">フィー率（%）— 紹介者への支払割合</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newCampaignFee}
                      onChange={(e) => setNewCampaignFee(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">有効期限（空白=無期限）</Label>
                    <Input
                      type="date"
                      value={newCampaignExpiry}
                      onChange={(e) => setNewCampaignExpiry(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => createCampaignCode.mutate({
                    code: newCampaignCode,
                    label: newCampaignLabel || undefined,
                    discountPercent: newCampaignDiscount,
                    expiresAt: newCampaignExpiry || undefined,
                  })}
                  disabled={createCampaignCode.isPending || !newCampaignCode}
                  className="w-full"
                >
                  {createCampaignCode.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  コードを作成
                </Button>
              </CardContent>
            </Card>

            {/* コード一覧 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">登録済みコード一覧</CardTitle>
              </CardHeader>
              <CardContent>
                {!campaignCodes || campaignCodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">コードがまだ登録されていません</p>
                ) : (
                  <div className="space-y-3">
                    {campaignCodes.map((c) => (
                      <CampaignCodeRow
                        key={c.id}
                        c={c}
                        lineUrlData={lineUrlData}
                        isExpanded={expandedCampaignCode === c.code}
                        onToggleExpand={() => setExpandedCampaignCode(expandedCampaignCode === c.code ? null : c.code)}
                        onToggleActive={() => updateCampaignCode.mutate({ id: c.id, isActive: !c.isActive })}
                        onDelete={() => { if (confirm(`「${c.code}」を削除しますか？`)) deleteCampaignCode.mutate({ id: c.id }); }}
                        isPendingUpdate={updateCampaignCode.isPending}
                        isPendingDelete={deleteCampaignCode.isPending}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 使い方説明 */}
            <Card className="bg-muted/30">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">
                  <strong>使い方:</strong> YouTuber等に専用リンクを発行する際は、上記でコードを作成し、
                  <code className="bg-muted px-1 rounded">?ref=コード名</code> をLINEの友だち追加URLに付けて共有してください。
                  そのリンクから登録したユーザーの初回決済時に自動で割引が適用されます。
                </p>
              </CardContent>
            </Card>
          </div>
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

      {/* 配信設定モーダル */}
      <Dialog open={showDeliveryModal} onOpenChange={setShowDeliveryModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>📤 配信設定</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 対象ユーザー選択 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">配信対象ユーザー</Label>
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => {
                    const nonBlocked = lineUsers?.filter(lu => !lu.isBlocked).map(lu => lu.lineUserId) ?? [];
                    setSelectedLineUserIds(selectedLineUserIds.length === nonBlocked.length ? [] : nonBlocked);
                  }}
                >
                  {selectedLineUserIds.length === (lineUsers?.filter(lu => !lu.isBlocked).length ?? 0) ? "全選択解除" : "全員選択"}
                </button>
              </div>
              <div className="border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                {lineUsers?.filter(lu => !lu.isBlocked).map(lu => (
                  <label
                    key={lu.lineUserId}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b last:border-b-0 ${
                      selectedLineUserIds.includes(lu.lineUserId) ? "bg-green-50" : ""
                    }`}
                  >
                    <Checkbox
                      checked={selectedLineUserIds.includes(lu.lineUserId)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedLineUserIds(prev => [...prev, lu.lineUserId]);
                        } else {
                          setSelectedLineUserIds(prev => prev.filter(id => id !== lu.lineUserId));
                        }
                      }}
                    />
                    {lu.pictureUrl && (
                      <img src={lu.pictureUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                    )}
                    <span className="text-sm flex-1 min-w-0 truncate">{lu.displayName ?? lu.lineUserId}</span>
                    {lu.subscriptionStatus === "active" && (
                      <span className="text-xs text-green-600 flex-shrink-0">💳</span>
                    )}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedLineUserIds.length === 0
                  ? <span className="text-amber-600">⚠️ 1名以上選択してください</span>
                  : `${selectedLineUserIds.length}名を選択中`}
              </p>
            </div>

            {/* 注意事項 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                ⚠️ 配信実行ボタンを押すと、選択したユーザーに<strong>今すぐ</strong>LINEメッセージが送信されます。
                二重送信を防ぐため、ボタンは1回のみ押してください。
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeliveryModal(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => {
                if (selectedLineUserIds.length === 0) {
                  toast.error("配信対象ユーザーを1名以上選択してください");
                  return;
                }
                broadcastToSelected.mutate({ lineUserIds: selectedLineUserIds });
              }}
              disabled={broadcastToSelected.isPending || selectedLineUserIds.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {broadcastToSelected.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />配信中...</>
              ) : (
                `${selectedLineUserIds.length}名に今すぐ配信`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

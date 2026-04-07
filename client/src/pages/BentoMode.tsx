import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Lock, Crown, Check, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BOX_SIZES = [
  { id: "small", label: "小", desc: "子供用・400ml以下" },
  { id: "medium", label: "中", desc: "女性用・600ml前後" },
  { id: "large", label: "大", desc: "男性用・800ml以上" },
];

const DAYS = [
  { id: "mon", label: "月" },
  { id: "tue", label: "火" },
  { id: "wed", label: "水" },
  { id: "thu", label: "木" },
  { id: "fri", label: "金" },
  { id: "sat", label: "土" },
  { id: "sun", label: "日" },
];

type DayMode = "everyday" | "weekday" | "custom";

export default function BentoMode() {
  const [enabled, setEnabled] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [boxSizes, setBoxSizes] = useState<Record<number, string>>({});
  const [dayMode, setDayMode] = useState<DayMode>("weekday");
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [prepEvening, setPrepEvening] = useState(true);
  const [saved, setSaved] = useState(false);

  const { data: planData } = trpc.subscription.getMyPlan.useQuery();
  const IS_PREMIUM = planData?.isPremium ?? false;
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, navigate] = useLocation();

  // 家族メンバーを実データから取得
  const { data: familyData } = trpc.family.getProfile.useQuery();
  const members = familyData?.members ?? [
    { id: 1, name: "自分" },
    { id: 2, name: "家族1" },
  ];

  const toggleMember = (id: number) => {
    if (!IS_PREMIUM) {
      setShowUpgradeDialog(true);
      return;
    }
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const setBoxSize = (memberId: number, size: string) => {
    setBoxSizes((prev) => ({ ...prev, [memberId]: size }));
  };

  const toggleCustomDay = (day: string) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = () => {
    // TODO: trpc.bentoMode.save.useMutation() に差し替え
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          <h1 className="text-base font-bold text-foreground">🍱 お弁当モード</h1>
          <p className="text-xs text-muted-foreground">夕食と翌日のお弁当をまとめて提案します</p>
        </div>
        {!IS_PREMIUM && (
          <Badge className="bg-amber-500 text-white text-xs gap-1">
            <Crown className="w-3 h-3" />
            プレミアム
          </Badge>
        )}
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

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
                    お弁当モードは月額480円のプレミアムプランでご利用いただけます。
                    夕食の献立と同時に翌日のお弁当まで考えてくれます。
                  </p>
                  <Button size="sm" className="mt-2 bg-amber-500 hover:bg-amber-600 text-white text-xs">
                    45日間無料で試す →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* お弁当モード ON/OFF */}
        <Card className={!IS_PREMIUM ? "opacity-60" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">お弁当モードを有効にする</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  献立提案時にお弁当の提案も一緒に行います
                </p>
              </div>
              <Switch
                checked={enabled && IS_PREMIUM}
                onCheckedChange={(v) => IS_PREMIUM && setEnabled(v)}
                disabled={!IS_PREMIUM}
              />
            </div>
          </CardContent>
        </Card>

        {/* 設定エリア（お弁当モードONかつプレミアムのみ操作可） */}
        <div className={`space-y-4 ${(!IS_PREMIUM || !enabled) ? "opacity-50 pointer-events-none" : ""}`}>

          {/* ① 対象メンバー選択 */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                👤 誰のお弁当を作りますか？
                {!IS_PREMIUM && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3 px-4">
              <div className="grid grid-cols-2 gap-2">
                {members.map((member: { id: number; name: string }) => {
                  const isSelected = selectedMembers.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-primary/40"
                          : "bg-muted/30 border-border/40 hover:bg-muted/60"
                      }`}
                      onClick={() => toggleMember(member.id)}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-sm">{member.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* 選択メンバーのお弁当箱サイズ */}
              {selectedMembers.length > 0 && (
                <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
                  <p className="text-xs text-muted-foreground font-medium">お弁当箱のサイズ</p>
                  {selectedMembers.map((memberId) => {
                    const member = members.find((m: { id: number; name: string }) => m.id === memberId);
                    if (!member) return null;
                    return (
                      <div key={memberId}>
                        <p className="text-xs font-medium mb-1.5">{member.name}</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {BOX_SIZES.map((size) => (
                            <button
                              key={size.id}
                              className={`p-2 rounded-lg border text-center transition-colors ${
                                boxSizes[memberId] === size.id
                                  ? "bg-primary/10 border-primary/40"
                                  : "bg-muted/30 border-border/40 hover:bg-muted/60"
                              }`}
                              onClick={() => setBoxSize(memberId, size.id)}
                            >
                              <p className="text-sm font-semibold">{size.label}</p>
                              <p className="text-[10px] text-muted-foreground leading-tight">{size.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ② お弁当を作る曜日 */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                📅 お弁当を作る曜日
                {!IS_PREMIUM && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3 px-4 space-y-3">
              {/* モード選択 */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "everyday" as DayMode, label: "毎日" },
                  { id: "weekday" as DayMode, label: "平日のみ" },
                  { id: "custom" as DayMode, label: "曜日を選ぶ" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    className={`p-2 rounded-lg border text-sm transition-colors ${
                      dayMode === mode.id
                        ? "bg-primary/10 border-primary/40 font-medium text-primary"
                        : "bg-muted/30 border-border/40 hover:bg-muted/60"
                    }`}
                    onClick={() => setDayMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* カスタム曜日選択 */}
              {dayMode === "custom" && (
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((day) => (
                    <button
                      key={day.id}
                      className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors ${
                        customDays.includes(day.id)
                          ? "bg-primary text-white border-primary"
                          : "bg-muted/30 border-border/40 hover:bg-muted/60"
                      }`}
                      onClick={() => toggleCustomDay(day.id)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ③ 前日仕込みの可否 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">前日の夜に仕込む</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ONにすると夕食の調理中にお弁当の下準備も提案します
                  </p>
                </div>
                <Switch
                  checked={prepEvening}
                  onCheckedChange={setPrepEvening}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 夕食＋お弁当同時提案のプレビュー */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-primary">✨ こんな提案が届きます</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4">
            <div className="bg-white dark:bg-card rounded-lg p-3 space-y-3 text-sm border border-border/30">
              {/* ボット吹き出し風 */}
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-base">
                  🤖
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-none px-3 py-2 max-w-[85%]">
                  <p className="text-xs font-semibold text-primary mb-1">🍽️ 今夜の夕食</p>
                  <p className="text-xs">豚の生姜焼き・ほうれん草のおひたし・味噌汁</p>
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="text-xs font-semibold text-amber-600 mb-1">🍱 明日のお弁当（夫・中サイズ）</p>
                    <p className="text-xs">豚の生姜焼きをそのまま詰めるだけでOK！</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ＋ 卵焼き（今夜作り置き）<br />
                      ＋ ほうれん草のおひたし<br />
                      ＋ プチトマト
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {!IS_PREMIUM && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                ※ プレミアムプランで利用できます
              </p>
            )}
          </CardContent>
        </Card>

        {/* 保存ボタン */}
        {IS_PREMIUM && (
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!enabled || saved}
          >
            {saved ? (
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" /> 保存しました
              </span>
            ) : (
              "お弁当モードの設定を保存する"
            )}
          </Button>
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
              お弁当モードは月額480円のプレミアムプランの機能です。
              課金対象プランへの追加になりますが、よろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                setShowUpgradeDialog(false);
                navigate("/premium");
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

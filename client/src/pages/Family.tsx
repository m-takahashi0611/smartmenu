import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const AGE_GROUPS = [
  { value: "baby", label: "👶 乳幼児（0-2歳）" },
  { value: "child", label: "🧒 子ども（3-12歳）" },
  { value: "teen", label: "🧑 ティーン（13-17歳）" },
  { value: "adult", label: "🧑‍💼 大人（18-64歳）" },
  { value: "senior", label: "👴 シニア（65歳以上）" },
] as const;

const GENDERS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
] as const;

const PORTION_SIZES = [
  { value: "small", label: "少なめ" },
  { value: "normal", label: "普通" },
  { value: "large", label: "多め" },
] as const;

const WEEKDAYS = [
  { value: "mon", label: "月" },
  { value: "tue", label: "火" },
  { value: "wed", label: "水" },
  { value: "thu", label: "木" },
  { value: "fri", label: "金" },
  { value: "sat", label: "土" },
  { value: "sun", label: "日" },
];

type AgeGroup = (typeof AGE_GROUPS)[number]["value"];
type Gender = (typeof GENDERS)[number]["value"];
type PortionSize = (typeof PORTION_SIZES)[number]["value"];
type ShoppingDayMode = "everyday" | "weekdays" | "irregular";

export default function Family() {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("adult");
  const [gender, setGender] = useState<Gender>("other");
  const [allergies, setAllergies] = useState("");
  const [preferences, setPreferences] = useState("");
  const [portionSize, setPortionSize] = useState<PortionSize>("normal");

  // 買い物・自炊プロフィール state
  const [shoppingFrequency, setShoppingFrequency] = useState<number>(2);
  const [shoppingDayMode, setShoppingDayMode] = useState<ShoppingDayMode>("weekdays");
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([]);
  const [breakfastCookCount, setBreakfastCookCount] = useState<number>(0);
  const [lunchCookCount, setLunchCookCount] = useState<number>(0);
  const [dinnerCookCount, setDinnerCookCount] = useState<number>(5);
  const [breakfastAttendees, setBreakfastAttendees] = useState<string[]>([]);
  const [lunchAttendees, setLunchAttendees] = useState<string[]>([]);
  const [dinnerAttendees, setDinnerAttendees] = useState<string[]>([]);
  const [profileSaved, setProfileSaved] = useState(false);

  const { data: familyData, isLoading } = trpc.family.getProfile.useQuery();
  const utils = trpc.useUtils();

  // プロフィールデータが取得できたらstateを初期化
  useEffect(() => {
    if (familyData?.profile) {
      const p = familyData.profile;
      setShoppingFrequency(p.shoppingFrequency ?? 2);
      setBreakfastCookCount(p.breakfastCookCount ?? 0);
      setLunchCookCount(p.lunchCookCount ?? 0);
      setDinnerCookCount(p.dinnerCookCount ?? 5);
      setBreakfastAttendees((p.breakfastAttendees as string[]) ?? []);
      setLunchAttendees((p.lunchAttendees as string[]) ?? []);
      setDinnerAttendees((p.dinnerAttendees as string[]) ?? []);
      const days = (p.shoppingDays as string[]) ?? [];
      if (days.includes("everyday")) {
        setShoppingDayMode("everyday");
        setSelectedWeekdays([]);
      } else if (days.includes("irregular")) {
        setShoppingDayMode("irregular");
        setSelectedWeekdays([]);
      } else if (days.length > 0) {
        setShoppingDayMode("weekdays");
        setSelectedWeekdays(days);
      }
    }
  }, [familyData?.profile?.id]);

  const upsertProfile = trpc.family.upsertProfile.useMutation({
    onSuccess: () => {
      utils.family.getProfile.invalidate();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
      toast.success("プロフィールを保存しました");
    },
    onError: (err) => toast.error("保存に失敗しました", { description: err.message }),
  });

  const addMember = trpc.family.addMember.useMutation({
    onSuccess: () => {
      utils.family.getProfile.invalidate();
      setAddOpen(false);
      setName("");
      setAgeGroup("adult");
      setGender("other");
      setAllergies("");
      setPreferences("");
      setPortionSize("normal");
      toast.success("家族メンバーを追加しました");
    },
    onError: (err) => toast.error("追加に失敗しました", { description: err.message }),
  });

  const deleteMember = trpc.family.deleteMember.useMutation({
    onSuccess: () => {
      utils.family.getProfile.invalidate();
      toast.success("メンバーを削除しました");
    },
    onError: (err) => toast.error("削除に失敗しました", { description: err.message }),
  });

  const getAgeGroupLabel = (val: string) =>
    AGE_GROUPS.find((a) => a.value === val)?.label ?? val;

  const getPortionLabel = (val: string) =>
    PORTION_SIZES.find((p) => p.value === val)?.label ?? val;

  // 買い物曜日の計算
  const computeShoppingDays = (): string[] => {
    if (shoppingDayMode === "everyday") return ["everyday"];
    if (shoppingDayMode === "irregular") return ["irregular"];
    return selectedWeekdays;
  };

  // メンバー名リスト
  const memberNames = familyData?.members.map((m) => m.name) ?? [];

  const toggleAttendee = (meal: "breakfast" | "lunch" | "dinner", name: string) => {
    const setters = { breakfast: setBreakfastAttendees, lunch: setLunchAttendees, dinner: setDinnerAttendees };
    const getters = { breakfast: breakfastAttendees, lunch: lunchAttendees, dinner: dinnerAttendees };
    const current = getters[meal];
    setters[meal](current.includes(name) ? current.filter((n) => n !== name) : [...current, name]);
  };

  const handleSaveProfile = () => {
    upsertProfile.mutate({
      familyName: familyData?.profile?.familyName ?? undefined,
      notes: familyData?.profile?.notes ?? undefined,
      shoppingFrequency,
      shoppingDays: computeShoppingDays(),
      breakfastCookCount,
      lunchCookCount,
      dinnerCookCount,
      breakfastAttendees,
      lunchAttendees,
      dinnerAttendees,
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
            <h1 className="font-bold text-lg">👨‍👩‍👧 家族構成管理</h1>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { if (open) setAddOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground">+ メンバー追加</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto" showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>家族メンバーを追加</DialogTitle>
                <button
                  onClick={() => setAddOpen(false)}
                  className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <span className="text-lg leading-none">&times;</span>
                  <span className="sr-only">閉じる</span>
                </button>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="member-name">名前 *</Label>
                  <Input
                    id="member-name"
                    placeholder="例：ママ、太郎"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>年齢層 *</Label>
                  <Select value={ageGroup} onValueChange={(v) => setAgeGroup(v as AgeGroup)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGE_GROUPS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>性別</Label>
                  <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="allergies">アレルギー</Label>
                  <Input
                    id="allergies"
                    placeholder="例：卵、小麦、乳製品"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="preferences">好き嫌い・嗜好</Label>
                  <Textarea
                    id="preferences"
                    placeholder="例：辛いものが苦手、魚が好き"
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div>
                  <Label>食事量</Label>
                  <Select value={portionSize} onValueChange={(v) => setPortionSize(v as PortionSize)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PORTION_SIZES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => addMember.mutate({ name, ageGroup, gender, allergies: allergies || undefined, preferences: preferences || undefined, portionSize })}
                  disabled={!name.trim() || addMember.isPending}
                  className="w-full bg-primary text-primary-foreground"
                >
                  {addMember.isPending ? "追加中..." : "追加する"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── 買い物・自炊プロフィール ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🛒 買い物・自炊プロフィール</CardTitle>
            <p className="text-xs text-muted-foreground">登録内容をAIが献立提案に活用します</p>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* 買い物回数 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">週の買い物回数</Label>
                <Select value={String(shoppingFrequency)} onValueChange={(v) => setShoppingFrequency(Number(v))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}回/週</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 買い物に行く曜日 */}
            <div>
              <Label className="text-sm font-medium">買い物に行く曜日</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant={shoppingDayMode === "everyday" ? "default" : "outline"}
                  onClick={() => setShoppingDayMode("everyday")}
                  className="text-xs"
                >
                  毎日
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={shoppingDayMode === "irregular" ? "default" : "outline"}
                  onClick={() => setShoppingDayMode("irregular")}
                  className="text-xs"
                >
                  不定期
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={shoppingDayMode === "weekdays" ? "default" : "outline"}
                  onClick={() => setShoppingDayMode("weekdays")}
                  className="text-xs"
                >
                  曜日を選ぶ
                </Button>
              </div>
              {shoppingDayMode === "weekdays" && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        setSelectedWeekdays(prev =>
                          prev.includes(day.value)
                            ? prev.filter(d => d !== day.value)
                            : [...prev, day.value]
                        );
                      }}
                      className={`w-9 h-9 rounded-full text-sm font-medium border transition-colors ${
                        selectedWeekdays.includes(day.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 食事別自炊回数 */}
            <div>
              <Label className="text-sm font-medium">週の自炊回数（食事別）</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  { label: "朝食", value: breakfastCookCount, setter: setBreakfastCookCount },
                  { label: "昼食", value: lunchCookCount, setter: setLunchCookCount },
                  { label: "夕食", value: dinnerCookCount, setter: setDinnerCookCount },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <Select value={String(value)} onValueChange={(v) => setter(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[0,1,2,3,4,5,6,7].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}回/週</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {(breakfastCookCount === 0 || lunchCookCount === 0) && (
                <p className="text-xs text-muted-foreground mt-2">
                  💡 0回の食事は献立提案の対象外になります
                </p>
              )}
            </div>

            {/* 食事別参加メンバー（メンバーが登録されている場合のみ表示） */}
            {memberNames.length > 0 && (
              <div>
                <Label className="text-sm font-medium">食事別の参加メンバー</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">誰が食べるかを設定するとレシピの人数が最適化されます</p>
                <div className="space-y-4">
                  {[
                    { label: "🌅 朝食", attendees: breakfastAttendees, meal: "breakfast" as const, count: breakfastCookCount },
                    { label: "☀️ 昼食", attendees: lunchAttendees, meal: "lunch" as const, count: lunchCookCount },
                    { label: "🌙 夕食", attendees: dinnerAttendees, meal: "dinner" as const, count: dinnerCookCount },
                  ].map(({ label, attendees, meal, count }) => (
                    <div key={meal} className={count === 0 ? "opacity-40" : ""}>
                      <p className="text-sm font-medium mb-2">{label} {count === 0 && <span className="text-xs text-muted-foreground">（自炊なし）</span>}</p>
                      <div className="flex flex-wrap gap-2">
                        {memberNames.map((mName) => (
                          <button
                            key={mName}
                            type="button"
                            disabled={count === 0}
                            onClick={() => toggleAttendee(meal, mName)}
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                              attendees.includes(mName)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-foreground border-border hover:bg-muted"
                            }`}
                          >
                            {mName}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={count === 0}
                          onClick={() => {
                            const setters = { breakfast: setBreakfastAttendees, lunch: setLunchAttendees, dinner: setDinnerAttendees };
                            setters[meal](attendees.length === memberNames.length ? [] : [...memberNames]);
                          }}
                          className="px-3 py-1 rounded-full text-xs border border-dashed border-muted-foreground text-muted-foreground hover:bg-muted"
                        >
                          {attendees.length === memberNames.length ? "全解除" : "全員"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="bg-primary text-primary-foreground w-full"
              disabled={upsertProfile.isPending}
              onClick={handleSaveProfile}
            >
              {upsertProfile.isPending ? "保存中..." : profileSaved ? "✓ 保存済み" : "プロフィールを保存する"}
            </Button>
          </CardContent>
        </Card>

        {/* ── 家族メンバー一覧 ── */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : !familyData || familyData.members.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">👨‍👩‍👧</div>
            <p className="text-muted-foreground mb-2">家族メンバーが登録されていません</p>
            <p className="text-sm text-muted-foreground mb-6">家族情報を登録すると、より適切な献立を提案できます</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                {familyData.profile.familyName ?? "ご家族"} · {familyData.members.length}人
              </p>
            </div>
            {familyData.members.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{member.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {getAgeGroupLabel(member.ageGroup)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          食事量: {getPortionLabel(member.portionSize ?? "normal")}
                        </Badge>
                      </div>
                      {member.allergies && (
                        <p className="text-sm text-muted-foreground">
                          ⚠️ アレルギー: {member.allergies}
                        </p>
                      )}
                      {member.preferences && (
                        <p className="text-sm text-muted-foreground">
                          💭 嗜好: {member.preferences}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMember.mutate({ id: member.id })}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                    >
                      削除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

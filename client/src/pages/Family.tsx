import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

type AgeGroup = (typeof AGE_GROUPS)[number]["value"];
type Gender = (typeof GENDERS)[number]["value"];
type PortionSize = (typeof PORTION_SIZES)[number]["value"];

export default function Family() {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("adult");
  const [gender, setGender] = useState<Gender>("other");
  const [allergies, setAllergies] = useState("");
  const [preferences, setPreferences] = useState("");
  const [portionSize, setPortionSize] = useState<PortionSize>("normal");

  const { data: familyData, isLoading } = trpc.family.getProfile.useQuery();
  const utils = trpc.useUtils();

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
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground">+ メンバー追加</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>家族メンバーを追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="member-name">名前 *</Label>
                  <Input
                    id="member-name"
                    placeholder="例：お母さん、太郎"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>年齢層 *</Label>
                  <Select value={ageGroup} onValueChange={(v) => setAgeGroup(v as AgeGroup)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_GROUPS.map((ag) => (
                        <SelectItem key={ag.value} value={ag.value}>{ag.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>性別</Label>
                  <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
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
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
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

      <main className="max-w-3xl mx-auto px-4 py-6">
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

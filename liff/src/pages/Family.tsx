import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFamilyProfile } from "@/hooks/useFirestore";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

export default function Family() {
  const navigate = useNavigate();
  const { profile, members, loading, saveProfile, addMember, deleteMember } = useFamilyProfile();
  const [adults, setAdults] = useState(profile?.adults ?? 2);
  const [children, setChildren] = useState(profile?.children ?? 0);
  const [budget, setBudget] = useState(profile?.budgetPerDay ?? 1500);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", age: "", allergies: "", dislikes: "" });
  const [saved, setSaved] = useState(false);

  const handleSaveProfile = async () => {
    await saveProfile({ adults, children, budgetPerDay: budget });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddMember = async () => {
    if (!form.name.trim()) return;
    await addMember({
      name: form.name,
      age: form.age ? parseInt(form.age) : undefined,
      allergies: form.allergies ? form.allergies.split("、").map((s) => s.trim()) : [],
      dislikes: form.dislikes ? form.dislikes.split("、").map((s) => s.trim()) : [],
    });
    setForm({ name: "", age: "", allergies: "", dislikes: "" });
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">家族構成</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 基本設定 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <h2 className="font-bold text-gray-700">基本設定</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">大人の人数</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setAdults(Math.max(1, adults - 1))} className="w-8 h-8 rounded-full bg-gray-100 font-bold">−</button>
              <span className="w-6 text-center font-bold">{adults}</span>
              <button onClick={() => setAdults(adults + 1)} className="w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold">+</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">子供の人数</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setChildren(Math.max(0, children - 1))} className="w-8 h-8 rounded-full bg-gray-100 font-bold">−</button>
              <span className="w-6 text-center font-bold">{children}</span>
              <button onClick={() => setChildren(children + 1)} className="w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold">+</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">1日の食費目安</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right"
                value={budget}
                onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
              />
              <span className="text-sm text-gray-500">円</span>
            </div>
          </div>
          <button
            onClick={handleSaveProfile}
            className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {saved ? "保存しました ✓" : "保存する"}
          </button>
        </div>

        {/* メンバー一覧 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-bold text-gray-700">メンバー</span>
            <button onClick={() => setShowForm(true)} className="text-green-600 text-sm font-medium flex items-center gap-1">
              <Plus size={16} />追加
            </button>
          </div>
          {loading ? (
            <p className="text-center text-gray-400 py-6 text-sm">読み込み中...</p>
          ) : members.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">メンバーが登録されていません</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <p className="font-medium text-gray-800 text-sm">{m.name} {m.age && `（${m.age}歳）`}</p>
                  {m.allergies?.length > 0 && <p className="text-xs text-red-500 mt-0.5">アレルギー: {m.allergies.join("、")}</p>}
                  {m.dislikes?.length > 0 && <p className="text-xs text-gray-400 mt-0.5">苦手: {m.dislikes.join("、")}</p>}
                </div>
                <button onClick={() => deleteMember(m.id)} className="p-2 text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">メンバーを追加</h2>
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="名前" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="年齢" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="アレルギー（例：卵、乳製品）" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="苦手な食材（例：ピーマン、なす）" value={form.dislikes} onChange={(e) => setForm({ ...form, dislikes: e.target.value })} />
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-medium text-gray-600">キャンセル</button>
              <button onClick={handleAddMember} className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-bold">追加する</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

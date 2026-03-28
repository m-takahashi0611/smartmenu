import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFridgeItems } from "@/hooks/useFirestore";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const CATEGORIES = ["野菜", "肉・魚", "乳製品", "調味料", "冷凍食品", "その他"];

export default function Fridge() {
  const navigate = useNavigate();
  const { items, loading, addItem, deleteItem } = useFridgeItems();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "野菜", quantity: "", expiryDate: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await addItem(form);
    setForm({ name: "", category: "野菜", quantity: "", expiryDate: "" });
    setShowForm(false);
  };

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">冷蔵庫の食材</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
        >
          <Plus size={16} />追加
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading ? (
          <p className="text-center text-gray-400 py-8">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🥦</p>
            <p className="text-gray-500">食材が登録されていません</p>
            <p className="text-gray-400 text-sm mt-1">「追加」ボタンから登録しましょう</p>
          </div>
        ) : (
          grouped.map(({ cat, items: catItems }) => (
            <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-600">{cat}</span>
              </div>
              {catItems.map((item) => (
                <div key={item.id} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity && `${item.quantity} `}
                      {item.expiryDate && `期限: ${item.expiryDate}`}
                    </p>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="p-2 text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* 追加フォーム（モーダル） */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">食材を追加</h2>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              placeholder="食材名（例：にんじん）"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              placeholder="数量（例：2本）"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-medium text-gray-600"
              >
                キャンセル
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-bold"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

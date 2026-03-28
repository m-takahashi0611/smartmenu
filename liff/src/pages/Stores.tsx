import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStores } from "@/hooks/useFirestore";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, Plus, Trash2, Star } from "lucide-react";

export default function Stores() {
  const navigate = useNavigate();
  const { stores, loading, addStore, updateStore, deleteStore } = useStores();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", saleInfo: "", isMain: false });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await addStore(form);
    setForm({ name: "", saleInfo: "", isMain: false });
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1"><ArrowLeft size={20} className="text-gray-600" /></button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">マイ店舗</h1>
        <button onClick={() => setShowForm(true)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1">
          <Plus size={16} />追加
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-8">読み込み中...</p>
        ) : stores.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🏪</p>
            <p className="text-gray-500">店舗が登録されていません</p>
          </div>
        ) : (
          stores.map((store) => (
            <div key={store.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800">{store.name}</p>
                    {store.isMain && <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">メイン</span>}
                  </div>
                  {store.saleInfo && <p className="text-sm text-gray-500 mt-1">🏷️ {store.saleInfo}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateStore(store.id, { isMain: !store.isMain })} className={`p-2 ${store.isMain ? "text-yellow-500" : "text-gray-300"}`}>
                    <Star size={18} fill={store.isMain ? "currentColor" : "none"} />
                  </button>
                  <button onClick={() => deleteStore(store.id)} className="p-2 text-red-400"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">店舗を追加</h2>
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="店舗名（例：イオン ○○店）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" rows={3} placeholder="特売情報（例：毎週水曜は肉半額）" value={form.saleInfo} onChange={(e) => setForm({ ...form, saleInfo: e.target.value })} />
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.isMain} onChange={(e) => setForm({ ...form, isMain: e.target.checked })} className="w-5 h-5 accent-green-600" />
              <span className="text-sm text-gray-700">メインの店舗として設定</span>
            </label>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-medium text-gray-600">キャンセル</button>
              <button onClick={handleAdd} className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-bold">追加する</button>
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}

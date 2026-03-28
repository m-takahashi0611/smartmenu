import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShoppingItems } from "@/hooks/useFirestore";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function Shopping() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];
  const { items, loading, toggleItem, addItem, deleteItem } = useShoppingItems(today);
  const [newItem, setNewItem] = useState("");

  const handleAdd = async () => {
    if (!newItem.trim()) return;
    await addItem(newItem.trim());
    setNewItem("");
  };

  const checked = items.filter((i) => i.isChecked);
  const unchecked = items.filter((i) => !i.isChecked);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1"><ArrowLeft size={20} className="text-gray-600" /></button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">買い物リスト</h1>
        <span className="text-xs text-gray-400">{today}</span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 手動追加 */}
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"
            placeholder="食材を追加..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button onClick={handleAdd} className="bg-green-600 text-white px-4 py-3 rounded-xl">
            <Plus size={20} />
          </button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🛒</p>
            <p className="text-gray-500">買い物リストが空です</p>
            <p className="text-gray-400 text-sm mt-1">献立を生成すると自動で追加されます</p>
          </div>
        ) : (
          <>
            {/* 未チェック */}
            {unchecked.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {unchecked.map((item) => (
                  <div key={item.id} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0">
                    <button onClick={() => toggleItem(item.id, true)} className="w-6 h-6 rounded-full border-2 border-gray-300 mr-3 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-800">{item.name}</span>
                    <button onClick={() => deleteItem(item.id)} className="p-1 text-gray-300"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* チェック済み */}
            {checked.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden opacity-60">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-medium">購入済み ({checked.length})</span>
                </div>
                {checked.map((item) => (
                  <div key={item.id} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0">
                    <button onClick={() => toggleItem(item.id, false)} className="w-6 h-6 rounded-full bg-green-500 mr-3 flex-shrink-0 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </button>
                    <span className="flex-1 text-sm text-gray-400 line-through">{item.name}</span>
                    <button onClick={() => deleteItem(item.id)} className="p-1 text-gray-300"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { callGetMenuHistory } from "@/lib/firebase";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft } from "lucide-react";

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callGetMenuHistory({ limit: 14 })
      .then((res) => setHistory(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1"><ArrowLeft size={20} className="text-gray-600" /></button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">献立の履歴</h1>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-8">読み込み中...</p>
        ) : history.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-500">まだ献立の履歴がありません</p>
          </div>
        ) : (
          history.map((plan) => (
            <div key={plan.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-700 text-sm">{plan.planDate}</span>
                {plan.isDelivered && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">配信済み</span>}
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <p>🌅 朝：{plan.breakfast}</p>
                <p>☀️ 昼：{plan.lunch}</p>
                <p>🌙 夜：{plan.dinner}</p>
              </div>
              {plan.estimatedCost && (
                <p className="text-xs text-gray-400 mt-2">💰 目安：約{plan.estimatedCost.toLocaleString()}円</p>
              )}
            </div>
          ))
        )}
      </div>
      <BottomNav />
    </div>
  );
}

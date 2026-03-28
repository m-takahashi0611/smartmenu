import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiff } from "@/hooks/useLiff";
import { callGenerateMenu } from "@/lib/firebase";
import BottomNav from "@/components/BottomNav";
import { Utensils, RefreshCw, ChevronRight } from "lucide-react";

export default function Dashboard() {
  const { profile } = useLiff();
  const [menu, setMenu] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await callGenerateMenu({});
      setMenu(result.data.messageText);
    } catch (err) {
      console.error(err);
      setMenu("献立の生成に失敗しました。しばらくしてからもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダー */}
      <div className="bg-green-600 text-white px-4 pt-12 pb-6 safe-top">
        <p className="text-green-200 text-sm">{today}</p>
        <h1 className="text-2xl font-bold mt-1">
          こんにちは、{profile?.displayName ?? "ゲスト"}さん 👋
        </h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* 今日の献立カード */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-green-50 px-4 py-3 flex items-center gap-2 border-b border-green-100">
            <Utensils size={18} className="text-green-600" />
            <span className="font-bold text-green-800">今日の献立</span>
          </div>
          <div className="p-4">
            {menu ? (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {menu}
              </pre>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">
                ボタンを押して今日の献立を生成しましょう
              </p>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="mt-4 w-full bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:bg-green-700 transition-colors"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              {loading ? "生成中..." : menu ? "再生成する" : "献立を生成する"}
            </button>
          </div>
        </div>

        {/* クイックリンク */}
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          {[
            { to: "/fridge", label: "🥦 冷蔵庫の食材を管理", desc: "在庫を登録して賢く使い切り" },
            { to: "/shopping", label: "🛒 今日の買い物リスト", desc: "献立から自動生成" },
            { to: "/family", label: "👨‍👩‍👧 家族構成を設定", desc: "アレルギー・好みを登録" },
            { to: "/stores", label: "🏪 マイ店舗・特売情報", desc: "近くのスーパーを登録" },
            { to: "/history", label: "📅 献立の履歴", desc: "過去14日分を確認" },
          ].map(({ to, label, desc }) => (
            <Link key={to} to={to} className="flex items-center px-4 py-3 active:bg-gray-50">
              <div className="flex-1">
                <p className="font-medium text-gray-800 text-sm">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

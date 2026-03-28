import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useLiff } from "@/hooks/useLiff";
import Dashboard from "@/pages/Dashboard";
import Family from "@/pages/Family";
import Fridge from "@/pages/Fridge";
import Stores from "@/pages/Stores";
import Shopping from "@/pages/Shopping";
import History from "@/pages/History";
import Loading from "@/components/Loading";

export default function App() {
  const { isReady, isLoggedIn, error } = useLiff();

  if (!isReady) return <Loading />;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-red-50">
      <div className="text-center p-8">
        <p className="text-red-600 font-bold text-lg">エラーが発生しました</p>
        <p className="text-red-500 mt-2 text-sm">{error}</p>
      </div>
    </div>
  );
  if (!isLoggedIn) return <Loading message="LINEログイン中..." />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/family" element={<Family />} />
        <Route path="/fridge" element={<Fridge />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

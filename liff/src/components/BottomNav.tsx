import { Link, useLocation } from "react-router-dom";
import { Home, Users, Refrigerator, Store, ShoppingCart, History } from "lucide-react";

const navItems = [
  { path: "/", icon: Home, label: "ホーム" },
  { path: "/fridge", icon: Refrigerator, label: "冷蔵庫" },
  { path: "/shopping", icon: ShoppingCart, label: "買い物" },
  { path: "/family", icon: Users, label: "家族" },
  { path: "/stores", icon: Store, label: "店舗" },
];

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom z-50">
      <div className="flex">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                active ? "text-green-600" : "text-gray-500"
              }`}
            >
              <Icon size={22} className={active ? "text-green-600" : "text-gray-400"} />
              <span className="mt-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

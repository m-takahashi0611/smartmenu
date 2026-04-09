import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LiffProvider } from "./contexts/LiffContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Fridge from "./pages/Fridge";
import Family from "./pages/Family";
import Stores from "./pages/Stores";
import Shopping from "./pages/Shopping";
import History from "./pages/History";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";
import MenuTheme from "./pages/MenuTheme";
import BentoMode from "./pages/BentoMode";
import PaymentSuccess from "./pages/PaymentSuccess";
import PlanManagement from "./pages/PlanManagement";
import TermsAndPrivacy from "./pages/TermsAndPrivacy";
import Contact from "./pages/Contact";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/fridge"} component={Fridge} />
      <Route path={"/family"} component={Family} />
      <Route path={"/stores"} component={Stores} />
      <Route path={"/shopping"} component={Shopping} />
      <Route path={"/history"} component={History} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin-login"} component={AdminLogin} />
      <Route path={"/menu-theme"} component={MenuTheme} />
      <Route path={"/bento-mode"} component={BentoMode} />
      <Route path={"/payment-success"} component={PaymentSuccess} />
      <Route path={"/plan"} component={PlanManagement} />
      <Route path={"/terms"} component={() => <TermsAndPrivacy page="terms" />} />
      <Route path={"/privacy"} component={() => <TermsAndPrivacy page="privacy" />} />
      <Route path={"/tokushoho"} component={() => <TermsAndPrivacy page="tokushoho" />} />
      <Route path={"/cancel-policy"} component={() => <TermsAndPrivacy page="cancel" />} />
      <Route path={"/contact"} component={Contact} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <LiffProvider>
            <Toaster />
            <Router />
          </LiffProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

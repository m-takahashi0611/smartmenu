import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Shield, Lock, Smartphone } from "lucide-react";

type Step = "credentials" | "otp";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("credentials");
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState("");

  const step1 = trpc.adminAuth.loginStep1.useMutation({
    onSuccess: (data) => {
      setUserId(data.userId);
      setSentTo(data.sentTo);
      setStep("otp");
      toast.success(`認証コードを送信しました`, {
        description: `${data.sentTo}に6桁のコードを送信しました`,
      });
    },
    onError: (err) => {
      toast.error("ログイン失敗", { description: err.message });
    },
  });

  const step2 = trpc.adminAuth.loginStep2.useMutation({
    onSuccess: () => {
      toast.success("ログイン成功");
      // セッションを更新してから管理画面へ
      window.location.href = "/admin";
    },
    onError: (err) => {
      toast.error("認証失敗", { description: err.message });
      setOtp("");
    },
  });

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminId.trim() || !password.trim()) {
      toast.error("IDとパスワードを入力してください");
      return;
    }
    step1.mutate({ adminId: adminId.trim(), password });
  };

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6 || !userId) {
      toast.error("6桁の認証コードを入力してください");
      return;
    }
    step2.mutate({ userId, otpCode: otp });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ロゴ */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🍽️</div>
          <h1 className="text-2xl font-bold text-amber-900">献立日和 coto coto</h1>
          <p className="text-amber-700 text-sm mt-1">管理者ポータル</p>
        </div>

        {step === "credentials" ? (
          <Card className="border-amber-200 shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="bg-amber-100 rounded-full p-3">
                  <Lock className="w-6 h-6 text-amber-700" />
                </div>
              </div>
              <CardTitle className="text-amber-900">管理者ログイン</CardTitle>
              <CardDescription>管理者IDとパスワードを入力してください</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStep1} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminId" className="text-amber-800">管理者ID</Label>
                  <Input
                    id="adminId"
                    type="text"
                    placeholder="管理者名またはメールアドレス"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    className="border-amber-200 focus:border-amber-400"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-amber-800">パスワード</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="パスワード（8文字以上）"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-amber-200 focus:border-amber-400"
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={step1.isPending}
                >
                  {step1.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      確認中...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      次へ（認証コードを送信）
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700 text-center">
                  🔒 2段階認証により、パスワードが突破されても<br />
                  LINEへの認証コード確認が必要です
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200 shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="bg-green-100 rounded-full p-3">
                  <Smartphone className="w-6 h-6 text-green-700" />
                </div>
              </div>
              <CardTitle className="text-amber-900">2段階認証</CardTitle>
              <CardDescription>
                {sentTo}に送信した6桁のコードを入力してください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStep2} className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(val) => setOtp(val)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={step2.isPending || otp.length !== 6}
                >
                  {step2.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      確認中...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      ログイン
                    </>
                  )}
                </Button>

              </form>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-amber-700 mt-2"
                  onClick={() => {
                    setStep("credentials");
                    setOtp("");
                  }}
                >
                  ← IDとパスワードの入力に戻る
                </Button>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-700 text-center">
                  コードの有効期限は10分です。<br />
                  届かない場合は前の画面に戻って再送信してください
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-amber-600 mt-6">
          一般ユーザーの方は{" "}
          <a href="/" className="underline hover:text-amber-800">
            こちら
          </a>
        </p>
      </div>
    </div>
  );
}

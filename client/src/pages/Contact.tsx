import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "プラン・支払いについて",
  "機能について",
  "取材・広告について",
  "法人・業務提携について",
  "その他",
] as const;

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [isFromError, setIsFromError] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    category: "" as (typeof CATEGORIES)[number] | "",
    message: "",
  });

  // エラー経由の場合、URLパラメータから自動入力
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'error') {
      setIsFromError(true);
      const name = params.get('name') || '';
      const errorType = params.get('errorType') || '';
      const errorMsg = params.get('errorMsg') || '';
      const ua = params.get('ua') || '';
      const at = params.get('at') || '';
      const autoMessage = [
        '【エラー報告】',
        `発生時刻: ${at ? new Date(at).toLocaleString('ja-JP') : '不明'}`,
        `エラー種別: ${errorType || '不明'}`,
        `エラー内容: ${errorMsg || '不明'}`,
        `UA: ${ua}`,
        '',
        '――――――――――',
        '上記のエラーについて、追加でお伝えしたいことがあればご記入ください。',
      ].join('\n');
      setForm(prev => ({
        ...prev,
        name: name,
        category: 'その他',
        message: autoMessage,
      }));
    }
  }, []);

  const sendMutation = trpc.contact.send.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      // ZodバリデーションエラーのJSONをパースして日本語メッセージを表示
      try {
        const parsed = JSON.parse(err.message);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
          toast.error(parsed[0].message);
          return;
        }
      } catch {
        // JSONでない場合はそのまま表示
      }
      toast.error(err.message || "送信に失敗しました");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category) {
      toast.error("お問い合わせ種別を選択してください");
      return;
    }
    sendMutation.mutate({
      name: form.name,
      email: form.email,
      category: form.category as (typeof CATEGORIES)[number],
      message: form.message,
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fdf9]">
      {/* ヘッダー */}
      <header className="bg-white border-b border-green-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="text-gray-500 hover:text-green-700 transition-colors p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xl">🍽️</span>
            <span className="font-bold text-green-800 text-sm">献立日和〜coto coto〜</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {submitted ? (
          /* 送信完了画面 */
          <div className="text-center py-16">
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-green-800 mb-3">
              お問い合わせを受け付けました
            </h1>
            <p className="text-gray-600 mb-2">
              内容を確認の上、担当者よりご連絡いたします。
            </p>
            <p className="text-gray-500 text-sm mb-8">
              通常2〜3営業日以内にご返信いたします。
            </p>
            <Link href="/">
              <Button className="bg-green-700 hover:bg-green-800 text-white">
                トップページへ戻る
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* タイトル */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-6 h-6 text-green-700" />
                <h1 className="text-2xl font-bold text-green-800">お問い合わせ</h1>
              </div>
              <p className="text-gray-600 text-sm">
                ご質問・ご要望・取材・業務提携など、お気軽にお問い合わせください。
                通常2～3営業日以内にご返信いたします。
              </p>
            </div>

            {/* エラー経由バナー */}
            {isFromError && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-bold mb-1">⚠️ ログインエラーについてのお問い合わせ</p>
                <p>エラー情報は自動入力されています。メールアドレスを入力して送信するだけでご連絡できます。</p>
              </div>
            )}

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl p-6 shadow-sm border border-green-50">
              {/* お名前 */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700 font-medium">
                  お名前 {!isFromError && <span className="text-red-500 text-xs">必須</span>}
                  {isFromError && <span className="text-xs text-gray-400 ml-1">(任意)</span>}
                </Label>
                <Input
                  id="name"
                  placeholder={isFromError ? "LINE名が取得できなかった場合は空白でも可" : "例：山田 花子"}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required={!isFromError}
                  className="border-gray-200 focus:border-green-400 focus:ring-green-400"
                />
              </div>

              {/* メールアドレス */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 font-medium">
                  メールアドレス <span className="text-red-500 text-xs">必須</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="例：example@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="border-gray-200 focus:border-green-400 focus:ring-green-400"
                />
                <p className="text-xs text-gray-400">ご返信先のメールアドレスをご入力ください</p>
              </div>

              {/* お問い合わせ種別 */}
              <div className="space-y-2">
                <Label className="text-gray-700 font-medium">
                  お問い合わせ種別 <span className="text-red-500 text-xs">必須</span>
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(val) =>
                    setForm({ ...form, category: val as (typeof CATEGORIES)[number] })
                  }
                >
                  <SelectTrigger className="border-gray-200 focus:border-green-400">
                    <SelectValue placeholder="種別を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* お問い合わせ内容 */}
              <div className="space-y-2">
                <Label htmlFor="message" className="text-gray-700 font-medium">
                  お問い合わせ内容 <span className="text-red-500 text-xs">必須</span>
                </Label>
                <Textarea
                  id="message"
                  placeholder="お問い合わせ内容をご記入ください（10文字以上）"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  required
                  rows={6}
                  className="border-gray-200 focus:border-green-400 focus:ring-green-400 resize-none"
                />
                <p className="text-xs text-gray-400 text-right">{form.message.length} / 2000文字</p>
              </div>

              {/* 送信ボタン */}
              <Button
                type="submit"
                disabled={sendMutation.isPending}
                className="w-full bg-green-700 hover:bg-green-800 text-white py-3 text-base font-medium rounded-xl"
              >
                {sendMutation.isPending ? "送信中..." : "送信する"}
              </Button>

              <p className="text-xs text-gray-400 text-center">
                送信内容は{" "}
                <Link href="/terms">
                  <span className="text-green-600 underline cursor-pointer">利用規約</span>
                </Link>
                {" "}および{" "}
                <Link href="/privacy">
                  <span className="text-green-600 underline cursor-pointer">プライバシーポリシー</span>
                </Link>
                {" "}に基づき取り扱います。
              </p>
            </form>
          </>
        )}
      </main>

      {/* フッター */}
      <footer className="mt-12 py-6 border-t border-green-100 bg-white">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-xs text-gray-400">
            © 2025 献立日和〜coto coto〜. AI献立提案サービス
          </p>
        </div>
      </footer>
    </div>
  );
}

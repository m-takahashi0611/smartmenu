import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type PageType = "terms" | "privacy";

export default function TermsAndPrivacy({ page }: { page?: PageType }) {
  const [activeTab, setActiveTab] = useState<PageType>(page ?? "terms");

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="text-lg">🍽️</span>
              <span className="font-bold text-primary text-sm">献立日和～coto coto～</span>
            </div>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs">← トップへ</Button>
          </Link>
        </div>
      </header>

      {/* タブ切り替え */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("terms")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "terms"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            利用規約
          </button>
          <button
            onClick={() => setActiveTab("privacy")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "privacy"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            プライバシーポリシー
          </button>
        </div>

        {activeTab === "terms" && <TermsContent />}
        {activeTab === "privacy" && <PrivacyContent />}

        <div className="pb-12" />
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="prose prose-sm max-w-none text-foreground">
      <h1 className="text-xl font-bold text-primary mb-2">利用規約</h1>
      <p className="text-xs text-muted-foreground mb-6">最終更新日：2025年4月1日</p>

      <p className="text-sm leading-relaxed mb-4">
        本利用規約（以下「本規約」）は、献立日和〜coto coto〜（以下「本サービス」）の利用条件を定めるものです。
        ユーザーの皆様（以下「ユーザー」）には、本規約に同意いただいた上で本サービスをご利用いただきます。
      </p>

      <Section title="第1条（適用）">
        本規約は、ユーザーと本サービス運営者（以下「当社」）との間の本サービスの利用に関わる一切の関係に適用されます。
      </Section>

      <Section title="第2条（利用登録）">
        本サービスはLINEアカウントによる認証を通じてご利用いただきます。登録申請者が以下のいずれかに該当する場合、利用登録をお断りすることがあります。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>虚偽の事項を届け出た場合</li>
          <li>本規約に違反したことがある者からの申請である場合</li>
          <li>その他、当社が利用登録を相当でないと判断した場合</li>
        </ul>
      </Section>

      <Section title="第3条（有料サービス・料金）">
        本サービスには無料プランと有料プラン（プレミアムプラン）があります。有料プランのご利用にあたっては、当社が定める料金を支払っていただきます。料金の支払いはStripe社の決済システムを通じて行われます。一度お支払いいただいた料金は、法令に定める場合を除き返金いたしません。
      </Section>

      <Section title="第4条（サブスクリプションの解約）">
        有料プランはいつでも解約することができます。解約後は次回更新日まで有料プランの機能をご利用いただけます。解約のお手続きはダッシュボード内の「プラン管理」ページから行えます。
      </Section>

      <Section title="第5条（禁止事項）">
        ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>法令または公序良俗に違反する行為</li>
          <li>犯罪行為に関連する行為</li>
          <li>本サービスのサーバーまたはネットワークの機能を破壊・妨害する行為</li>
          <li>本サービスの運営を妨害するおそれのある行為</li>
          <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
          <li>不正アクセスをし、またはこれを試みる行為</li>
          <li>当社または第三者の知的財産権、肖像権、プライバシー、名誉その他の権利または利益を侵害する行為</li>
          <li>その他、当社が不適切と判断する行為</li>
        </ul>
      </Section>

      <Section title="第6条（本サービスの提供の停止等）">
        当社は、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく本サービスの全部または一部の提供を停止または中断することができます。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>本サービスにかかるコンピュータシステムの保守点検または更新を行う場合</li>
          <li>地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合</li>
          <li>その他、当社が本サービスの提供が困難と判断した場合</li>
        </ul>
      </Section>

      <Section title="第7条（免責事項）">
        当社は、本サービスに関して、ユーザーと他のユーザーまたは第三者との間において生じた取引、連絡または紛争等について一切責任を負いません。また、AIが提案する献立・レシピはあくまで参考情報であり、アレルギーや健康状態に応じた判断はユーザー自身の責任で行ってください。
      </Section>

      <Section title="第8条（サービス内容の変更等）">
        当社は、ユーザーへの事前の告知をもって、本サービスの内容を変更、追加または廃止することがあり、ユーザーはこれを承諾するものとします。
      </Section>

      <Section title="第9条（利用規約の変更）">
        当社は必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができます。変更後の利用規約は、本サービス上に掲示したときから効力を生じるものとします。
      </Section>

      <Section title="第10条（準拠法・裁判管轄）">
        本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当社の所在地を管轄する裁判所を専属的合意管轄とします。
      </Section>

      <p className="text-xs text-muted-foreground mt-8">以上</p>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="prose prose-sm max-w-none text-foreground">
      <h1 className="text-xl font-bold text-primary mb-2">プライバシーポリシー</h1>
      <p className="text-xs text-muted-foreground mb-6">最終更新日：2025年4月1日</p>

      <p className="text-sm leading-relaxed mb-4">
        献立日和〜coto coto〜（以下「本サービス」）は、ユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
      </p>

      <Section title="第1条（収集する情報）">
        本サービスでは、以下の情報を収集します。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li><strong>LINEアカウント情報：</strong>ユーザーID、表示名、プロフィール画像（LINEログイン時に取得）</li>
          <li><strong>家族構成情報：</strong>家族の名前・年齢・食の好みなど、ユーザーが任意で登録した情報</li>
          <li><strong>冷蔵庫・食材情報：</strong>ユーザーが登録した食材・在庫情報</li>
          <li><strong>献立・利用履歴：</strong>AIが生成した献立の内容と利用日時</li>
          <li><strong>決済情報：</strong>有料プランご利用時の決済情報（Stripe社が管理。カード番号等は当社では保持しません）</li>
          <li><strong>アクセスログ：</strong>IPアドレス、ブラウザ情報、アクセス日時等</li>
        </ul>
      </Section>

      <Section title="第2条（情報の利用目的）">
        収集した情報は以下の目的で利用します。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>本サービスの提供・運営</li>
          <li>AIによる献立提案の精度向上</li>
          <li>LINEを通じた献立・情報の配信</li>
          <li>有料プランの決済処理・管理</li>
          <li>お問い合わせへの対応</li>
          <li>サービス改善・新機能開発のための分析</li>
          <li>利用規約違反への対応</li>
        </ul>
      </Section>

      <Section title="第3条（第三者提供）">
        当社は、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>ユーザーの同意がある場合</li>
          <li>法令に基づく場合</li>
          <li>人の生命・身体・財産の保護のために必要な場合</li>
          <li>公衆衛生の向上または児童の健全育成のために必要な場合</li>
        </ul>
        なお、決済処理にはStripe, Inc.のサービスを利用しており、決済に必要な情報が同社に提供されます。
      </Section>

      <Section title="第4条（外部サービスの利用）">
        本サービスでは以下の外部サービスを利用しています。
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li><strong>LINE：</strong>認証・メッセージ配信（LINE株式会社）</li>
          <li><strong>Stripe：</strong>決済処理（Stripe, Inc.）</li>
          <li><strong>OpenAI：</strong>AIによる献立生成（OpenAI, L.L.C.）</li>
        </ul>
        各サービスのプライバシーポリシーについては、各社のウェブサイトをご確認ください。
      </Section>

      <Section title="第5条（情報の管理）">
        当社は、収集した個人情報を適切に管理し、不正アクセス・紛失・破壊・改ざん・漏洩などを防止するために、適切なセキュリティ対策を実施します。
      </Section>

      <Section title="第6条（開示・訂正・削除）">
        ユーザーは、当社が保有する自己の個人情報の開示・訂正・削除を求めることができます。ご要望はサービス内のお問い合わせ機能またはLINEのトーク画面よりご連絡ください。
      </Section>

      <Section title="第7条（Cookieの利用）">
        本サービスでは、ログイン状態の維持等のためにCookieおよびlocalStorageを利用しています。ブラウザの設定によりCookieを無効にすることができますが、その場合は一部機能が利用できなくなることがあります。
      </Section>

      <Section title="第8条（プライバシーポリシーの変更）">
        本ポリシーの内容は、必要に応じて変更することがあります。変更後のポリシーは本サービス上に掲示した時点から効力を生じます。
      </Section>

      <Section title="第9条（お問い合わせ）">
        本ポリシーに関するお問い合わせは、LINEの公式アカウントのトーク画面よりご連絡ください。
      </Section>

      <p className="text-xs text-muted-foreground mt-8">以上</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-foreground mb-2 border-l-4 border-primary pl-3">{title}</h2>
      <div className="text-sm leading-relaxed text-foreground/80 pl-1">{children}</div>
    </div>
  );
}

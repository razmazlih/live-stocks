import Image from 'next/image';
import Link from 'next/link';
import { getPublicPublisher } from '@/lib/public-publisher';
import { publicInformation, type InformationKind } from '@/lib/public-information';

export async function PublicInformation({ kind, searchParams }: {
  kind: InformationKind;
  searchParams: Promise<{ lang?: string }>;
}) {
  const publisher = getPublicPublisher();
  if (!publisher) return <main><h1>LiveStocks</h1><p>מידע השירות עדיין אינו זמין לפרסום. / Service information is not yet available for publication.</p></main>;
  const locale = (await searchParams).lang === 'en' ? 'en' : 'he';
  const he = locale === 'he';
  const copy = publicInformation[locale][kind];
  return <main lang={locale} dir={he ? 'rtl' : 'ltr'} className="min-h-screen bg-[var(--color-bg-primary)] px-5 py-8 text-[var(--color-text-primary)] sm:py-12">
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href={`/about?lang=${locale}`} className="inline-flex items-center gap-3 text-xl font-semibold"><Image src="/brand/livestocks.svg" alt="" width={40} height={40} />LiveStocks</Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/${kind}?lang=${he ? 'en' : 'he'}`} lang={he ? 'en' : 'he'} className="rounded-lg border border-slate-300 px-3 py-2">{he ? 'English' : 'עברית'}</Link>
          <Link href="/sign-in" className="rounded-lg bg-blue-600 px-4 py-2 text-white">{he ? 'כניסה לחשבון' : 'Sign in'}</Link>
        </div>
      </header>
      <article className="space-y-8 rounded-3xl border border-slate-200/70 bg-white/75 p-6 shadow-sm backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80 sm:p-10">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-base leading-7 text-slate-600 dark:text-slate-300">{copy.intro}</p>
          <p className="text-sm text-slate-500">{he ? 'עודכן: 14 בנובמבר 2026' : 'Updated: November 14, 2026'}</p>
        </div>
        {copy.sections.map((section) => <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-slate-600 dark:text-slate-300">{paragraph}</p>)}
        </section>)}
        {kind === 'privacy' && <section className="space-y-3">
          <h2 className="text-lg font-semibold">{he ? 'מדיניות ספקים' : 'Provider policies'}</h2>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{he ? 'לפרטים על עיבוד המידע בשירותים הנפרדים:' : 'For information about processing by these separate services:'}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-3 text-sm underline underline-offset-4">
            <li><a href="https://www.okta.com/legal/privacy-policy/">Auth0 / Okta</a></li>
            <li><a href="https://supabase.com/privacy">Supabase</a></li>
            <li><a href="https://vercel.com/legal/privacy-notice">Vercel</a></li>
            <li><a href="https://policies.google.com/privacy">Google</a></li>
            <li><a href="https://openai.com/policies/privacy-policy/">OpenAI / ChatGPT</a></li>
          </ul>
        </section>}
        <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700">
          <h2 className="text-lg font-semibold">{he ? 'מפעיל השירות ותמיכה' : 'Operator and support'}</h2>
          <p className="text-sm leading-7">{publisher.name}</p>
          <a href={`mailto:${publisher.email}`} dir="ltr" className="inline-block max-w-full break-all text-sm text-blue-600 underline underline-offset-4">{publisher.email}</a>
          <p className="text-xs leading-6 text-slate-500">{he ? 'אין לשלוח סיסמאות או מפתחות גישה בפנייה לתמיכה.' : 'Do not send passwords or access keys in support requests.'}</p>
        </section>
      </article>
      <nav aria-label={he ? 'מידע על השירות' : 'Service information'} className="flex flex-wrap justify-center gap-6 text-sm text-slate-600 dark:text-slate-300">
        {(['about', 'privacy', 'terms'] as const).map((page) => <Link key={page} href={`/${page}?lang=${locale}`} aria-current={page === kind ? 'page' : undefined} className="underline underline-offset-4">{publicInformation[locale][page].title}</Link>)}
      </nav>
    </div>
  </main>;
}

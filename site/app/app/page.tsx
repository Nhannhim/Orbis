import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';
import { OrbisMark } from '@/components/orbis-mark';
import { OrbisWorkspace } from '@/components/orbis-workspace';

export const dynamic = 'force-dynamic';

function SignInGate() {
  return (
    <main className="signin-shell dark">
      <header className="signin-header">
        <a href="/" className="marketing-brand"><OrbisMark inverse /><span>Orbis</span></a>
        <a href="/">Back to orbis.systems</a>
      </header>
      <section className="signin-card">
        <span className="signin-icon"><LockKeyhole /></span>
        <p>ORBIS WORKSPACE</p>
        <h1>Enter your physical operations network.</h1>
        <span className="signin-description">Identity protects every command, policy decision, and custody transition.</span>
        <a className="signin-primary" href={chatGPTSignInPath('/app')} target="_top">
          Sign in with ChatGPT <ArrowRight size={17} />
        </a>
        <a className="signin-demo" href="/app/demo">Explore the demo workspace</a>
        <div className="signin-trust"><ShieldCheck size={15} /> Authenticated execution · signed audit trail</div>
      </section>
    </main>
  );
}

export default async function ProductHome() {
  const user = await getChatGPTUser();
  if (!user) return <SignInGate />;
  return <OrbisWorkspace displayName={user.displayName} />;
}

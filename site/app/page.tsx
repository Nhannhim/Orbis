import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Factory,
  HeartPulse,
  Network,
  ScanLine,
  ShieldCheck,
  Truck,
  Warehouse,
} from 'lucide-react';
import { OrbisMark } from '@/components/orbis-mark';

function CoordinationField() {
  return (
    <div className="coordination-field" aria-label="A package moving through an orchestrated warehouse network">
      <div className="field-orbit field-orbit--one" />
      <div className="field-orbit field-orbit--two" />
      <div className="field-path field-path--one" />
      <div className="field-path field-path--two" />

      <div className="field-node field-node--origin">
        <span className="field-node-icon"><Box size={17} strokeWidth={1.6} /></span>
        <span><strong>Packing cell</strong><small>Object verified</small></span>
      </div>
      <div className="field-node field-node--moving">
        <span className="field-node-icon"><ScanLine size={17} strokeWidth={1.6} /></span>
        <span><strong>Mobile robot</strong><small>Custody accepted</small></span>
      </div>
      <div className="field-node field-node--destination">
        <span className="field-node-icon"><Truck size={17} strokeWidth={1.6} /></span>
        <span><strong>Outbound vehicle</strong><small>Ready at dock 04</small></span>
      </div>

      <div className="field-object">
        <span>PKG</span>
        <strong>1042</strong>
      </div>

      <div className="field-status"><span /> Orchestration active</div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="marketing-shell">
      <header className="marketing-nav">
        <a className="marketing-brand" href="#top" aria-label="Orbis home">
          <OrbisMark />
          <span>Orbis</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#system">System</a>
          <a href="#applications">Applications</a>
          <a href="#principles">Principles</a>
        </nav>
        <a className="nav-cta" href="/app">
          Enter workspace <ArrowUpRight size={15} />
        </a>
      </header>

      <section className="marketing-hero" id="top">
        <div className="hero-copy-block">
          <p className="marketing-kicker">Physical intelligence, coordinated</p>
          <h1>
            A shared intelligence
            <span>for the physical world.</span>
          </h1>
          <p className="marketing-lede">
            Orbis is the coordination layer for machines that perceive, verify,
            and act together—from a single warehouse to the global movement of goods.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="/app">
              Explore the workspace <ArrowUpRight size={16} />
            </a>
            <a className="text-link" href="#system">See how it works</a>
          </div>
        </div>
        <CoordinationField />
      </section>

      <section className="statement-band" id="system">
        <p>ORCHESTRATION / 01</p>
        <h2>
          Machines already know how to act.
          <span>Orbis gives them a way to act together.</span>
        </h2>
      </section>

      <section className="system-section">
        <div className="section-intro">
          <p className="section-index">THE SYSTEM / 02</p>
          <div>
            <h2>One objective becomes coordinated physical work.</h2>
            <p>
              Orbis translates intent into verifiable tasks, finds the right machine,
              and maintains a continuous chain of custody across the entire workflow.
            </p>
          </div>
        </div>
        <div className="system-steps">
          {[
            ['01', 'Observe', 'Machines ground every action in live sensor and vision data.'],
            ['02', 'Coordinate', 'The orchestrator assigns goals by capability, state, and policy.'],
            ['03', 'Verify', 'Evidence proves the physical outcome before responsibility moves.'],
            ['04', 'Handoff', 'The next agent accepts the object, context, and chain of custody.'],
          ].map(([number, title, description]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="product-window-section" id="principles">
        <div className="product-copy">
          <p className="section-index">ORBIS WORKSPACE / 03</p>
          <h2>See the world every machine shares.</h2>
          <p>
            Operators plan objectives, follow live execution, inspect evidence, and
            recover exceptions from one operational surface.
          </p>
          <a href="/app/demo">Open the live product demo <ArrowRight size={16} /></a>
        </div>
        <div className="product-preview" aria-label="Preview of the Orbis operations workspace">
          <div className="preview-topbar">
            <span><OrbisMark inverse /> orbis / northstar</span>
            <span className="preview-health"><i /> All systems nominal</span>
          </div>
          <div className="preview-body">
            <aside>
              <Network size={17} />
              <ScanLine size={17} />
              <ShieldCheck size={17} />
            </aside>
            <div className="preview-main">
              <p>ACTIVE OBJECTIVE</p>
              <h3>Move ORD-1042 to outbound vehicle</h3>
              <div className="preview-flow">
                <span className="is-done"><Box size={15} /> Packed <i>✓</i></span>
                <b />
                <span className="is-active"><Truck size={15} /> In transit <i>02</i></span>
                <b />
                <span><Warehouse size={15} /> Load vehicle <i>03</i></span>
              </div>
              <div className="preview-evidence">
                <span>VISION EVIDENCE</span>
                <strong>Identity and seal verified</strong>
                <em>99.2% confidence</em>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="applications-section" id="applications">
        <div className="section-intro">
          <p className="section-index">APPLICATIONS / 04</p>
          <div><h2>From one facility to an entire physical network.</h2></div>
        </div>
        <div className="application-grid">
          <article>
            <Warehouse size={25} strokeWidth={1.35} />
            <span>01</span>
            <h3>Logistics</h3>
            <p>Coordinate packing cells, mobile robots, docks, vehicles, and receiving systems as one continuous workflow.</p>
          </article>
          <article>
            <Factory size={25} strokeWidth={1.35} />
            <span>02</span>
            <h3>Manufacturing</h3>
            <p>Synchronize production equipment around changing demand, machine health, material state, and quality evidence.</p>
          </article>
          <article>
            <HeartPulse size={25} strokeWidth={1.35} />
            <span>03</span>
            <h3>Clinical environments</h3>
            <p>Coordinate certified systems through policy-bound workflows with explicit human authority and complete auditability.</p>
          </article>
        </div>
      </section>

      <section className="closing-section">
        <p>THE COORDINATION LAYER FOR PHYSICAL AI</p>
        <h2>Give every machine<br />a shared sense of what comes next.</h2>
        <a href="/app">Enter Orbis <ArrowUpRight size={18} /></a>
      </section>

      <footer className="marketing-footer">
        <a className="marketing-brand" href="#top"><OrbisMark /> <span>Orbis</span></a>
        <p>Physical intelligence, coordinated.</p>
        <p>© 2026 Orbis Systems</p>
      </footer>
    </main>
  );
}

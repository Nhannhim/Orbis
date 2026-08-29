import {
  Armchair,
  ArrowRight,
  ArrowUpRight,
  Box,
  House,
  Lightbulb,
  Network,
  PackageCheck,
  Play,
  Route,
  ScanLine,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Truck,
  UtensilsCrossed,
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
            and act together—from an end-to-end delivery network to a home that
            prepares itself around the people arriving.
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
          <div>
            <h2>Describe the outcome. Orbis composes the physical world around it.</h2>
            <p>
              Each objective becomes a spatial plan: the machines, handoffs, room
              states, and evidence needed to make the result real.
            </p>
          </div>
        </div>

        <div className="use-case-stack">
          <article className="use-case-card use-case-card--warehouse">
            <div className="use-case-media">
              <img
                src="/images/orbis-warehouse-journey.jpg"
                alt="A parcel moving from a warehouse robot to a packing arm, truck, autonomous road vehicle, and porch delivery robot."
                loading="lazy"
              />
              <div className="use-case-media-topline">
                <span>GENERATED WORLD / WAREHOUSE TO DOORSTEP</span>
                <span><Play size={11} fill="currentColor" /> Motion-ready scene</span>
              </div>
              <div className="use-case-media-caption">
                <span><i /> ORD-1042</span>
                <strong>One object · five custody transfers</strong>
              </div>
            </div>

            <div className="use-case-copy">
              <div className="use-case-heading">
                <div>
                  <span><Warehouse size={17} /> USE CASE 01 · WAREHOUSES</span>
                  <h3>One package.<br />One continuous plan.</h3>
                </div>
                <p>
                  Orbis keeps the object, intent, and proof intact as work moves
                  across robots, infrastructure, and transportation networks.
                </p>
              </div>

              <div className="use-case-prompt">
                <span>HUMAN OBJECTIVE</span>
                <p>“Deliver package ORD-1042 from shelf C2 to the customer&apos;s porch.”</p>
                <Route size={20} />
              </div>

              <ol className="journey-grid">
                <li><span>01</span><Box /><strong>Pick</strong><p>A mobile robot identifies and lifts the parcel.</p></li>
                <li><span>02</span><PackageCheck /><strong>Pack</strong><p>The packing arm seals, weighs, and verifies it.</p></li>
                <li><span>03</span><Truck /><strong>Linehaul</strong><p>The dock loads the truck and signs custody over.</p></li>
                <li><span>04</span><Route /><strong>Autonomous road</strong><p>A Waymo-class vehicle accepts the final-mile route.</p></li>
                <li><span>05</span><House /><strong>Doorstep</strong><p>The delivery robot places it on the porch and proves arrival.</p></li>
              </ol>
            </div>
          </article>

          <article className="use-case-card use-case-card--home">
            <div className="use-case-media">
              <img
                src="/images/orbis-home-dinner-reset.jpg"
                alt="Home robots rearranging furniture, cleaning, setting a table for sixteen, and tuning warm evening lighting."
                loading="lazy"
              />
              <div className="use-case-media-topline">
                <span>GENERATED WORLD / HOME RESET</span>
                <span><Play size={11} fill="currentColor" /> Motion-ready scene</span>
              </div>
              <div className="use-case-media-caption">
                <span><i /> DINNER FOR 16</span>
                <strong>Five coordinated room changes</strong>
              </div>
            </div>

            <div className="use-case-copy">
              <div className="use-case-heading">
                <div>
                  <span><Armchair size={17} /> USE CASE 02 · HOME APPLIANCES</span>
                  <h3>A home that resets<br />around your plans.</h3>
                </div>
                <p>
                  A single prompt becomes a room layout and a coordinated task plan.
                  Orbis adapts the same space for an intimate date or a dinner for twenty.
                </p>
              </div>

              <div className="use-case-prompt use-case-prompt--home">
                <span>HUMAN OBJECTIVE</span>
                <p>“Prepare the house for dinner with 16 at 7 PM. Make it warm, open, and ready before guests arrive.”</p>
                <Sparkles size={20} />
              </div>

              <div className="home-settings" aria-label="The room settings Orbis coordinates">
                <div><Lightbulb /><span><strong>Lights</strong><small>Warm 2700K layers</small></span></div>
                <div><Armchair /><span><strong>Room layout</strong><small>Conversation + dining zones</small></span></div>
                <div><SprayCan /><span><strong>Cleanliness</strong><small>Vacuum, mop, clear surfaces</small></span></div>
                <div><Sparkles /><span><strong>Decoration</strong><small>Greenery, linens, candles</small></span></div>
                <div><UtensilsCrossed /><span><strong>Other tasks</strong><small>Set 16 places, stage dishes</small></span></div>
              </div>

              <div className="layout-presets">
                <span>ONE ROOM / THREE OUTCOMES</span>
                <div><strong>Date night</strong><small>2 people · intimate</small></div>
                <div className="is-active"><strong>Dinner</strong><small>10–16 · social</small></div>
                <div><strong>Gathering</strong><small>20 people · open</small></div>
              </div>
            </div>
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

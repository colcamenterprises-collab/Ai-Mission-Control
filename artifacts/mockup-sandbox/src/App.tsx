import { useEffect, useMemo, useState, type ComponentType } from "react";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

type ProductCard = {
  name: string;
  status: string;
  summary: string;
  detail: string;
  bullets: string[];
};

type ProofPoint = {
  value: string;
  label: string;
};

function resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter((v) => typeof v === "function") as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
  modules,
}: {
  componentPath: string;
  modules: ModuleMap;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) {
          return;
        }
        const name = componentPath.split("/").pop()!;
        const comp = resolveComponent(mod, name);
        if (!comp) {
          setError(
            `No exported React component found in ${componentPath}.tsx\n\nMake sure the file has at least one exported function component.`,
          );
          return;
        }
        setComponent(() => comp);
      } catch (e) {
        if (cancelled) {
          return;
        }

        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to load preview.\n${message}`);
      }
    }

    void loadComponent();

    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) {
    return (
      <pre className="min-h-screen bg-slate-950 p-8 text-sm text-red-300 whitespace-pre-wrap">
        {error}
      </pre>
    );
  }

  if (!Component) return null;

  return <Component />;
}

function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function getPreviewExamplePath(): string {
  const basePath = getBasePath();
  return `${basePath}/preview/ComponentName`;
}

function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;
  const local =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

const proofPoints: ProofPoint[] = [
  { value: "One", label: "canonical source of truth" },
  { value: "Multi-tenant", label: "tenant isolation by design" },
  { value: "Server-side", label: "RBAC and audit trails" },
  { value: "Fast demo", label: "saleable staging experience" },
];

const products: ProductCard[] = [
  {
    name: "POS",
    status: "Demo surface",
    summary: "The operational front door for order capture, payments, and shift flow.",
    detail:
      "Positioned for restaurant teams first, with a clean story for broader commerce once the v3 core expands.",
    bullets: ["Order entry and receipt story", "Shift-oriented workflow", "Tenant-aware branding"],
  },
  {
    name: "Dashboard",
    status: "Core narrative",
    summary: "Management visibility for sales, activity, and operational health.",
    detail:
      "A single control surface for owners and managers that maps cleanly to auditability, approvals, and reporting.",
    bullets: ["Executive metrics", "Audit-ready timelines", "Cross-tenant-safe views"],
  },
  {
    name: "KDS",
    status: "Coming soon",
    summary: "Kitchen execution lane for throughput and preparation sequencing.",
    detail:
      "Shown as an accurate roadmap item, not as a finished claim. The demo surfaces the workflow without overstating production readiness.",
    bullets: ["Ticket visibility", "Preparation timing", "Kitchen-friendly layout"],
  },
  {
    name: "CDS",
    status: "Coming soon",
    summary: "Customer display story for service transparency and trust.",
    detail:
      "A planned companion surface that fits the broader enterprise platform story while remaining clearly labeled as upcoming.",
    bullets: ["Customer-facing status", "Brand-safe presentation", "Future-ready slot"],
  },
  {
    name: "Ordering",
    status: "Integration-ready demo",
    summary: "Channel expansion from restaurant operations into flexible digital ordering.",
    detail:
      "The website frames ordering as part of the platform narrative without implying live integrations that are not yet verified.",
    bullets: ["Menu-led purchase journey", "Channel expansion", "Conversion-first CTA"],
  },
];

function metricTile({ value, label }: ProofPoint) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10 backdrop-blur">
      <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-300">{label}</div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-slate-300">{description}</p>
    </div>
  );
}

function ProductPanel({ product }: { product: ProductCard }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white">{product.name}</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{product.summary}</p>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
          {product.status}
        </span>
      </div>
      <p className="mt-5 text-sm leading-6 text-slate-400">{product.detail}</p>
      <ul className="mt-5 space-y-3 text-sm text-slate-300">
        {product.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" aria-hidden="true" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function LandingPage() {
  const featureRows = useMemo(
    () => [
      ["Restaurant-first product story", "Enterprise architecture underneath"],
      ["Clear demo/coming-soon labels", "No unsupported capability claims"],
      ["Mobile, tablet, desktop responsive", "Conversion and contact CTA"],
    ],
    [],
  );

  return (
    <div
      id="top"
      className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_28%),linear-gradient(180deg,#020617_0%,#07111f_42%,#020617_100%)] text-white"
    >
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Customli v3.0
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Enterprise restaurant platform and demo front end
          </div>
        </div>
        <a
          href="#contact"
          className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-400/20"
        >
          Book a demo
        </a>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <section className="grid gap-12 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              Saleable staging experience for the Customli platform
            </div>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Sell the platform before the platform is finished.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              This demo front end makes Customli understandable to restaurant operators:
              POS, Dashboard, KDS, CDS, and Ordering told as one cohesive enterprise story,
              with accurate demo and coming-soon labeling throughout.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#products"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
              >
                Explore the product story
              </a>
              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Contact / demo request
              </a>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {proofPoints.map(metricTile)}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/30">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="text-sm font-semibold text-white">Customli product suite</div>
                <div className="text-xs text-slate-400">Demo surfaces and roadmap clarity</div>
              </div>
              <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
                Ready for review
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                <div className="text-xs uppercase tracking-[0.25em] text-cyan-200">Live demo surface</div>
                <div className="mt-2 text-lg font-semibold text-white">Desktop story</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Crisp navigation, product hierarchy, and conversion messaging for decision makers.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Tablet</div>
                  <div className="mt-2 text-sm text-white">Kitchen / floor ready layout</div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Compact, readable, and service-friendly.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Mobile</div>
                  <div className="mt-2 text-sm text-white">Demo-first conversion path</div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Fast access to CTA, product proof, and summary.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4">
                <div className="text-sm font-medium text-white">What this demo does not claim</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  No live payments, no unverified integrations, and no fabricated production readiness.
                  The website is intentionally labeled as a commercial demo front end.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 py-10 sm:grid-cols-3">
          {featureRows.map(([left, right]) => (
            <div
              key={`${left}-${right}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 shadow-lg shadow-black/10"
            >
              <div className="font-medium text-white">{left}</div>
              <div className="mt-2 text-slate-400">{right}</div>
            </div>
          ))}
        </section>

        <section id="products" className="space-y-8 py-14">
          <SectionHeading
            eyebrow="Product story"
            title="One platform narrative across the restaurant stack"
            description="The website should not just look premium; it should make the platform legible. Each surface is framed as part of one multi-tenant enterprise system with clear status labels and room to expand beyond restaurants."
          />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <ProductPanel key={product.name} product={product} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 py-14 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/20">
            <SectionHeading
              eyebrow="Enterprise guardrails"
              title="Built to feel saleable and credible"
              description="The front end communicates the architecture that matters to buyers: one canonical source of truth, tenant isolation, server-side RBAC, auditability, and rollback-friendly evolution."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Tenant #1 is SBB, not a hardcoded special case.",
                "Architecture copy is precise about what is live versus coming soon.",
                "The product page can be swapped forward as v3 capabilities land.",
                "Conversion copy keeps the demo saleable without overstating readiness.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/5 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              Demo / preview mode
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              Live-looking, but carefully labeled.
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Use this surface to show the commercial intent of Customli v3.0 without confusing it
              with production state. The right-hand panel, CTA, and status markers are built to keep
              the narrative honest and saleable.
            </p>
            <div className="mt-6 rounded-2xl border border-dashed border-cyan-400/25 bg-slate-950/40 p-4">
              <div className="text-sm font-medium text-white">Suggested screenshot replacement slots</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• POS tablet mock</li>
                <li>• Dashboard overview</li>
                <li>• KDS ticket lane</li>
                <li>• CDS service display</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="contact" className="py-14">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
                  Conversion / contact
                </div>
                <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  Ready to show the platform to a buyer, partner, or internal stakeholder.
                </h3>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                  This page gives Astra a clean, enterprise-grade front end for Customli v3.0 while
                  preserving the exact limits of what is currently available.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <a
                  href="mailto:hello@customli.example"
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
                >
                  Email demo request
                </a>
                <a
                  href="#top"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-black/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Back to top
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function App() {
  const previewPath = getPreviewPath();

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  return <LandingPage />;
}

export default App;

import { useQuery } from "@tanstack/react-query";
import { Building2, ShieldCheck, Bot, CreditCard, Palette, CheckCircle2, CircleDashed, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import "./product-setup.css";

type ProductSnapshot = { product:{name:string;version:string;edition:string}; organization:{name:string;slug:string;industry?:string|null;country?:string|null;timezone:string}; branding?:{displayName?:string|null;theme:string}|null; onboarding?:Record<string,unknown>|null; plan?:{planKey:string;billingStatus:string;entitlements:Record<string,boolean>}|null };
type Readiness = { releaseReady:boolean; gates:Array<{key:string;label:string;status:"pass"|"incomplete"|"fail";detail:string}> };
async function json<T>(url:string):Promise<T>{const r=await fetch(url,{credentials:"include"});if(!r.ok) throw new Error(`HTTP ${r.status}`);return r.json()}
export default function ProductSetup(){
 const product=useQuery({queryKey:["v3-product"],queryFn:()=>json<ProductSnapshot>("/api/v3/product")});
 const readiness=useQuery({queryKey:["v3-readiness"],queryFn:()=>json<Readiness>("/api/v3/readiness")});
 if(product.isLoading||readiness.isLoading) return <div className="mission-canvas product-setup"><div className="v3-loading">Loading Mission Control 3.0…</div></div>;
 if(product.isError||readiness.isError||!product.data||!readiness.data) return <div className="mission-canvas product-setup"><div className="v3-error"><AlertTriangle/>Product setup data is unavailable. Mission Control is not treating missing data as healthy.</div></div>;
 const p=product.data,r=readiness.data,o=p.onboarding??{}; const checks=[['Business profile',o.businessProfileComplete],['Branding',o.brandingComplete],['Modules selected',o.modulesSelected],['Knowledge imported',o.knowledgeImported],['First AI employee',o.firstAgentCreated],['First workflow certified',o.firstWorkflowCertified]] as const;
 return <div className="mission-canvas product-setup">
  <header className="v3-hero"><div><span>Mission Control {p.product.version}</span><h1>Product Setup</h1><p>Commercial platform foundation for {p.organization.name}. One secure control plane, many isolated organisations.</p></div><div className="v3-version">{p.product.edition}</div></header>
  <section className="v3-grid v3-grid-top">
   <article className="v3-card"><div className="v3-icon"><Building2/></div><small>Organisation</small><h2>{p.organization.name}</h2><p>{p.organization.slug} · {p.organization.timezone}</p></article>
   <article className="v3-card"><div className="v3-icon"><CreditCard/></div><small>Commercial plan</small><h2>{p.plan?.planKey??'—'}</h2><p>Billing: {p.plan?.billingStatus??'not configured'}</p></article>
   <article className="v3-card"><div className="v3-icon"><Palette/></div><small>Brand</small><h2>{p.branding?.displayName??p.organization.name}</h2><p>Theme: {p.branding?.theme??'dark'}</p></article>
   <article className={`v3-card ${r.releaseReady?'v3-ready':'v3-pending'}`}><div className="v3-icon"><ShieldCheck/></div><small>Commercial release</small><h2>{r.releaseReady?'Ready':'Gated'}</h2><p>{r.gates.filter(g=>g.status!=="pass").length} release gates remain</p></article>
  </section>
  <section className="v3-grid v3-grid-main">
   <article className="v3-panel"><div className="v3-panel-head"><div><small>Onboarding</small><h2>Path to first value</h2></div><Link href="/team?hire=1" className="v3-action"><Bot/> Employ AI team member</Link></div><div className="v3-checks">{checks.map(([label,done])=><div key={label}>{done?<CheckCircle2 className="ok"/>:<CircleDashed/>}<span>{label}</span><b>{done?'Complete':'Required'}</b></div>)}</div></article>
   <article className="v3-panel"><div className="v3-panel-head"><div><small>Security & isolation</small><h2>Release gates</h2></div></div><div className="v3-gates">{r.gates.map(g=><div key={g.key} className={`gate-${g.status}`}><span className="gate-dot"/><div><strong>{g.label}</strong><p>{g.detail}</p></div><b>{g.status}</b></div>)}</div></article>
  </section>
 </div>
}

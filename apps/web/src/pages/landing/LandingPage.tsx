import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, FileCheck, Shield, Users } from 'lucide-react';

/**
 * Public marketing landing page.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-base">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-black" aria-hidden="true" />
            </div>
            <span className="font-bold text-xl">ApexLedger</span>
          </div>
          <Link to="/login" className="btn-primary text-sm py-2 px-5">
            Sign In
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <p className="text-accent text-sm font-semibold uppercase tracking-wider mb-4">
          Partner Investment Intelligence
        </p>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 max-w-3xl mx-auto leading-tight">
          Track every rupee. Settle every venture.
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto mb-10">
          Trucks, cars, plots, jamin — one platform for partner contributions, proof uploads,
          and fair settlement. No more spreadsheet chaos.
        </p>
        <Link
          to="/login"
          className="btn-primary inline-flex items-center gap-2 text-lg"
        >
          Get Started
          <ArrowRight className="w-5 h-5" aria-hidden="true" />
        </Link>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        {[
          {
            icon: Users,
            title: 'Multi-Partner Projects',
            desc: 'Assign partners to trucks, cars, plots. Everyone sees who invested what.',
          },
          {
            icon: FileCheck,
            title: 'Proof & Documents',
            desc: 'Upload bank screenshots and receipts. Download anytime.',
          },
          {
            icon: Shield,
            title: 'Fair Settlement',
            desc: 'Automatic fair-share math. Know exactly who owes whom.',
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card text-left">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <Icon className="w-6 h-6 text-accent" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-muted text-sm">{desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-muted text-sm">
        © {new Date().getFullYear()} ApexLedger. Partner finance, simplified.
      </footer>
    </div>
  );
}
